vi.mock("../src/server/jev/strategies/visual-authoring", () => ({
  selectAuthoringResources: async () => ({
    source: "jev",
    model: "jev-test",
    selectedIds: ["local_code"],
    decisions: [],
  }),
}));
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/catalog/style-summaries", async (original) => ({
  ...(await original<typeof import("../src/server/catalog/style-summaries")>()),
  prepareStyleSummaries: vi.fn(),
}));
vi.mock("../src/server/jev/strategies/style-combination", () => ({ rankOptions: vi.fn() }));
vi.mock("../src/server/jev/client", () => ({ jevClient: vi.fn() }));
vi.mock("../src/server/domains/video/prepare-lyrics", () => ({ prepareLyrics: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { prepareStyleSummaries } from "../src/server/catalog/style-summaries";
import { rankOptions } from "../src/server/jev/strategies/style-combination";
import { jevClient } from "../src/server/jev/client";
import { prepareLyrics } from "../src/server/domains/video/prepare-lyrics";
import { loadCatalog } from "../src/server/catalog/catalog";
import { Store } from "../src/server/jobs/store";
import { Workflow } from "../src/server/jobs/workflow";
import {
  initializePreparation,
  preparationCheckpoint,
} from "../src/server/jobs/preparation-checkpoints";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { preparationSteps } from "../src/shared/preparation";
import { dataRoot } from "../src/server/runtime/config";
import { textModels, combinationModels } from "../src/server/agents/models";

beforeEach(() => vi.clearAllMocks());
const brief = {
  subject: "Product",
  audience: "Creators",
  objective: "Explain",
  facts: [],
  exactCopy: [],
  previewBeat: "A shape unfolds",
  assetDescriptions: [],
  constraints: [],
  suggestedDuration: 15,
  durationReason: "A short story",
};
const proposal = {
  primaryStyleId: "style-108",
  supportingStyleIds: ["style-018"],
  sceneRoles: ["Primary identity", "Supporting motion"],
  rationale: "A clear direction",
  displayTitle: "First Flight",
  displayDescription: "A clear journey follows an idea as it grows into a finished creation.",
  feasible: true,
  missingAssets: [],
};
const candidate = {
  ...proposal,
  id: "direction",
  score: 90,
  confidence: 0.9,
  dimensions: { relevance: 90 },
};
const newRun = (): Run => ({
  id: randomUUID(),
  createdAt: new Date().toISOString(),
  phase: "queued",
  request: RequestSchema.parse({
    instructions: "Explain a product",
    provider: "claude",
    lyrics: { mode: "write" },
  }),
  candidates: [],
  jobs: [],
});

it.each(["brief", "lyrics", "styles", "proposals", "selection"] as const)(
  "retries only unfinished work after %s fails, including after reopening the database",
  async (failedStep) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "preparation-checkpoints-"));
    const catalog = await loadCatalog();
    const run = newRun();
    let failing = true;
    const counts: Record<string, number> = {
      brief: 0,
      lyrics: 0,
      styles: 0,
      proposals: 0,
      selection: 0,
    };
    function attempt(step: string) {
      counts[step]++;
      if (failing && step === failedStep) throw Error(`${step} failed`);
    }
    vi.mocked(agentTurn).mockImplementation(async (options) => {
      const step = options.model === textModels.claude ? "brief" : "proposals";
      attempt(step);
      return {
        value: step === "brief" ? structuredClone(brief) : { options: [proposal] },
        sessionId: "completed-brief-session",
      };
    });
    vi.mocked(prepareLyrics).mockImplementation(async () => {
      attempt("lyrics");
      return { text: "A completed lyric", model: "text-model" };
    });
    vi.mocked(prepareStyleSummaries).mockImplementation(async () => {
      attempt("styles");
      return catalog.styles.map((style) => ({
        styleId: style.id,
        name: style.name_en,
        visualIdentity: "Identity",
        suitableUses: "Explain",
        limitations: "None",
        palette: "Palette",
        motionAndInteraction: "Reveal",
        audio: "Optional",
        assetRequirements: "Code",
        combinations: "Optional",
        productionApproach: "Motion Graphic led",
      }));
    });
    vi.mocked(rankOptions).mockImplementation(async () => {
      attempt("selection");
      return { model: "evaluation-model", candidates: [candidate] };
    });
    let store = new Store(path.join(folder, "jobs.sqlite"));
    try {
      await new Workflow(store, catalog).prepare(run);
      expect(run.phase).toBe("failed");
      expect(run.preparation?.checkpoints[failedStep]).toMatchObject({ state: "failed" });
      for (const step of preparationSteps.slice(0, preparationSteps.indexOf(failedStep)))
        expect(run.preparation?.checkpoints[step]).toMatchObject({ state: "completed" });
      const before = { ...counts };
      store.close();
      store = new Store(path.join(folder, "jobs.sqlite"));
      store.recover();
      const resumed = store.get(run.id)!;
      failing = false;
      const workflow = new Workflow(store, catalog);
      vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
        job.phase = "ready";
      });
      const prepare = vi.spyOn(workflow, "prepare");
      workflow.retry(resumed);
      await prepare.mock.results[0].value;
      expect(resumed.phase, resumed.error).toBe("ready");
      const proposalCall = vi
        .mocked(agentTurn)
        .mock.calls.find(([options]) => options.model === combinationModels.claude)?.[0];
      expect(proposalCall?.promptContext).toMatchObject({
        originalIdea: resumed.request.instructions,
      });
      expect(
        await readFile(path.resolve(proposalCall!.workspace, "DIRECTION_PLANNING.md"), "utf8"),
      ).toContain(
        "Creative result; Contributions; Advantages; Disadvantages; Compatibility and adaptation",
      );
      for (const step of preparationSteps)
        expect(resumed.preparation?.checkpoints[step]).toMatchObject({ state: "completed" });
      for (const step of preparationSteps.slice(1, preparationSteps.indexOf(failedStep)))
        expect(counts[step]).toBe(before[step]);
      expect(counts[failedStep]).toBe(before[failedStep] + 1);
      expect(resumed.brief?.exactCopy.filter((line) => line === "A completed lyric")).toHaveLength(
        1,
      );
      if (failedStep === "proposals") {
        expect(vi.mocked(agentTurn).mock.calls.at(-1)?.[0].sessionId).toBeUndefined();
      }
      if (failedStep === "selection") {
        const completedCounts = { ...counts };
        const existingJob = resumed.jobs[0];
        const prepareCalls = prepare.mock.calls.length;
        existingJob.phase = "failed";
        resumed.phase = "failed";
        workflow.retry(resumed);
        await vi.waitFor(() => expect(resumed.phase).toBe("ready"));
        expect(counts).toEqual(completedCounts);
        expect(prepare).toHaveBeenCalledTimes(prepareCalls);
        expect(resumed.jobs).toEqual([existingJob]);
        expect(workflow.generate).toHaveBeenLastCalledWith(resumed, existingJob);
      }
      if (failedStep !== "brief")
        expect(
          vi
            .mocked(agentTurn)
            .mock.calls.filter(([options]) => options.model === textModels.claude),
        ).toHaveLength(1);
    } finally {
      store.close();
      await rm(folder, { recursive: true, force: true });
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);

