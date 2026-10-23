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
    const workflow = new Workflow(new Store(":memory:"), await loadCatalog());
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
      const revised = await workflow.refineVideo(run, source.id, "  Make captions larger  ");
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
  await expect(workflow.refineVideo(run, "full-original", " ")).rejects.toMatchObject({
    code: "INVALID_REQUEST",
  });
  run.jobs[0].sessionId = undefined;
  await expect(workflow.refineVideo(run, "full-original", "change it")).rejects.toMatchObject({
    code: "INVALID_REQUEST",
  });
  expect(run.jobs).toHaveLength(1);
});
it("shows inline AI Elements fine-tune input only after a completed video and disables it during work", () => {
  const run = project("/tmp/unused");
  const html = renderToStaticMarkup(<VideoRefinement run={run} onUpdated={() => {}} />);
  expect(html).toContain('aria-label="Fine-tune instructions"');
  expect(html).toContain('aria-label="Video to fine-tune"');
  expect(html).toContain("Apply changes");
  run.phase = "generating";
  expect(renderToStaticMarkup(<VideoRefinement run={run} onUpdated={() => {}} />)).toContain(
    'disabled=""',
  );
  run.jobs[0].phase = "failed";
  expect(renderToStaticMarkup(<VideoRefinement run={run} onUpdated={() => {}} />)).toBe("");
});
