import { captureChapterRetryLimit } from "../../../../shared/capture-chapters";
import { RetryBudgets } from "../../../../shared/retry-budget";
import { ChapterTimingConflictError } from "../../../capture/chapter-timing";
import { prepareChapterCaptures } from "./workflow";
import { emitChapterTiming } from "./events";

/** Retry chapter capture against the approved budget; assembly waits for every accepted chapter. */
export async function captureWithTimingRetries(
  input: Omit<Parameters<typeof prepareChapterCaptures>[0], "plan" | "timingRetry">,
  capture: typeof prepareChapterCaptures = prepareChapterCaptures,
) {
  const plan = input.job.buildPlan?.value;
  if (plan?.version !== 2 || !plan.capturePlan)
    throw Error("Chapter recovery requires the approved capture plan");
  let timingRetry: Parameters<typeof prepareChapterCaptures>[0]["timingRetry"];
  const attempts = new RetryBudgets();
  for (;;) {
    input.signal.throwIfAborted();
    try {
      return await capture({ ...input, plan: plan.capturePlan, timingRetry });
    } catch (error) {
      input.signal.throwIfAborted();
      if (!(error instanceof ChapterTimingConflictError)) throw error;
      const index = plan.capturePlan.chapters.findIndex(
        (chapter) => chapter.id === error.conflict.chapterId,
      );
      if (index < 0) throw error;
      const chapter = plan.capturePlan.chapters[index];
      const metadata = {
        chapterId: chapter.id,
        title: chapter.title,
        index: index + 1,
        total: plan.capturePlan.chapters.length,
        targetDurationSeconds: chapter.estimatedDurationSeconds,
      };
      emitChapterTiming(input.onEvent, {
        ...metadata,
        phase: "conflict",
        status: "failed",
        actualDurationSeconds: error.conflict.requiredDurationSeconds,
      });
      const attempt = attempts.for(chapter.id, captureChapterRetryLimit).take(input.signal);
      if (!attempt) throw error;
      timingRetry = { ...error.conflict, targetDurationSeconds: chapter.estimatedDurationSeconds };
      emitChapterTiming(input.onEvent, {
        ...metadata,
        phase: "retry",
        status: "complete",
        revision: attempt.number,
      });
    }
  }
}
