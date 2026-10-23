export interface ChapterTimingConflict {
  chapterId: string;
  targetDurationSeconds: number;
  requiredDurationSeconds: number;
  reason: string;
}

export class ChapterTimingConflictError extends Error {
  constructor(readonly conflict: ChapterTimingConflict) {
    super(
      `Chapter timing conflict: ${conflict.chapterId} requires ${conflict.requiredDurationSeconds}s within a ${conflict.targetDurationSeconds}s budget. ${conflict.reason}`,
    );
    this.name = "ChapterTimingConflictError";
  }
}

/** Accept at most one 60 fps frame of container rounding, never seconds of overrun. */
export function validateChapterTiming(
  duration: number,
  target: number,
  hasCuts: boolean,
  chapterId = "capture",
) {
  if (hasCuts)
    throw Error(
      "Chapter footage must preserve the complete sequence. Remove trims and use native speed regions instead.",
    );
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(target) || target <= 0)
    throw Error("Chapter timing requires positive measured and target durations");
  if (duration > target + 1 / 60)
    throw new ChapterTimingConflictError({
      chapterId,
      targetDurationSeconds: target,
      requiredDurationSeconds: duration,
      reason:
        "Use native speed regions on slow portions and re-export within the unchanged chapter budget. If it remains unreadable, return a structured timingConflict so the chapter worker can record a focused replacement. Assembly waits for an accepted export.",
    });
}
