vi.mock("../src/server/agents/authoring-resources", () => ({
  selectAuthoringResources: async () => ({
    source: "jev",
    model: "jev-test",
    selectedIds: ["local_code"],
    decisions: [],
  }),
}));
import { validStoryboard } from "./fixtures/storyboard";
import { it, expect, vi } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataRoot, models } from "../src/server/runtime/config";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/rendering/render", () => ({
  renderJob: vi.fn(async () => ({ video: "renders/preview.mp4", poster: "renders/preview.jpg" })),
}));
import { Workflow } from "../src/server/jobs/workflow";
import { Store } from "../src/server/jobs/store";
import { loadCatalog } from "../src/server/catalog/catalog";
import { agentTurn } from "../src/server/agents/providers";
import { renderJob } from "../src/server/rendering/render";
import { RequestSchema, type Run } from "../src/shared/contracts";
it("shares five parallel workflow slots and queues the sixth task", async () => {
  const workflow = new Workflow(new Store(":memory:"), await loadCatalog());
  let active = 0;
  let maximumActive = 0;
  let started = 0;
  const releases: Array<() => void> = [];
  const tasks = Array.from({ length: 6 }, () =>
    workflow["agents"].run(async () => {
      started++;
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
    }),
  );
  await vi.waitFor(() => expect(started).toBe(5));
  expect(active).toBe(5);
  releases.shift()!();
  await vi.waitFor(() => expect(started).toBe(6));
  expect(maximumActive).toBe(5);
  releases.forEach((release) => release());
  await Promise.all(tasks);
  expect(active).toBe(0);
});
it.each(["claude", "codex"] as const)(
  "routes new %s previews through the selected main model",
  async (provider) => {
    const workflow = new Workflow(new Store(":memory:"), await loadCatalog());
    const run: Run = {
      id: "project",
      createdAt: new Date().toISOString(),
      phase: "preparing",
      request: RequestSchema.parse({ instructions: "A shape unfolds into a kite", provider }),
      candidates: [],
      jobs: [],
    };
    const candidate: Run["candidates"][number] = {
      id: "direction",
      primaryStyleId: "style-018",
      supportingStyleIds: [],
      score: 80,
      confidence: 0.8,
      dimensions: { relevance: 80, clarity: 80, creativity: 80, feasibility: 80 },
      sceneRoles: ["Unfold"],
      rationale: "A clear folding shape",
      feasible: true,
      missingAssets: [],
    };
    const preview = workflow["newJob"](run, candidate, "preview", 3);
    expect(preview).toMatchObject({ kind: "preview", duration: 3, model: models[provider] });
    run.request = RequestSchema.parse({
      instructions: "A shape unfolds into a kite",
      provider,
      mainModel: "gpt-6-astra",
    });
    for (const kind of ["preview", "full"] as const) {
      expect(workflow["newJob"](run, candidate, kind, 3).model).toBe("gpt-6-astra");
    }
  },
);
it.each([0, 1, 2])(
  "extends selected preview %i with its own session and assets into at least fifteen seconds",
  async (selectedIndex) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "video-duration-"));
    const store = new Store(":memory:");
    const run: Run = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      phase: "ready",
      request: RequestSchema.parse({ instructions: "Tell a visual story" }),
      brief: {
        subject: "Ideas",
        audience: "General",
        objective: "Explain",
        facts: [],
        exactCopy: [],
        previewBeat: "Blocks connect",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 3,
        durationReason: "Short beat",
      },
      candidates: [
        {
          id: "candidate",
          primaryStyleId: "style-108",
          supportingStyleIds: [],
          score: 80,
          dimensions: { relevance: 80, clarity: 80, creativity: 80, feasibility: 80 },
          confidence: 0.8,
          sceneRoles: ["Assembly"],
          rationale: "Useful",
          feasible: true,
          missingAssets: [],
        },
      ],
      jobs: [
        {
          id: "preview",
          runId: "test",
          candidateId: "candidate",
          kind: "preview",
          phase: "ready",
          workspace,
          model: "test",
          duration: 3,
          sessionId: "approved-session",
        },
      ],
    };
    const candidateTemplate = run.candidates[0];
    const previewTemplate = run.jobs[0];
    run.candidates = [];
    run.jobs = [];
    for (const index of [0, 1, 2]) {
      const candidateId = `candidate-${index}`;
      const previewWorkspace = path.join(workspace, `preview-${index}`);
      await mkdir(previewWorkspace);
      await writeFile(path.join(previewWorkspace, "approved-design.txt"), `design-${index}`);
      run.candidates.push({ ...candidateTemplate, id: candidateId });
      run.jobs.push({
        ...previewTemplate,
        id: `preview-${index}`,
        candidateId,
        workspace: previewWorkspace,
        sessionId: `approved-session-${index}`,
      });
    }
    try {
      const workflow = new Workflow(store, await loadCatalog());
      vi.spyOn(workflow, "generate").mockResolvedValue(undefined);
      const full = await workflow.full(run, `candidate-${selectedIndex}`);
      expect(full.duration).toBe(15);
      expect(full.model).toBe("gpt-6.1-sol");
      expect(full.sessionId).toBe(`approved-session-${selectedIndex}`);
      expect(full.candidateId).toBe(`candidate-${selectedIndex}`);
      expect(run.winnerId).toBe(`candidate-${selectedIndex}`);
      expect(await readFile(path.join(full.workspace, "approved-design.txt"), "utf8")).toBe(
        `design-${selectedIndex}`,
      );
      expect(
        run.jobs.filter((job) => job.kind === "preview").every((job) => job.phase === "ready"),
      ).toBe(true);
      expect(await workflow.full(run, `candidate-${selectedIndex}`)).toBe(full);
      expect(workflow.generate).toHaveBeenCalledTimes(1);
      full.phase = "ready";
      const alternateIndex = (selectedIndex + 1) % 3;
      const alternate = await workflow.full(run, `candidate-${alternateIndex}`);
      expect(run.winnerId).toBe(`candidate-${alternateIndex}`);
      expect(alternate.sessionId).toBe(`approved-session-${alternateIndex}`);
      expect(await readFile(path.join(alternate.workspace, "approved-design.txt"), "utf8")).toBe(
        `design-${alternateIndex}`,
      );
      alternate.phase = "ready";
      expect(await workflow.full(run, `candidate-${selectedIndex}`)).toBe(full);
      expect(run.winnerId).toBe(`candidate-${selectedIndex}`);
      expect(run.phase).toBe("ready");
      expect(workflow.generate).toHaveBeenCalledTimes(2);
      expect(run.jobs[0].duration).toBe(3);
      expect(workflow.generate).toHaveBeenCalledWith(run, full, undefined);
    } finally {
      store.close();
      await rm(workspace, { recursive: true, force: true });
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);
it("retries interrupted rendering without repeating a completed provider turn", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "video-retry-"));
  const store = new Store(":memory:");
  try {
    const run: Run = {
      id: "run",
      createdAt: new Date().toISOString(),
      phase: "interrupted",
      request: RequestSchema.parse({ instructions: "Explain assembly" }),
      brief: {
        subject: "Assembly",
        audience: "General",
        objective: "Explain",
        facts: [],
        exactCopy: [],
        previewBeat: "Blocks connect",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 30,
        durationReason: "Three steps",
      },
      candidates: [
        {
          id: "candidate",
          primaryStyleId: "style-108",
          supportingStyleIds: [],
          score: 80,
          dimensions: { relevance: 80, clarity: 80, creativity: 80, feasibility: 80 },
          confidence: 0.8,
          sceneRoles: ["Assembly"],
          rationale: "Useful",
          feasible: true,
          missingAssets: [],
        },
      ],
      jobs: [
        {
          id: "job",
          runId: "run",
          candidateId: "candidate",
          kind: "preview",
          phase: "interrupted",
          workspace,
          model: "test",
          duration: 3,
          sessionId: "session",
          production: {
            pipeline: "HyperFrames",
            fallbackReason: null,
            styleRenderer: ["Three.js"],
            motionEngine: ["GSAP"],
            sourceFile: "index.html",
            duration: 3,
            width: 1280,
            height: 720,
            audioDescription: "Silent",
            limitations: [],
          },
        },
      ],
    };
    const workflow = new Workflow(store, await loadCatalog());
    await writeFile(path.join(workspace, "STORYBOARD.json"), JSON.stringify(validStoryboard()));
    workflow.retry(run);
    expect(workflow.hasActiveTasks(run)).toBe(true);
    await vi.waitFor(() => expect(workflow.hasActiveTasks(run)).toBe(false));
    expect(workflow.hasActiveTasks(run)).toBe(false);
    expect(agentTurn).not.toHaveBeenCalled();
    expect(renderJob).toHaveBeenCalledOnce();
    expect(run.jobs[0].phase).toBe("ready");
    expect(
      JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8")).dependencies.three,
    ).toBeTruthy();
    expect(
      JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8")).dependencies.pica,
    ).toBeTruthy();
    expect(await readFile(path.join(workspace, "vendor/pica.min.js"), "utf8")).toContain(
      "https://github.com/nodeca/pica",
    );
    expect(run.jobs[0].sessionId).toBe("session");
    expect(run.jobs[0].renderMs).toBeGreaterThanOrEqual(0);
    expect(run.jobs[0].authoringResources).toBeUndefined();
    const manifest = run.jobs[0].production!;
    run.jobs[0].production = undefined;
    run.jobs[0].model = "gpt-6-luna";
    vi.mocked(agentTurn).mockResolvedValueOnce({
      value: { ...manifest, storyboard: validStoryboard() },
      sessionId: "session",
    });
    await writeFile(path.join(workspace, "STORYBOARD.json"), '{"content":"untrusted agent file"}');
    await workflow.generate(run, run.jobs[0]);
    expect(JSON.parse(await readFile(path.join(workspace, "STORYBOARD.json"), "utf8"))).toEqual(
      validStoryboard(),
    );
    expect(run.jobs[0].production).not.toHaveProperty("storyboard");
    expect(run.jobs[0].authoringResources).toMatchObject({
      source: "jev",
      selectedIds: ["local_code"],
    });
    expect(
      JSON.parse(await readFile(path.join(workspace, "style-context.json"), "utf8"))
        .authoringResources,
    ).toEqual(run.jobs[0].authoringResources);

    expect(agentTurn).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-6-luna" }));
    run.phase = "interrupted";
    run.jobs[0].phase = "interrupted";
    vi.spyOn(workflow, "generate").mockImplementationOnce(async (_run, job) => {
      job.phase = "ready";
    });
    workflow.retry(run, run.jobs[0].id);
    expect(run.phase).toBe("generating");
    await Promise.resolve();
    expect(run.phase).toBe("ready");
  } finally {
    store.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

it.each(["failed", "interrupted", "cancelled"] as const)(
  "project retry resumes existing %s jobs without creating new versions",
  async (phase) => {
    const store = new Store(":memory:");
    try {
      const workflow = new Workflow(store, await loadCatalog());
      const run: Run = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        phase,
        request: RequestSchema.parse({
          instructions: "Show a shape unfolding",
          selectedStyleIds: ["style-018"],
          candidateCount: 0,
        }),
        candidates: [
          {
            id: "direction",
            primaryStyleId: "style-018",
            supportingStyleIds: [],
            sceneRoles: [],
            rationale: "A shape unfolds",
            feasible: true,
            missingAssets: [],
            score: 80,
            confidence: 0.8,
            dimensions: {},
          },
        ],
        jobs: [],
      };
      const candidate = run.candidates[0];
      for (const kind of ["preview", "full"] as const) {
        const job = workflow["newJob"](run, candidate, kind, 30);
        Object.assign(job, { phase, sessionId: `${kind}-session`, error: "Stopped" });
        run.jobs.push(job);
      }
      // Older attempts must not resume alongside the current version.
      run.jobs.unshift({ ...run.jobs[1], id: "superseded" });
      const before = structuredClone(run);
      const prepare = vi.spyOn(workflow, "prepare").mockResolvedValue();
      const generate = vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
        job.phase = "ready";
      });
      workflow.retry(run);
      await vi.waitFor(() => expect(run.phase).toBe("ready"));
      expect(prepare).not.toHaveBeenCalled();
      expect(generate).toHaveBeenCalledTimes(2);
      expect(run.candidates).toEqual(before.candidates);
      expect(
        run.jobs.map(({ id, candidateId, workspace, sessionId }) => ({
          id,
          candidateId,
          workspace,
          sessionId,
        })),
      ).toEqual(
        before.jobs.map(({ id, candidateId, workspace, sessionId }) => ({
          id,
          candidateId,
          workspace,
          sessionId,
        })),
      );
      expect(run.jobs[0].phase).toBe(phase);
      expect(run.jobs.slice(1).every((job) => !job.error)).toBe(true);
      expect(store.get(run.id)?.jobs).toHaveLength(3);
      run.phase = "failed";
      run.error = "Brief preparation failed";
      workflow.retry(run);
      expect(prepare).toHaveBeenCalledOnce();
      expect(generate).toHaveBeenCalledTimes(2);
      run.error = undefined;
      run.jobs = [];
      workflow.retry(run);
      expect(prepare).toHaveBeenCalledTimes(2);
    } finally {
      store.close();
    }
  },
);

