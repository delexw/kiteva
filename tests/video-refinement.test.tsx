import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { BriefSchema, RequestSchema, type Run } from "../src/shared/contracts";
import { Workflow } from "../src/server/jobs/workflow";
import { Store } from "../src/server/jobs/store";
import { loadCatalog } from "../src/server/catalog/catalog";
import { dataRoot } from "../src/server/runtime/config";
import { VideoRefinement } from "../src/client/components/video-refinement";
import { buildVideoPrompt } from "../src/server/domains/video/prompts";
import sharp from "sharp";
import { VideoRefinementRequestSchema } from "../src/shared/domains/video";
const candidate = {
  id: "chosen",
  primaryStyleId: "style-018",
  supportingStyleIds: [],
  sceneRoles: ["Identity"],
  rationale: "Selected",
  feasible: true,
  missingAssets: [],
  score: 0,
  confidence: 0,
  dimensions: {},
};
function project(workspace: string): Run {
  const id = randomUUID();
  return {
    id,
    createdAt: new Date().toISOString(),
    phase: "ready",
    request: RequestSchema.parse({ instructions: "Tell a visual story", duration: 30 }),
    brief: {
      subject: "Ideas",
      audience: "Creators",
      objective: "Explain",
      facts: [],
      exactCopy: [],
      previewBeat: "Unfold",
      assetDescriptions: [],
      constraints: [],
      suggestedDuration: 30,
      durationReason: "Story",
    },
    candidates: [candidate],
    jobs: [
      {
        id: "full-original",
        runId: id,
        candidateId: candidate.id,
        kind: "full",
        phase: "ready",
        workspace,
        sessionId: "full-session",
        model: "gpt-6.1-sol",
        duration: 30,
        video: "renders/full.mp4",
      },
    ],
  };
}
it.each(["claude", "codex"] as const)(
  "%s fine-tuning resumes the full-video session rather than the preview and preserves every version",
  async (provider) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "refinement-"));
    const run = project(workspace);
    run.request.provider = provider;
    run.jobs[0].model = `${provider}-full-model`;
    run.jobs[0].authoringResources = {
      source: "jev",
      selectedIds: ["existing-capability"],
      decisions: [],
    };
    run.jobs[0].audioAuthoring = { source: "skipped", decisions: [] };
    const originalVideo = run.jobs[0];
    if (originalVideo.outputType === "page") throw Error("Expected video");
    run.jobs.push({
      ...originalVideo,
      id: "preview",
      kind: "preview",
      duration: 3,
      sessionId: "preview-only-session",
      model: `${provider}-preview-model`,
    });
    const store = new Store(":memory:");
    const imageId = randomUUID();
    const imagePath = path.join(workspace, "reference.png");
    const image = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await writeFile(imagePath, image);
    store.asset({
      id: imageId,
      name: `${imageId}.png`,
      originalName: "example.png",
      path: imagePath,
      kind: "image/png",
      bytes: image.length,
    });
    const workflow = new Workflow(store, await loadCatalog());
    const generate = vi
      .spyOn(workflow, "generate")
      .mockImplementation(async (_run, job, feedback) => {
        expect(feedback).toBe(job.refinementPrompt);
        expect(job.production).toBeUndefined();
        if (job.outputType === "page") throw Error("Expected video");
        expect(job.refinementCheckpoint).toMatchObject({
          sourceJobId: "full-original",
          sourceSessionId: "full-session",
          sourcePhase: "ready",
          workspace: job.workspace,
        });
        expect(job.sessionId).toBe("full-session");
        expect(job.sessionId).not.toBe("preview-only-session");
        expect(job.model).toBe(`${provider}-full-model`);
        expect(job.authoringResources).toEqual(originalVideo.authoringResources);
        expect(job.audioAuthoring).toEqual(originalVideo.audioAuthoring);
        expect(job.authoringResources).not.toBe(originalVideo.authoringResources);
        await writeFile(path.join(job.workspace, "index.html"), "refined composition");
        job.phase = "ready";
      });
    try {
      await writeFile(path.join(workspace, "index.html"), "original composition");
      await mkdir(path.join(workspace, "renders"));
      await writeFile(path.join(workspace, "renders/full.mp4"), "original export");
      const source = structuredClone(run.jobs[0]);
      const revised = await workflow.refineVideo(run, source.id, "  Make captions larger  ", [
        imageId,
      ]);
      await vi.waitFor(() => expect(revised.phase).toBe("ready"));
      expect(run.jobs[0]).toEqual(source);
      expect(revised).toMatchObject({
        sourceJobId: source.id,
        refinementPrompt: "Make captions larger",
        duration: 30,
        sessionId: "full-session",
      });
      expect(await readFile(path.join(workspace, "index.html"), "utf8")).toBe(
        "original composition",
      );
      expect(await readFile(path.join(workspace, "renders/full.mp4"), "utf8")).toBe(
        "original export",
      );
      expect(await readFile(path.join(revised.workspace, "index.html"), "utf8")).toBe(
        "refined composition",
      );
      expect(generate).toHaveBeenCalledTimes(1);
      expect(revised.refinementAssetIds).toEqual([imageId]);
      const referencePath = `refinement-images/${imageId}.png`;
      expect(
        JSON.parse(await readFile(path.join(revised.workspace, "REFINEMENT_IMAGES.json"), "utf8")),
      ).toEqual([{ originalPath: referencePath, inspectionPath: referencePath }]);
      expect(await readFile(path.join(revised.workspace, referencePath))).toEqual(image);
      expect(revised.outputType).not.toBe("page");
      if (run.request.outputType !== "video" || !run.brief) throw Error("video expected");
      const prompt = buildVideoPrompt({
        job: revised,
        request: run.request,
        brief: BriefSchema.parse(run.brief),
        candidate,
        styles: (await loadCatalog()).styles,
        width: 1920,
        height: 1080,
        feedback: revised.refinementPrompt,
      });
      expect(prompt).toContain("REVISION SCOPE");
      expect(prompt).toContain("complete authoritative set of refinement requests");
      expect(prompt).toContain("Read REFINEMENT_IMAGES.json");
      expect(prompt).toContain("SAVED REVISION CHECKPOINT");
      const checkpointPrompt = prompt.split("REVISION SCOPE:")[0];
      expect(checkpointPrompt).toContain(revised.workspace);
      expect(checkpointPrompt).toContain(source.workspace);
      expect(checkpointPrompt).toContain('"path":"renders/full.mp4","available":true');
      for (const detail of [
        "sha256",
        "sourceSessionId",
        "inheritedCacheDirectories",
        "cache",
        "runtime identity",
        "refinement-checkpoint.json",
      ])
        expect(checkpointPrompt).not.toContain(detail);
      expect(prompt).toContain("Make captions larger");
      const revisionScope = prompt.split("REVISION SCOPE:")[1].split("\n")[0];
      expect(revisionScope).not.toMatch(/saved session|schema-constrained|three-second preview/);
      expect(revisionScope).toContain("preserving unaffected content");
      expect(revisionScope).toContain("complete updated manifest and storyboard");
      expect(prompt).toContain(
        "Read production.json and STORYBOARD.json, then inspect only files relevant to the requested edit",
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);
it("rejects active work, missing sessions and empty refinement requests without creating jobs", async () => {
  const workflow = new Workflow(new Store(":memory:"), await loadCatalog());
  const run = project("/tmp/unused");
  run.phase = "generating";
  await expect(workflow.refineVideo(run, "full-original", "change it")).rejects.toMatchObject({
    code: "PROJECT_ACTIVE",
  });
  run.phase = "ready";
  await expect(
    workflow.refineVideo(run, "full-original", "change it", [randomUUID()]),
  ).rejects.toMatchObject({ code: "FILE_UNREADABLE" });
  await expect(workflow.refineVideo(run, "full-original", " ")).rejects.toMatchObject({
    code: "INVALID_REQUEST",
  });
  run.jobs[0].sessionId = undefined;
  await expect(workflow.refineVideo(run, "full-original", "change it")).rejects.toMatchObject({
    code: "INVALID_REQUEST",
  });
  expect(run.jobs).toHaveLength(1);
});
it("keeps text-only refinement compatible and rejects unsupported or excessive image attachments", async () => {
  expect(
    VideoRefinementRequestSchema.parse({ jobId: "original", prompt: "Change the layout" }).assetIds,
  ).toEqual([]);
  expect(
    VideoRefinementRequestSchema.safeParse({
      jobId: "original",
      prompt: "Change the layout",
      assetIds: Array.from({ length: 9 }, () => randomUUID()),
    }).success,
  ).toBe(false);
  const store = new Store(":memory:");
  const id = randomUUID();
  store.asset({ id, name: `${id}.txt`, path: "/unused", kind: "text/plain", bytes: 1 });
  const run = project("/unused");
  await expect(
    new Workflow(store, await loadCatalog()).refineVideo(
      run,
      "full-original",
      "Change the layout",
      [id],
    ),
  ).rejects.toMatchObject({ code: "FILE_TYPE_UNSUPPORTED" });
  expect(run.jobs).toHaveLength(1);
});
it("shows inline AI Elements fine-tune input only after a completed video and disables it during work", () => {
  const run = project("/tmp/unused");
  const html = renderToStaticMarkup(<VideoRefinement run={run} onUpdated={() => {}} />);
  expect(html).toContain('aria-label="Fine-tune instructions"');
  expect(html).toContain('aria-label="Video to fine-tune"');
  expect(html).toContain("Apply changes");
  expect(html).toContain('aria-label="Attach refinement images"');
  run.phase = "generating";
  expect(renderToStaticMarkup(<VideoRefinement run={run} onUpdated={() => {}} />)).toContain(
    'disabled=""',
  );
  run.jobs[0].phase = "failed";
  expect(renderToStaticMarkup(<VideoRefinement run={run} onUpdated={() => {}} />)).toBe("");
});

it.each(["claude", "codex"] as const)(
  "%s carries stopped instructions and images while recovering the real build session",
  async (provider) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "refinement-history-"));
    const run = project(workspace);
    run.request.provider = provider;
    run.phase = "cancelled";
    const source = run.jobs[0];
    source.sessionId = "cache-helper";
    if (source.outputType === "page") throw Error("Expected video");
    const store = new Store(":memory:");
    const imageId = randomUUID();
    const imagePath = path.join(workspace, "reference.png");
    const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } })
      .png()
      .toBuffer();
    await writeFile(imagePath, image);
    store.asset({
      id: imageId,
      name: `${imageId}.png`,
      originalName: "reference.png",
      path: imagePath,
      kind: "image/png",
      bytes: image.length,
    });
    run.jobs.push({
      ...source,
      id: "stopped",
      phase: "cancelled",
      sourceJobId: source.id,
      refinementPrompt: "Keep the pricing scene",
      refinementAssetIds: [imageId],
    });
    run.jobs.push({
      ...source,
      id: "unrelated",
      candidateId: "different-direction",
      phase: "cancelled",
      refinementPrompt: "Unrelated instruction",
    });
    store.emit(run.id, "session", "Main", source.id, {
      purpose: "full video generation",
      sessionId: "verified-builder",
    });
    store.emit(run.id, "session", "Helper", source.id, {
      purpose: "Render cache change summary",
      sessionId: "cache-helper",
    });
    const workflow = new Workflow(store, await loadCatalog());
    vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
      job.phase = "ready";
    });
    try {
      const revised = await workflow.refineVideo(run, source.id, "Use larger captions");
      await vi.waitFor(() => expect(run.phase).toBe("ready"));
      expect(revised.sessionId).toBe("verified-builder");
      expect(source.sessionId).toBe("cache-helper");

      expect(revised.refinementHistory).toMatchObject([
        { jobId: "stopped", prompt: "Keep the pricing scene", assetIds: [imageId] },
      ]);
      expect(revised.refinementCheckpoint?.sourceSessionId).toBe("verified-builder");
      const history = JSON.parse(
        await readFile(path.join(revised.workspace, "renders/REFINEMENT_HISTORY.json"), "utf8"),
      );
      expect(history.previousInstructions[0].prompt).toBe("Keep the pricing scene");
      expect(history.latestInstruction.prompt).toBe("Use larger captions");
      expect(
        await readFile(path.join(revised.workspace, `refinement-images/${imageId}.png`)),
      ).toEqual(image);
      expect(JSON.stringify(history)).not.toContain("Unrelated instruction");
      const next = await workflow.refineVideo(run, revised.id, "Make captions blue instead");
      await vi.waitFor(() => expect(run.phase).toBe("ready"));

      expect(next.refinementHistory?.map((entry) => entry.prompt)).toEqual([
        "Keep the pricing scene",
        "Use larger captions",
      ]);
    } finally {
      await workflow.shutdown();
      store.close();
      await rm(workspace, { recursive: true, force: true });
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);

