import { expect, it, vi } from "vitest";
import {
  captureOperationOutcomes,
  emitChapterTiming,
} from "../src/server/jobs/subworkflows/chapter-capture/events";
import { CaptureChapterTimingSchema } from "../src/shared/capture-chapters";
const result = (outputs: unknown[], failed = false) => ({
  type: "tool_result",
  message: "Result",
  data: { results: outputs.map((output) => ({ failed, output: JSON.stringify(output) })) },
});
it("observes actual recording, native speed edits and image review from all batched results", () => {
  expect(
    captureOperationOutcomes(
      result([
        { kind: "recording_started" },
        { kind: "editable_capture" },
        { kind: "native_capture", operation: "addSpeed" },
        { kind: "native_capture", operation: "getFrames", content: [{ type: "image" }] },
      ]),
    ),
  ).toEqual([
    { phase: "recording", status: "running" },
    { phase: "recording", status: "complete" },
    { phase: "speed", status: "complete" },
    { phase: "review", status: "complete" },
  ]);
});
it("does not claim speed or visual review on failures, missing images or malformed outputs", () => {
  expect(
    captureOperationOutcomes(result([{ kind: "native_capture", operation: "addSpeed" }], true)),
  ).toEqual([]);
  expect(
    captureOperationOutcomes(
      result([
        { kind: "native_capture", operation: "setSpeed", isError: true },
        { kind: "native_capture", operation: "getFrames", content: [{ type: "text" }] },
      ]),
    ),
  ).toEqual([]);
  expect(
    captureOperationOutcomes({
      type: "tool_result",
      message: "",
      data: { results: [{ failed: false, output: "private text" }] },
    }),
  ).toEqual([]);
  expect(captureOperationOutcomes({ type: "tool", message: "start", data: {} })).toEqual([]);
});
it("emits structured chapter-linked timing data without inventing percentages", () => {
  const onEvent = vi.fn();
  const timing = {
    chapterId: "create",
    title: "Create",
    index: 1,
    total: 2,
    phase: "accepted" as const,
    status: "complete" as const,
    targetDurationSeconds: 10,
    actualDurationSeconds: 9.9,
  };
  emitChapterTiming(onEvent, timing);
  const emitted = onEvent.mock.calls[0][0];
  expect(emitted.type).toBe("capture_timing");
  expect(CaptureChapterTimingSchema.parse(emitted.data.captureTiming)).toEqual(timing);
  expect(emitted.data).not.toHaveProperty("progressPercent");
});
