import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  CaptureChapterPlanSchema,
  type CaptureChapterProgress,
} from "../src/shared/capture-chapters";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import {
  prepareChapterCaptures,
  capturedChaptersArtifact,
} from "../src/server/jobs/subworkflows/chapter-capture/workflow";
import { captureInteractionGuidance } from "../src/server/domains/video/route-prompts/application-demo/shared";
import type { AgentTurnOptions, ProviderEvent } from "../src/server/agents/agent";

vi.mock("../src/server/rendering/video-probe", () => ({
  probeVideo: vi.fn(async () => ({ format: { duration: "10" }, streams: [] })),
}));
import { probeVideo } from "../src/server/rendering/video-probe";

const folders: string[] = [];
afterEach(async () => {
  vi.mocked(probeVideo).mockResolvedValue({ format: { duration: "10" }, streams: [] });
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
const plan = CaptureChapterPlanSchema.parse({
  scope: "Create and review an explanation",
  story: "One connected workflow",
  chapters: ["create", "review"].map((id, index) => ({
    id,
    title: id,
    purpose: "Demonstrate the main capability",
    startingState: "Open the application in its initial state",
    actions: ["Perform the planned action"],
    expectedResults: ["Visible successful result"],
    nextChapterContext: index ? "End the walkthrough" : "Continue with the created item",
    estimatedDurationSeconds: 10,
  })),
});
async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "chapter-capture-"));
  folders.push(workspace);
  await mkdir(path.join(workspace, "assets"));
  await mkdir(path.join(workspace, "capture-chapters"));
  const job: VideoGenerationJob = {
    id: "job",
    runId: "example",
    candidateId: "direction",
    kind: "full",
    phase: "generating",
    model: "example-model",
    duration: 60,
    workspace,
    sessionId: "main-session",
  };
  const events: ProviderEvent[] = [];
  return {
    job,
    request: VideoRequestSchema.parse({
      instructions: "Show the application workflow",
      urls: ["https://example.com"],
      provider: "claude",
    }),
    plan,
    signal: new AbortController().signal,
    onEvent: (event: ProviderEvent) => events.push(event),
    update: () => {},
    events,
  };
}
it.each(["claude", "codex"] as const)(
  "uses Haiku for Claude chapter capture and retains the selected Codex model (%s)",
  async (provider) => {
    const input = await fixture();
    input.request.provider = provider;
    const originalModel = input.job.model;
    const originalSession = input.job.sessionId;
    const calls: Array<string | undefined> = [];
    await prepareChapterCaptures(input, async <T>(options: AgentTurnOptions<T>) => {
      expect(options.provider).toBe(provider);
      expect(options.model).toBe(provider === "claude" ? "claude-haiku-5-5" : originalModel);
      expect(options.sessionId).toBeUndefined();
      calls.push(options.model);
      return exported(options);
    });
    expect(calls).toHaveLength(plan.chapters.length);
    expect(input.job.model).toBe(originalModel);
    expect(input.job.sessionId).toBe(originalSession);
  },
);
async function exported<T>(options: AgentTurnOptions<T>) {
  const id = options.captureChapterId!;
  const assetPath = `assets/website-video-${randomUUID()}.webm`;
  const cursorPath = assetPath.replace(".webm", ".cursor.json");
  await writeFile(path.join(options.workspace, assetPath), `native recording ${id}`);
  await writeFile(
    path.join(options.workspace, cursorPath),
    JSON.stringify({ nativeTrimRegions: [] }),
  );
  const recording = {
    assetPath,
    cursorPath,
    url: "https://example.com",
    duration: 10,
    width: 1280,
    height: 720,
    fps: 60,
    silent: true,
  };
  await writeFile(
    path.join(options.workspace, "capture-chapters", `${id}.json`),
    JSON.stringify({ chapterId: id, recording, documentReviewed: true, frameReviews: 1 }),
  );
  const sessionId = randomUUID();
  options.onEvent({
    type: "session",
    message: "Session resumed",
    data: { sessionId },
  });
  return {
    value: options.schema.parse({
      outcome: {
        assetPath,
        observedResults: ["Visible result"],
        omissions: [],
        reviewNotes: "Inspected native frames after edits",
      },
    }),
    sessionId,
  };
}
it("runs ordered chapter calls in fresh sessions, persists verified captures and resumes without recapturing", async () => {
  const input = await fixture();
  const calls: string[] = [];
  const generate = async <T>(options: AgentTurnOptions<T>) => {
    calls.push(options.captureChapterId!);
    expect(options.sessionId).toBeUndefined();
    expect(options.enableVideoCapture).toBe(true);
    expect(options.captureChapterDurationSeconds).toBe(10);
    expect(options.prompt).toContain("CAPTURE ONE PLANNED CHAPTER");
    return exported(options);
  };
  await prepareChapterCaptures(input, generate);
  expect(calls).toEqual(["create", "review"]);
  const measured = JSON.parse(
    await readFile(path.join(input.job.workspace, capturedChaptersArtifact), "utf8"),
  );
  expect(
    measured.chapters.map(
      (chapter: { result: { actualDurationSeconds: number } }) =>
        chapter.result.actualDurationSeconds,
    ),
  ).toEqual([10, 10]);
  const progress = input.events
    .filter((event) => event.type === "capture_progress")
    .map((event) => (event.data as { captureProgress: CaptureChapterProgress }).captureProgress);
  expect(progress.map((value) => (value.completed / value.total) * 100)).toEqual([0, 50, 50, 100]);
  const saved = JSON.parse(
    await readFile(path.join(input.job.workspace, capturedChaptersArtifact), "utf8"),
  );
  expect(saved.chapters.map((chapter: { chapter: { id: string } }) => chapter.chapter.id)).toEqual([
    "create",
    "review",
  ]);
  await prepareChapterCaptures(input, generate);
  expect(calls).toHaveLength(2);
  await writeFile(path.join(input.job.workspace, saved.chapters[0].result.assetPath), "corrupt");
  await prepareChapterCaptures(input, generate);
  expect(calls).toEqual(["create", "review", "create", "review"]);
});
it("stops on chapter failure and reuses only completed chapters on retry", async () => {
  const input = await fixture();
  let fail = true;
  const calls: string[] = [];
  const generate = async <T>(options: AgentTurnOptions<T>) => {
    calls.push(options.captureChapterId!);
    if (fail && options.captureChapterId === "review") throw Error("Native export failed");
    return exported(options);
  };
  await expect(prepareChapterCaptures(input, generate)).rejects.toThrow("Native export failed");
  expect(input.events.at(-1)).toMatchObject({
    data: { captureProgress: { completed: 1, status: "failed" } },
  });
  fail = false;
  await prepareChapterCaptures(input, generate);
  expect(calls).toEqual(["create", "review", "review"]);
});
it("recaptures a changed chapter without invalidating its unchanged sibling", async () => {
  const input = await fixture();
  const calls: string[] = [];
  const generate = async <T>(options: AgentTurnOptions<T>) => {
    calls.push(options.captureChapterId!);
    return exported(options);
  };
  await prepareChapterCaptures(input, generate);
  const changed = structuredClone(plan);
  changed.chapters[1].actions = ["Show a different result"];
  await prepareChapterCaptures({ ...input, plan: changed }, generate);
  expect(calls).toEqual(["create", "review", "review"]);
});
it("refuses claimed results without native review/export evidence", async () => {
  const input = await fixture();
  const generate = async <T>(options: AgentTurnOptions<T>) => ({
    value: options.schema.parse({
      outcome: {
        assetPath: `assets/website-video-${randomUUID()}.webm`,
        observedResults: ["claimed"],
        omissions: [],
        reviewNotes: "claimed",
      },
    }),
    sessionId: randomUUID(),
  });
  await expect(prepareChapterCaptures(input, generate)).rejects.toThrow();
  expect(input.events.at(-1)).toMatchObject({
    data: { captureProgress: { completed: 0, status: "failed" } },
  });
});
it("preserves the main session and records distinct chapter sessions", async () => {
  const input = await fixture();
  await prepareChapterCaptures(input, exported);
  const saved = JSON.parse(
    await readFile(path.join(input.job.workspace, capturedChaptersArtifact), "utf8"),
  );
  expect(input.job.sessionId).toBe("main-session");
  expect(
    new Set(saved.chapters.map((chapter: { sessionId: string }) => chapter.sessionId)).size,
  ).toBe(2);
  expect(
    saved.chapters.every((chapter: { sessionId: string }) => chapter.sessionId !== "main-session"),
  ).toBe(true);
  await expect(prepareChapterCaptures({ ...input, signal: AbortSignal.abort() })).rejects.toThrow();
});
it("rejects a provider that returns the planning session or reuses a chapter session", async () => {
  const input = await fixture();
  await expect(
    prepareChapterCaptures(input, async <T>(options: AgentTurnOptions<T>) => ({
      ...(await exported(options)),
      sessionId: "main-session",
    })),
  ).rejects.toThrow("own new session");
  await expect(
    prepareChapterCaptures(input, async <T>(options: AgentTurnOptions<T>) => ({
      ...(await exported(options)),
      sessionId: "reused-chapter-session",
    })),
  ).rejects.toThrow("own new session");
});
it("validates unique chapter identities and required scope/story before execution", () => {
  expect(
    CaptureChapterPlanSchema.safeParse({ ...plan, chapters: [plan.chapters[0], plan.chapters[0]] })
      .success,
  ).toBe(false);
  expect(CaptureChapterPlanSchema.safeParse({ ...plan, scope: " " }).success).toBe(false);
});