it("withdraws selected earlier requests, persists that choice, and allows explicitly keeping them again", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "refinement-selection-"));
  const run = project(workspace);
  const source = run.jobs[0];
  if (source.outputType === "page") throw Error("Expected video");
  run.jobs.push({
    ...source,
    id: "discarded",
    phase: "cancelled",
    refinementPrompt: "Unwanted edit",
    refinementAssetIds: ["missing-discarded-image"],
  });
  run.jobs.push({
    ...source,
    id: "kept",
    phase: "failed",
    refinementPrompt: "Keep this requirement",
  });
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
    job.phase = "ready";
  });
  try {
    await expect(
      workflow.refineVideo(run, source.id, "Edit", [], ["another-direction"]),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(run.jobs).toHaveLength(3);
    const revised = await workflow.refineVideo(run, source.id, "Latest edit", [], ["discarded"]);
    await vi.waitFor(() => expect(run.phase).toBe("ready"));
    expect(revised.version).toBe(4);
    expect(revised.refinementHistory?.map((entry) => entry.jobId)).toEqual(["kept"]);
    const history = JSON.parse(
      await readFile(path.join(revised.workspace, "renders/REFINEMENT_HISTORY.json"), "utf8"),
    );
    expect(history.discardedRequestJobIds).toEqual(["discarded"]);
    expect(history.unresolvedReferenceIds).toEqual([]);
    const next = await workflow.refineVideo(run, revised.id, "Another edit");
    await vi.waitFor(() => expect(run.phase).toBe("ready"));
    expect(next.refinementHistory?.some((entry) => entry.jobId === "discarded")).toBe(false);
    const reenabled = await workflow.refineVideo(run, next.id, "Restore request", [], []);
    await vi.waitFor(() => expect(run.phase).toBe("ready"));
    expect(reenabled.refinementHistory?.some((entry) => entry.jobId === "discarded")).toBe(true);
    expect(run.discardedRefinementJobIds).toEqual([]);
  } finally {
    await workflow.shutdown();
    store.close();
    await rm(workspace, { recursive: true, force: true });
    await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
  }
});