it("records correction governance without replacing the main generation session", async () => {
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run: Run = {
    id: "project",
    createdAt: new Date().toISOString(),
    phase: "generating",
    request: RequestSchema.parse({ instructions: "Show a shape unfolding" }),
    candidates: [],
    jobs: [],
  };
  const job = workflow["newJob"](
    run,
    {
      id: "direction",
      primaryStyleId: "style-018",
      supportingStyleIds: [],
      sceneRoles: [],
      rationale: "A shape unfolds",
      feasible: true,
      missingAssets: [],
      score: 80,
      confidence: 0.8,
      dimensions: {},
    },
    "preview",
    3,
  );
  job.sessionId = "main-session";
  run.jobs.push(job);
  store.save(run);
  const callback = workflow["providerEvent"](run, job);
  callback({
    type: "session",
    message: "Opened",
    data: { sessionId: "cheap-session", correctionFocus: "layout", correctionTier: "cheap" },
  });
  callback({
    type: "usage",
    message: "Complete",
    data: {
      model: "gpt-6-luna",
      invocationId: "correction-call",
      correctionFocus: "layout",
      correctionTier: "cheap",
    },
  });
  expect(store.get(run.id)?.jobs[0].sessionId).toBe("main-session");
  expect(store.allEvents(run.id).at(-1)?.data).toMatchObject({
    purpose: "layout correction",
    model: "gpt-6-luna",
  });
  callback({
    type: "session",
    message: "Resumed",
    data: { sessionId: "main-session", correctionFocus: "pacing", correctionTier: "main" },
  });
  expect(store.get(run.id)?.jobs[0].sessionId).toBe("main-session");
});

