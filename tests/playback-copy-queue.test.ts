vi.mock("../src/server/jev/strategies/visual-authoring", () => ({
  selectAuthoringResources: async () => ({
    source: "jev",
    model: "jev-test",
    selectedIds: ["local_code"],
    decisions: [],
  }),
}));
import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
vi.mock("../src/server/rendering/render", async (load) => ({
  ...(await load<typeof import("../src/server/rendering/render")>()),
  makePlaybackCopies: vi.fn(),
}));
vi.mock("../src/server/domains/video/workflow", () => ({ generateVideo: vi.fn() }));
import { RequestSchema, type Run } from "../src/shared/contracts";
import type { VideoGenerationJob } from "../src/shared/domains/video";
import { Workflow } from "../src/server/jobs/workflow";
import { Store } from "../src/server/jobs/store";
import { loadCatalog } from "../src/server/catalog/catalog";
import { dataRoot } from "../src/server/runtime/config";
import { makePlaybackCopies } from "../src/server/rendering/render";
import { generateVideo } from "../src/server/domains/video/workflow";
import { playbackCopyProfile } from "../src/server/rendering/playback-copies";
import { localizeVideoRequest } from "../src/server/jobs/subworkflows/video-localization";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { projectGovernance } from "../src/server/governance/report";
import type { agentTurn } from "../src/server/agents/providers";

const cleanup: string[] = [];
afterEach(async () => {
  vi.mocked(makePlaybackCopies).mockReset();
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
function project(workspace: string, phase: VideoGenerationJob["phase"] = "ready"): Run {
  const id = randomUUID();
  cleanup.push(path.join(dataRoot, "runs", id));
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
    candidates: [
      {
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
      },
    ],
    jobs: [
      {
        id: "film",
        runId: id,
        candidateId: "chosen",
        kind: "full",
        phase,
        workspace,
        model: "example-model",
        duration: 30,
        video: "renders/full.mp4",
      },
    ],
  };
}
const ready = {
  viewingVideo: "renders/view-720p30.webm",
  cardClip: "renders/card-3s.webm",
  playbackCopies: { profile: playbackCopyProfile, status: "ready" as const, updatedAt: "now" },
};

it("attributes build-time translation usage to the project without replacing its build session", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "translation-governance-"));
  cleanup.push(workspace);
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run = project(workspace, "queued");
  run.request = VideoRequestSchema.parse({
    instructions: "Tell a visual story",
    provider: "codex",
    outputLanguage: "zh",
    lyrics: { mode: "provided", text: "Hello, world" },
  });
  run.jobs[0].sessionId = "build-session";
  run.jobs[0].kind = "preview";
  const generate = (async (input) => {
    const data = {
      provider: "codex",
      model: input.model,
      invocationId: "translation-turn",
      sessionId: "translation-session",
    };
    input.onEvent({ type: "session", message: "Session started", data });
    input.onEvent({ type: "invocation", message: "Translating", data });
    input.onEvent({
      type: "usage",
      message: "Usage",
      data: { ...data, usageScope: "turn", input_tokens: 100, output_tokens: 20 },
    });
    return { value: { text: "你好，世界" } };
  }) as typeof agentTurn;
  vi.mocked(generateVideo).mockImplementation(async (input) => {
    const translated = await localizeVideoRequest(
      input.request,
      path.join(workspace, "localization"),
      input.signal,
      input.onEvent,
      generate,
    );
    expect(translated.lyrics).toEqual({ mode: "provided", text: "你好，世界" });
    input.job.phase = "ready";
  });
  try {
    await workflow.generate(run, run.jobs[0]);
    expect(run.jobs[0].phase).toBe("ready");
    expect(run.jobs[0].sessionId).toBe("build-session");
    const events = store.events(run.id);
    expect(events.filter((event) => event.type === "usage")).toEqual([
      expect.objectContaining({
        jobId: run.jobs[0].id,
        data: expect.objectContaining({
          purpose: "Video copy translation",
          audience: "internal",
          input_tokens: 100,
        }),
      }),
    ]);
    expect(projectGovernance(run, events).activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purpose: "Video copy translation",
          calls: 1,
          inputTokens: 100,
          outputTokens: 20,
        }),
      ]),
    );
  } finally {
    store.close();
  }
});

it("makes copies in the background, marks progress and refuses duplicates or unfinished work", async () => {
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run = project("/tmp/unused");
  let finish = (_value: typeof ready) => {};
  vi.mocked(makePlaybackCopies).mockImplementation(
    () => new Promise((resolve) => (finish = resolve)),
  );
  expect(workflow.queuePlaybackCopies(run, "film")).toBe(true);
  expect(workflow.queuePlaybackCopies(run, "film")).toBe(false);
  const job = run.jobs[0] as VideoGenerationJob;
  expect(job.playbackCopies).toMatchObject({ profile: playbackCopyProfile, status: "making" });
  expect(job.phase).toBe("ready");
  expect((store.get(run.id)!.jobs[0] as VideoGenerationJob).playbackCopies?.status).toBe("making");
  await vi.waitFor(() => expect(makePlaybackCopies).toHaveBeenCalledTimes(1));
  finish(ready);
  await vi.waitFor(() => expect(job.playbackCopies?.status).toBe("ready"));
  expect(job).toMatchObject({ video: "renders/full.mp4", ...ready });
  expect(store.get(run.id)!.jobs[0]).toMatchObject(ready);
  const unfinished = project("/tmp/unused", "rendering");
  expect(() => workflow.queuePlaybackCopies(unfinished, "film")).toThrow("finished full film");
});

it("records a failure, and stopping for deletion discards the result", async () => {
  const workflow = new Workflow(new Store(":memory:"), await loadCatalog());
  const failing = project("/tmp/unused");
  vi.mocked(makePlaybackCopies).mockRejectedValueOnce(Error("disk full"));
  workflow.queuePlaybackCopies(failing, "film");
  await vi.waitFor(() =>
    expect(failing.jobs[0]).toMatchObject({
      playbackCopies: { status: "failed", error: "disk full" },
    }),
  );
  const deleting = project("/tmp/unused");
  vi.mocked(makePlaybackCopies).mockImplementation(
    (_job, signal) =>
      new Promise((resolve) => signal.addEventListener("abort", () => resolve(ready))),
  );
  workflow.queuePlaybackCopies(deleting, "film");
  await vi.waitFor(() => expect(makePlaybackCopies).toHaveBeenCalled());
  await workflow.stopPlaybackCopies(deleting);
  expect(deleting.jobs[0]).not.toHaveProperty("viewingVideo");
  expect(workflow.queuePlaybackCopies(deleting, "film")).toBe(true);
});

it("starts the copies only after a full film is ready, without holding the job", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "playback-queue-"));
  cleanup.push(workspace);
  const workflow = new Workflow(new Store(":memory:"), await loadCatalog());
  const run = project(workspace, "queued");
  vi.mocked(generateVideo).mockImplementation(async ({ job }) => {
    job.phase = "ready";
  });
  vi.mocked(makePlaybackCopies).mockImplementation(async (job) => {
    expect(job.phase).toBe("ready");
    return ready;
  });
  await workflow.generate(run, run.jobs[0]);
  expect(workflow.hasActiveTasks(run)).toBe(false);
  await vi.waitFor(() => expect(run.jobs[0]).toMatchObject(ready));
  expect(makePlaybackCopies).toHaveBeenCalledTimes(1);
});