it("never reuses running, failed, interrupted or invalid outputs", async () => {
  const run = newRun();
  initializePreparation(run, run.request);
  const schema = z.object({ value: z.string().min(1) });
  const task = vi.fn(async () => ({ value: "complete" }));
  for (const state of ["running", "failed", "interrupted"] as const) {
    run.preparation!.checkpoints.brief =
      state === "running"
        ? { state, startedAt: "earlier" }
        : { state, finishedAt: "earlier", errorCode: "PREPARATION_FAILED" };
    await preparationCheckpoint({
      run,
      step: "brief",
      schema,
      task,
      signal: new AbortController().signal,
      save: () => {},
    });
  }
  run.preparation!.checkpoints.brief = {
    state: "completed",
    completedAt: "earlier",
    output: { value: "" },
  };
  await preparationCheckpoint({
    run,
    step: "brief",
    schema,
    task,
    signal: new AbortController().signal,
    save: () => {},
  });
  expect(task).toHaveBeenCalledTimes(4);
});
it("invalidates dependent checkpoints when a completed artifact disappears", async () => {
  const run = newRun();
  initializePreparation(run, run.request);
  for (const step of preparationSteps)
    run.preparation!.checkpoints[step] = {
      state: "completed",
      completedAt: "earlier",
      output: "cached",
    };
  const validate = vi
    .fn()
    .mockRejectedValueOnce(Error("Missing screenshot"))
    .mockResolvedValue(undefined);
  const result = await preparationCheckpoint({
    run,
    step: "brief",
    schema: z.string(),
    validate,
    task: async () => "new brief",
    signal: new AbortController().signal,
    save: () => {},
  });
  expect(result).toBe("new brief");
  expect(run.preparation!.checkpoints.inputs?.state).toBe("completed");
  expect(run.preparation!.checkpoints.proposals).toBeUndefined();
  expect(run.preparation!.checkpoints.selection).toBeUndefined();
});
it("persists immutable completed results and resets them when inputs change", async () => {
  const run = newRun();
  initializePreparation(run, run.request);
  const schema = z.object({ lines: z.array(z.string()) });
  const result = await preparationCheckpoint({
    run,
    step: "brief",
    schema,
    task: async () => ({ lines: ["original"] }),
    signal: new AbortController().signal,
    save: () => {},
  });
  result.lines.push("later work");
  expect(run.preparation!.checkpoints.brief).toMatchObject({
    state: "completed",
    output: { lines: ["original"] },
  });
  initializePreparation(run, { ...run.request, instructions: "Different inputs" });
  expect(run.preparation!.checkpoints).toEqual({});
});
it("does not mark a late result completed after cancellation, and recovers running states as interrupted", async () => {
  const run = newRun();
  initializePreparation(run, run.request);
  const controller = new AbortController();
  await expect(
    preparationCheckpoint({
      run,
      step: "brief",
      schema: z.string(),
      task: async () => {
        controller.abort();
        return "late result";
      },
      signal: controller.signal,
      save: () => {},
    }),
  ).rejects.toThrow();
  expect(run.preparation!.checkpoints.brief).toMatchObject({ state: "interrupted" });
  const store = new Store(":memory:");
  run.preparation!.checkpoints.inputs = {
    state: "completed",
    completedAt: "earlier",
    output: "inputs",
  };
  run.preparation!.checkpoints.brief = { state: "running", startedAt: "earlier" };
  run.phase = "preparing";
  store.save(run);
  store.recover();
  expect(store.get(run.id)?.preparation?.checkpoints.inputs?.state).toBe("completed");
  expect(store.get(run.id)?.preparation?.checkpoints.brief?.state).toBe("interrupted");
  store.close();
});