it("persists separate questions for each result and deduplicates only within that scope", async () => {
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run: Run = {
    id: "scoped-questions",
    phase: "preparing",
    createdAt: "now",
    request: RequestSchema.parse({ instructions: "An original film" }),
    candidates: [],
    jobs: [],
  };
  const need = {
    kind: "reference" as const,
    cause: "tool-capability" as const,
    reason: "Renderer unavailable",
    question: "Use an approximation?",
    fallback: "Use code",
  };
  workflow["recordAssetNeeds"](run, [{ assetNeeds: [need] }]);
  workflow["recordAssetNeeds"](run, [{ assetNeeds: [need] }], "preview-a");
  workflow["recordAssetNeeds"](run, [{ assetNeeds: [need] }], "preview-b");
  workflow["recordAssetNeeds"](run, [{ assetNeeds: [need] }], "preview-a");
  expect(store.get(run.id)?.assetQuestions?.map((q) => q.jobId)).toEqual([
    undefined,
    "preview-a",
    "preview-b",
  ]);
  workflow.answerAssetQuestion(run, run.assetQuestions![1].id, {
    answer: "Use flat shading",
    assetIds: [],
  });
  expect(run.assetQuestions?.map((q) => q.state)).toEqual(["open", "answered", "open"]);
  store.close();
});

