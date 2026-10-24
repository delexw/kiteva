import { expect, it } from "vitest";
import { validateChapterTiming } from "../src/server/capture/chapter-timing";

it("allows full exports inside budget with one frame of container rounding", () => {
  expect(() => validateChapterTiming(9, 10, false)).not.toThrow();
  expect(() => validateChapterTiming(10.016, 10, false)).not.toThrow();
  expect(() => validateChapterTiming(10.02, 10, false)).toThrow("timing conflict");
});
it("rejects cuts even if their duration fits", () => {
  expect(() => validateChapterTiming(8, 10, true)).toThrow("complete sequence");
});
it.each([0, -1, NaN, Infinity])("rejects invalid durations %s", (duration) => {
  expect(() => validateChapterTiming(duration, 10, false)).toThrow();
  expect(() => validateChapterTiming(10, duration, false)).toThrow();
});

it.each([9, 10, 10.016, NaN, Infinity])(
  "rejects a reported timing conflict without an actual overrun: %s",
  async (duration) => {
    const { ChapterTimingConflictError } = await import("../src/server/capture/chapter-timing");
    expect(
      () =>
        new ChapterTimingConflictError({
          chapterId: "chapter",
          targetDurationSeconds: 10,
          requiredDurationSeconds: duration,
          reason: "Recording failed",
        }),
    ).toThrow("requires a measured duration exceeding its budget");
  },
);
