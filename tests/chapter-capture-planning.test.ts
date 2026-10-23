import { expect, it, vi } from "vitest";
import type { prepareChapterCaptures } from "../src/server/jobs/subworkflows/chapter-capture/workflow";
import { captureWithTimingRetries } from "../src/server/jobs/subworkflows/chapter-capture/planning";
import { ChapterTimingConflictError } from "../src/server/capture/chapter-timing";
import type { VideoGenerationJob } from "../src/shared/domains/video";
import { VideoRequestSchema } from "../src/shared/domains/video";
const conflict = {
  chapterId: "create",
  targetDurationSeconds: 5,
  requiredDurationSeconds: 8,
  reason: "Typing needs more readable time",
};
function input() {
  const job: VideoGenerationJob = {
    id: "job",
    runId: "example",
    candidateId: "direction",
    kind: "full",
    phase: "generating",
    duration: 30,
    model: "main-model",
    sessionId: "main-session",
    workspace: "/tmp/example",
    buildPlan: {
      model: "main-model",
      sessionId: "main-session",
      value: {
        version: 2,
        width: 1920,
        height: 1080,
        fps: 60,
        durationSeconds: 30,
        plan: "Approved story",
        capturePlan: {
          scope: "Create",
          story: "Show a result",
          chapters: [
            {
              id: "create",
              title: "Create",
              purpose: "Create",
              startingState: "Home",
              actions: ["Type a brief"],
              expectedResults: ["Result"],
              nextChapterContext: "End",
              estimatedDurationSeconds: 5,
            },
          ],
        },
      },
    },
  };
  return {
    job,
    request: VideoRequestSchema.parse({
      instructions: "Show the workflow",
      urls: ["https://example.com"],
    }),
    signal: new AbortController().signal,
    onEvent: vi.fn(),
    update: vi.fn(),
  };
}
it("retries the chapter within its approved budget without invoking full-film planning", async () => {
  const options = input();
  const approved = structuredClone(options.job.buildPlan);
  const capture = vi.fn(async (call: Parameters<typeof prepareChapterCaptures>[0]) => {
    expect(call.plan.chapters[0].estimatedDurationSeconds).toBe(5);
    if (!call.timingRetry) throw new ChapterTimingConflictError(conflict);
    expect(call.timingRetry).toEqual(conflict);
    return "CAPTURED_CHAPTERS.json";
  });
  await expect(captureWithTimingRetries(options, capture)).resolves.toBe("CAPTURED_CHAPTERS.json");
  expect(capture).toHaveBeenCalledTimes(2);
  expect(options.job.buildPlan).toEqual(approved);
  expect(options.job.sessionId).toBe("main-session");
  expect(options.onEvent.mock.calls.map(([event]) => event.data.captureTiming.phase)).toEqual([
    "conflict",
    "retry",
  ]);
});
it("bounds local recovery to ten retries and blocks assembly on exhaustion", async () => {
  const options = input();
  const capture = vi.fn(async () => {
    throw new ChapterTimingConflictError(conflict);
  });
  await expect(captureWithTimingRetries(options, capture)).rejects.toThrow(
    "Chapter timing conflict",
  );
  expect(capture).toHaveBeenCalledTimes(11);
  const retries = options.onEvent.mock.calls
    .map(([event]) => event.data.captureTiming)
    .filter((timing) => timing.phase === "retry");
  expect(retries.map((timing) => timing.revision)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
it("does not reinterpret provider or cancellation failures as timing conflicts", async () => {
  await expect(
    captureWithTimingRetries(input(), async () => {
      throw Error("Provider failed");
    }),
  ).rejects.toThrow("Provider failed");
  const options = input();
  options.signal = AbortSignal.abort();
  const capture = vi.fn();
  await expect(captureWithTimingRetries(options, capture)).rejects.toThrow();
  expect(capture).not.toHaveBeenCalled();
});