it.each(["claude", "codex"] as const)(
  "prepares Pica inspection copies before the %s brief model and preserves the production image",
  async (provider) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "brief-input-"));
    const run = newRun();
    run.request.provider = provider;
    run.request.lyrics = { mode: "off" };
    const id = randomUUID();
    run.request.assetIds = [id];
    const source = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: "#aabbcc" },
    })
      .png()
      .toBuffer();
    const sourcePath = path.join(folder, "reference.png");
    await writeFile(sourcePath, source);
    const store = new Store(":memory:");
    store.asset({
      id,
      name: `${id}.png`,
      originalName: "reference.png",
      path: sourcePath,
      kind: "image/png",
      bytes: source.length,
    });
    try {
      vi.mocked(agentTurn).mockImplementationOnce(async (options) => {
        const prompt = await readFile(
          path.resolve(options.workspace, "BRIEF_PREPARATION.md"),
          "utf8",
        );
        expect(options.model).toBe(textModels[provider]);
        expect(prompt).toContain("brief-images.json");
        expect(prompt).toContain("REQUIRED ATTACHMENT REVIEW");
        const attachments = JSON.parse(
          await readFile(path.join(options.workspace, "brief-attachments.json"), "utf8"),
        );
        expect(attachments.attachments[0]).toMatchObject({
          id,
          displayName: "reference.png",
          kind: "image",
          status: "image_available",
        });
        expect(prompt).toContain("never production assets");
        const manifest = JSON.parse(
          await readFile(path.join(options.workspace, "brief-images.json"), "utf8"),
        );
        expect(manifest.images[0]).toMatchObject({
          width: 2560,
          height: 1280,
          resizer: "pica/mks2013",
        });
        expect(
          await readFile(path.join(options.workspace, manifest.images[0].originalPath)),
        ).toEqual(source);
        expect(
          await sharp(
            await readFile(path.join(options.workspace, manifest.images[0].inspectionPath)),
          ).metadata(),
        ).toMatchObject({ width: 2560, height: 1280, format: "png" });
        throw Error("Stop after brief input verification");
      });
      await new Workflow(store, await loadCatalog()).prepare(run);
      expect(agentTurn).toHaveBeenCalledTimes(1);
      expect(run.error).toContain("Stop after brief input verification");
      expect(await readFile(sourcePath)).toEqual(source);
    } finally {
      store.close();
      await rm(folder, { recursive: true, force: true });
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);