it("records preview planning separately while retaining its session for generation and full builds", async () => {
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run: Run = {
    id: "planning-governance",
    phase: "generating",
    createdAt: "now",
    request: RequestSchema.parse({ instructions: "An original film", provider: "codex" }),
    candidates: [],
    jobs: [],
  };
  const job = {
    id: "preview-plan",
    runId: run.id,
    candidateId: "direction",
    kind: "preview" as const,
    phase: "generating" as const,
    workspace: "/tmp/preview-plan",
    model: "gpt-6.1-sol",
    duration: 3,
  };
  run.jobs.push(job);
  const receive = workflow["providerEvent"](run, job);
  receive({
    type: "session",
    message: "Planning opened",
    data: { sessionId: "shared-preview-session", videoBuildPlanning: true },
  });
  receive({
    type: "invocation",
    message: "Plan",
    data: { model: "gpt-6.1-sol", invocationId: "plan", videoBuildPlanning: true },
  });
  receive({
    type: "usage",
    message: "Plan complete",
    data: {
      model: "gpt-6.1-sol",
      invocationId: "plan",
      input_tokens: 100,
      output_tokens: 20,
      videoBuildPlanning: true,
    },
  });
  receive({
    type: "invocation",
    message: "Build",
    data: { model: "gpt-6.1-sol", invocationId: "build" },
  });
  const events = store.allEvents(run.id);
  expect(events.map((event) => (event.data as { purpose: string }).purpose)).toEqual([
    "Preview video planning",
    "Preview video planning",
    "Preview video planning",
    "preview video generation",
  ]);
  expect(store.get(run.id)?.jobs[0].sessionId).toBe("shared-preview-session");
  const { projectGovernance } = await import("../src/server/governance/report");
  const report = projectGovernance(run, events);
  expect(report.activity.find((row) => row.purpose === "Preview video planning")).toMatchObject({
    calls: 1,
    inputTokens: 100,
    outputTokens: 20,
  });
  expect(report.activity.find((row) => row.purpose === "preview video generation")).toMatchObject({
    calls: 1,
  });
  store.close();
});