it("injects shared interaction rules exactly once in every chapter and retry call", async () => {
  const input = await fixture();
  let interruptReview = true;
  const calls: string[] = [];
  const generate = async <T>(options: AgentTurnOptions<T>) => {
    calls.push(options.captureChapterId!);
    expect(options.prompt).toContain(captureInteractionGuidance);
    expect(options.prompt.split("UNSUPPORTED INTERACTIONS:")).toHaveLength(2);
    expect(options.prompt.split("FILE PICKERS:")).toHaveLength(2);
    expect(options.sessionId).toBeUndefined();
    expect(options.prompt).toContain("Shared rules apply to every chapter and retry");
    if (interruptReview && options.captureChapterId === "review") {
      interruptReview = false;
      throw Error("Interrupted chapter");
    }
    return exported(options);
  };
  await expect(prepareChapterCaptures(input, generate)).rejects.toThrow("Interrupted chapter");
  await prepareChapterCaptures(input, generate);
  expect(calls).toEqual(["create", "review", "review"]);
});

it("invalidates captures when explicit source requirements change", async () => {
  const input = await fixture();
  const calls: string[] = [];
  const generate = async <T>(options: AgentTurnOptions<T>) => {
    calls.push(options.captureChapterId!);
    return exported(options);
  };
  await prepareChapterCaptures(input, generate);
  input.request.requirements = {
    main: { instructions: "Preserve exact product name", assetIds: [] },
    images: { instructions: "Use the supplied cover", assetIds: [] },
    music: { instructions: "", assetIds: [] },
    urls: { instructions: "Show the sharing result too" },
  };
  await prepareChapterCaptures(input, generate);
  expect(calls).toEqual(["create", "review", "create", "review"]);
});