it("manual styles use only title preparation before the full build", async () => {
  const run = newRun();
  run.request = RequestSchema.parse({
    instructions:
      "Explain a product. Credits: Avery (AV) — Engineering: built the application. Closing copy: Make ideas move.",
    provider: "claude",
    duration: 60,
    candidateCount: 0,
    selectedStyleIds: ["style-108", "style-018"],
  });
  vi.mocked(agentTurn).mockResolvedValue({
    value: { subject: "A product story" },
    sessionId: "title-only",
  });
  const workflow = new Workflow(new Store(":memory:"), await loadCatalog());
  const generate = vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
    await workflow["setup"](run, job, new AbortController().signal);
    const context = JSON.parse(
      await readFile(path.join(job.workspace, "style-context.json"), "utf8"),
    );
    expect(context).not.toHaveProperty("styles");
    expect(context.request.selectedStyleIds).toEqual(["style-108", "style-018"]);
    expect(context.candidate).toMatchObject({
      primaryStyleId: "style-108",
      supportingStyleIds: ["style-018"],
    });
    expect(context.request).toEqual(run.request);
    expect(context.request.instructions).toContain(
      "Avery (AV) — Engineering: built the application",
    );
    expect(context.brief).toEqual(run.brief);
    expect(context.brief.objective).toBe(run.request.instructions);
    expect(run.preparation?.checkpoints.brief).toMatchObject({
      state: "completed",
      output: { variant: "title-only", value: { subject: "A product story" } },
    });
    expect(context.brief.subject).toBe("A product story");
    expect(context.production_policy).toEqual(workflow.catalog.production_policy);
    expect(context).not.toHaveProperty("motions");
    expect(context.motionIds).toEqual(workflow.catalog.motions.map((motion) => motion.id));
    job.phase = "ready";
  });
  try {
    await workflow.prepare(run);
    expect(run.phase, run.error).toBe("ready");
    expect(agentTurn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(agentTurn).mock.calls[0][0]).toMatchObject({
      model: textModels.claude,
      textOnly: true,
      readOnly: true,
    });
    expect(jevClient).not.toHaveBeenCalled();
    expect(prepareStyleSummaries).not.toHaveBeenCalled();
    expect(rankOptions).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(run.jobs[0]).toMatchObject({ kind: "full", duration: 60 });
    expect(run.jobs[0].sessionId).toBeUndefined();
    await workflow.prepare(run);
    expect(run.phase, run.error).toBe("ready");
    expect(agentTurn).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(run.candidates[0]).toMatchObject({
      primaryStyleId: "style-108",
      supportingStyleIds: ["style-018"],
    });
  } finally {
    await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
  }
});