it.each(["claude", "codex"] as const)(
  "%s continues a cancelled version's own workspace and build session",
  async (provider) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "cancelled-refinement-"));
    const run = project(workspace);
    run.request.provider = provider;
    run.phase = "cancelled";
    const source = run.jobs[0];
    source.phase = "cancelled";
    const store = new Store(":memory:");
    const workflow = new Workflow(store, await loadCatalog());
    vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
      expect(await readFile(path.join(job.workspace, "index.html"), "utf8")).toBe(
        "partial edits from stopped version",
      );
      expect(job.sessionId).toBe("full-session");
      job.phase = "ready";
    });
    try {
      await writeFile(path.join(workspace, "index.html"), "partial edits from stopped version");
      const next = await workflow.refineVideo(run, source.id, "Continue these edits");
      await vi.waitFor(() => expect(run.phase).toBe("ready"));
      expect(next.sourceJobId).toBe(source.id);
      expect(next.refinementCheckpoint?.sourcePhase).toBe("cancelled");
      expect(next.version).toBe(2);
      expect(source.phase).toBe("cancelled");
      expect(await readFile(path.join(workspace, "index.html"), "utf8")).toBe(
        "partial edits from stopped version",
      );
    } finally {
      await workflow.shutdown();
      store.close();
      await rm(workspace, { recursive: true, force: true });
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);