it.each(["missing", "changed", "legacy"] as const)(
  "recaptures when cursor sidecar integrity is %s",
  async (condition) => {
    const input = await fixture();
    const calls: string[] = [];
    const generate = async <T>(options: AgentTurnOptions<T>) => {
      calls.push(options.captureChapterId!);
      return exported(options);
    };
    await prepareChapterCaptures(input, generate);
    const artifact = path.join(input.job.workspace, capturedChaptersArtifact);
    const saved = JSON.parse(await readFile(artifact, "utf8"));
    const cursor = path.join(input.job.workspace, saved.chapters[1].evidence.recording.cursorPath);
    if (condition === "missing") await rm(cursor);
    else if (condition === "changed") await writeFile(cursor, '{"events":[],"changed":true}');
    else {
      delete saved.chapters[1].cursorSha256;
      await writeFile(artifact, JSON.stringify(saved));
    }
    calls.length = 0;
    await prepareChapterCaptures(input, generate);
    expect(calls).toEqual(["review"]);
    const repaired = JSON.parse(await readFile(artifact, "utf8"));
    expect(repaired.chapters[1].cursorSha256).toMatch(/^[a-f0-9]{64}$/);
    await prepareChapterCaptures(input, generate);
    expect(calls).toEqual(["review"]);
  },
);
it("rejects a newly exported chapter when its cursor sidecar is missing", async () => {
  const input = await fixture();
  await expect(
    prepareChapterCaptures(input, async <T>(options: AgentTurnOptions<T>) => {
      const result = await exported(options);
      const evidence = JSON.parse(
        await readFile(
          path.join(options.workspace, "capture-chapters", `${options.captureChapterId}.json`),
          "utf8",
        ),
      );
      await rm(path.join(options.workspace, evidence.recording.cursorPath));
      return result;
    }),
  ).rejects.toThrow();
  await expect(
    readFile(path.join(input.job.workspace, capturedChaptersArtifact)),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(input.events.at(-1)).toMatchObject({
    data: { captureProgress: { completed: 0, status: "failed" } },
  });
});
it("preserves unvisited chapter checkpoints through a failed retry and still validates them before reuse", async () => {
  const input = await fixture();
  input.plan = {
    ...plan,
    chapters: [...plan.chapters, { ...plan.chapters[1], id: "publish", title: "Publish" }],
  };
  const calls: string[] = [];
  let failReview = false;
  const generate = async <T>(options: AgentTurnOptions<T>) => {
    calls.push(options.captureChapterId!);
    if (failReview && options.captureChapterId === "review") throw Error("Interrupted review");
    return exported(options);
  };
  await prepareChapterCaptures(input, generate);
  const artifact = path.join(input.job.workspace, capturedChaptersArtifact);
  const original = JSON.parse(await readFile(artifact, "utf8"));
  const video = path.join(input.job.workspace, original.chapters[1].result.assetPath);
  await rename(video, `${video}.held`);
  failReview = true;
  calls.length = 0;
  await expect(prepareChapterCaptures(input, generate)).rejects.toThrow("Interrupted review");
  const interrupted = JSON.parse(await readFile(artifact, "utf8"));
  expect(interrupted.chapters).toEqual(original.chapters);
  expect(input.events.at(-1)).toMatchObject({
    data: { captureProgress: { completed: 1, status: "failed" } },
  });
  await rename(`${video}.held`, video);
  failReview = false;
  calls.length = 0;
  await prepareChapterCaptures(input, generate);
  expect(calls).toEqual([]);
  input.plan.chapters[2].actions = ["Show a different publishing result"];
  await prepareChapterCaptures(input, generate);
  expect(calls).toEqual(["publish"]);
});
it("preserves later chapter checkpoints when cancellation follows a completed chapter", async () => {
  const input = await fixture();
  await prepareChapterCaptures(input, exported);
  const artifact = path.join(input.job.workspace, capturedChaptersArtifact);
  const original = JSON.parse(await readFile(artifact, "utf8"));
  const controller = new AbortController();
  await expect(
    prepareChapterCaptures(
      {
        ...input,
        signal: controller.signal,
        onEvent: (event) => {
          const progress = (event.data as { captureProgress?: CaptureChapterProgress })
            ?.captureProgress;
          if (progress?.status === "complete" && progress.index === 1) controller.abort();
        },
      },
      exported,
    ),
  ).rejects.toThrow();
  expect(JSON.parse(await readFile(artifact, "utf8")).chapters).toEqual(original.chapters);
});

it("rejects a measured over-budget export before checkpointing or assembly", async () => {
  const input = await fixture();
  vi.mocked(probeVideo).mockResolvedValue({ format: { duration: "11" }, streams: [] });
  await expect(prepareChapterCaptures(input, exported)).rejects.toThrow("Chapter timing conflict");
  await expect(
    readFile(path.join(input.job.workspace, capturedChaptersArtifact)),
  ).rejects.toThrow();
});
it("rejects cuts recorded in the cursor provenance", async () => {
  const input = await fixture();
  await expect(
    prepareChapterCaptures(input, async <T>(options: AgentTurnOptions<T>) => {
      const result = await exported(options);
      const evidence = JSON.parse(
        await readFile(
          path.join(options.workspace, "capture-chapters", options.captureChapterId + ".json"),
          "utf8",
        ),
      );
      await writeFile(
        path.join(options.workspace, evidence.recording.cursorPath),
        JSON.stringify({ nativeTrimRegions: [{ startMs: 1000, endMs: 2000 }] }),
      );
      return result;
    }),
  ).rejects.toThrow("preserve the complete sequence");
});

it("returns a structured infeasible capture budget to the main planner without requiring a fake export", async () => {
  const input = await fixture();
  await expect(
    prepareChapterCaptures(input, async <T>(options: AgentTurnOptions<T>) => ({
      sessionId: randomUUID(),
      value: options.schema.parse({
        outcome: {
          timingConflict: { requiredDurationSeconds: 15, reason: "Readable results need longer" },
        },
      }),
    })),
  ).rejects.toMatchObject({
    conflict: {
      chapterId: "create",
      targetDurationSeconds: 10,
      requiredDurationSeconds: 15,
    },
  });
  await expect(
    readFile(path.join(input.job.workspace, capturedChaptersArtifact)),
  ).rejects.toThrow();
});

it("links observed native stages and measured acceptance to their chapter without changing progress counts", async () => {
  const input = await fixture();
  await prepareChapterCaptures(input, async <T>(options: AgentTurnOptions<T>) => {
    for (const output of [
      { kind: "recording_started" },
      { kind: "editable_capture" },
      { kind: "native_capture", operation: "addSpeed" },
      { kind: "native_capture", operation: "getFrames", content: [{ type: "image" }] },
    ])
      options.onEvent({
        type: "tool_result",
        message: "Result",
        data: { results: [{ failed: false, output: JSON.stringify(output) }] },
      });
    return exported(options);
  });
  const timing = input.events
    .filter((event) => event.type === "capture_timing")
    .map(
      (event) =>
        (
          event.data as {
            captureTiming: {
              chapterId: string;
              phase: string;
              status: string;
              actualDurationSeconds?: number;
            };
          }
        ).captureTiming,
    );
  expect(
    timing
      .filter((event) => event.chapterId === "create")
      .map((event) => [event.phase, event.status]),
  ).toEqual([
    ["recording", "running"],
    ["recording", "complete"],
    ["review", "running"],
    ["speed", "complete"],
    ["review", "running"],
    ["review", "complete"],
    ["validation", "running"],
    ["validation", "complete"],
    ["accepted", "complete"],
  ]);
  expect(
    timing
      .filter((event) => event.phase === "accepted")
      .map((event) => event.actualDurationSeconds),
  ).toEqual([10, 10]);
});

it("keeps accepted retry captures reusable without the transient recovery feedback", async () => {
  const input = await fixture();
  const prompts: string[] = [];
  const generate = async <T>(options: AgentTurnOptions<T>) => {
    prompts.push(options.prompt);
    return exported(options);
  };
  await prepareChapterCaptures(
    {
      ...input,
      timingRetry: {
        chapterId: "create",
        targetDurationSeconds: 10,
        requiredDurationSeconds: 14,
        reason: "Playback stopped late",
      },
    },
    generate,
  );
  expect(prompts).toHaveLength(2);
  expect(prompts[0]).toContain("CHAPTER TIMING RETRY");
  expect(prompts[1]).not.toContain("CHAPTER TIMING RETRY");
  await prepareChapterCaptures(input, generate);
  expect(prompts).toHaveLength(2);
});

it("reports recorder failure without inventing an export or timing conflict", async () => {
  const input = await fixture();
  await expect(
    prepareChapterCaptures(input, async <T>(options: AgentTurnOptions<T>) => ({
      sessionId: randomUUID(),
      value: options.schema.parse({
        outcome: { captureFailure: { reason: "__name is not defined" } },
      }),
    })),
  ).rejects.toThrow("Chapter capture failed: __name is not defined");
  await expect(
    readFile(path.join(input.job.workspace, capturedChaptersArtifact)),
  ).rejects.toThrow();
});

it("rejects a worker timing conflict whose duration already fits the chapter budget", async () => {
  const input = await fixture();
  await expect(
    prepareChapterCaptures(input, async <T>(options: AgentTurnOptions<T>) => ({
      sessionId: randomUUID(),
      value: options.schema.parse({
        outcome: { timingConflict: { requiredDurationSeconds: 10, reason: "Recording failed" } },
      }),
    })),
  ).rejects.toThrow("requires a measured duration exceeding its budget");
});