it("regenerates the chosen count in fresh sessions and extends the selected round's preview session", async () => {
  const run = newRun();
  run.request = RequestSchema.parse({
    instructions: "Explain a product",
    provider: "claude",
    candidateCount: 2,
    duration: 30,
  });
  const catalog = await loadCatalog();
  vi.mocked(agentTurn).mockImplementation(async (options) => ({
    value: options.model === textModels.claude ? brief : { options: [proposal] },
    sessionId: randomUUID(),
  }));
  vi.mocked(prepareStyleSummaries).mockResolvedValue(
    catalog.styles.map((s) => ({
      styleId: s.id,
      name: s.name_en,
      visualIdentity: "Identity",
      suitableUses: "Explain",
      limitations: "None",
      palette: "Palette",
      motionAndInteraction: "Reveal",
      audio: "Optional",
      assetRequirements: "Code",
      combinations: "Optional",
      productionApproach: "Motion Graphic led",
    })),
  );
  vi.mocked(rankOptions).mockResolvedValue({
    model: "test",
    candidates: [candidate, { ...candidate, id: "second" }],
  });
  const store = new Store(":memory:");
  const previous = newRun();
  previous.brief = { ...brief };
  previous.candidates = [{ ...candidate }];
  previous.jobs = ["preview", "full"].map((kind) => ({
    id: `${previous.id}-${kind}`,
    runId: previous.id,
    candidateId: candidate.id,
    kind: kind as "preview" | "full",
    phase: "ready",
    outputType: "video",
    duration: kind === "preview" ? 3 : 30,
    workspace: "/tmp/history",
    model: "claude-opus-5-5",
  }));
  store.save(previous);
  const workflow = new Workflow(store, catalog);
  const generate = vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
    if (job.kind === "preview") {
      expect(job.sessionId).toBeUndefined();
      job.sessionId = `session-${job.id}`;
    }
    await (await import("node:fs/promises")).mkdir(job.workspace, { recursive: true });
    job.phase = "ready";
  });
  try {
    await workflow.prepare(run);
    const firstPreview = run.jobs[0];
    for (let round = 1; round <= 3; round++) {
      const afterEventId = store.lastEventId(run.id);
      const { proposals, selection } = run.preparation!.checkpoints;
      expect(proposals?.state).toBe("completed");
      await workflow.regenerateDirections(run);
      expect(run.directionRounds).toHaveLength(round);
      expect(run.directionRounds!.at(-1)).toEqual({
        round,
        startedAt: expect.any(String),
        afterEventId,
        replacedCheckpoints: { proposals, selection },
      });
      expect(afterEventId).toBeGreaterThan(run.directionRounds![round - 2]?.afterEventId ?? 0);
      expect(run.phase, run.error).toBe("ready");
      expect(run.request.candidateCount).toBe(2);
      expect(run.jobs.filter((job) => job.kind === "preview")).toHaveLength((round + 1) * 2);
      expect(new Set(run.candidates.map((entry) => entry.id)).size).toBe(run.candidates.length);
    }
    const full = await workflow.full(run, firstPreview.candidateId);
    expect(full.sessionId).toBe(firstPreview.sessionId);
    const lastPreview = run.jobs.filter((job) => job.kind === "preview").at(-1)!;
    await vi.waitFor(() => expect(run.phase).toBe("ready"));
    const lastFull = await workflow.full(run, lastPreview.candidateId);
    await vi.waitFor(() => expect(run.phase).toBe("ready"));
    expect(lastFull.sessionId).toBe(lastPreview.sessionId);
    const proposals = vi
      .mocked(agentTurn)
      .mock.calls.filter(([options]) => options.model !== textModels.claude);
    expect(proposals).toHaveLength(4);
    expect(proposals.every(([options]) => !options.sessionId)).toBe(true);
    for (const call of vi.mocked(rankOptions).mock.calls) {
      expect(call[7]).toHaveLength(1);
      expect(call[7]?.[0]).toMatchObject({ projectId: previous.id, candidateId: candidate.id });
    }
    expect(prepareStyleSummaries).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(10);
  } finally {
    store.close();
    await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
  }
});

it("refuses regeneration during active work or for direct builds", async () => {
  const workflow = new Workflow(new Store(":memory:"), await loadCatalog());
  const run = newRun();
  run.phase = "generating";
  expect(() => workflow.regenerateDirections(run)).toThrow("Wait for the current work");
  run.phase = "ready";
  run.request = RequestSchema.parse({
    instructions: "Explain a product",
    candidateCount: 0,
    selectedStyleIds: ["style-018"],
  });
  expect(() => workflow.regenerateDirections(run)).toThrow(
    "Direct builds do not use preview directions",
  );
  expect(agentTurn).not.toHaveBeenCalled();
});

it.each(["claude", "codex"] as const)(
  "hands uploads and URLs to the %s direct-build planner with title-only preparation",
  async (provider) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "direct-build-inputs-"));
    const run = newRun();
    const documentId = randomUUID();
    const imageId = randomUUID();
    const store = new Store(":memory:");
    const document = path.join(folder, "notes.txt");
    const image = path.join(folder, "reference.png");
    await writeFile(document, "Exact closing line: Make ideas move.");
    await sharp({ create: { width: 100, height: 100, channels: 3, background: "#aabbcc" } })
      .png()
      .toFile(image);
    store.asset({
      id: documentId,
      name: `${documentId}.txt`,
      originalName: "notes.txt",
      path: document,
      kind: "text/plain",
      bytes: 40,
    });
    store.asset({
      id: imageId,
      name: `${imageId}.png`,
      originalName: "reference.png",
      path: image,
      kind: "image/png",
      bytes: 200,
    });
    run.request = RequestSchema.parse({
      instructions: "Use my references and original closing line.",
      provider,
      selectedStyleIds: ["style-018"],
      candidateCount: 0,
      duration: 60,
      assetIds: [documentId, imageId],
      urls: ["http://127.0.0.1:4320/example"],
    });
    vi.mocked(agentTurn).mockResolvedValue({ value: { subject: "An original product story" } });
    const workflow = new Workflow(store, await loadCatalog());
    vi.spyOn(workflow, "generate").mockImplementation(async (_, job) => {
      await workflow["setup"](run, job, new AbortController().signal);
      const context = JSON.parse(
        await readFile(path.join(job.workspace, "style-context.json"), "utf8"),
      );
      expect(context.request).toEqual(run.request);
      expect(context.assetInputs.map((asset: { id: string }) => asset.id)).toEqual([
        documentId,
        imageId,
      ]);
      const attachments = JSON.parse(
        await readFile(path.join(job.workspace, "brief-attachments.json"), "utf8"),
      );
      expect(attachments.attachments).toHaveLength(2);
      const document = attachments.attachments.find(
        (asset: { id: string }) => asset.id === documentId,
      );
      expect(await readFile(path.join(job.workspace, document.textPath), "utf8")).toBe(
        "Exact closing line: Make ideas move.",
      );
      job.phase = "ready";
    });
    try {
      await workflow.prepare(run);
      expect(run.phase, run.error).toBe("ready");
      expect(agentTurn).toHaveBeenCalledTimes(1);
      expect(vi.mocked(agentTurn).mock.calls[0][0]).toMatchObject({
        provider,
        model: textModels[provider],
        textOnly: true,
        readOnly: true,
      });
      expect(jevClient).not.toHaveBeenCalled();
      expect(run.preparation?.checkpoints.brief).toMatchObject({
        state: "completed",
        output: { variant: "title-only" },
      });
    } finally {
      store.close();
      await rm(folder, { recursive: true, force: true });
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);
