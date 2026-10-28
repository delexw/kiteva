import { captureChapterRetryLimit } from "../shared/capture-chapters";
import { translateUi } from "./i18n/service";
import type { ActivityItem } from "../shared/activity-model";
import { activityProgressPercent } from "../shared/activity-display";
export * from "../shared/activity-display";

/** One label for progress in the room, conversation and activity panel. */
export function activityLabel(item: ActivityItem): string {
  const label = activityText(item);
  const percent = activityProgressPercent(item);
  return percent === undefined ? label : `${label} · ${Math.floor(percent)}%`;
}

export function activityText(item: ActivityItem): string {
  if (item.subtitleProgress) {
    const progress = item.subtitleProgress;
    return translateUi(
      progress.language === "en"
        ? "Generating English subtitles… {{completed}}/{{total}} cues"
        : "Generating Chinese subtitles… {{completed}}/{{total}} cues",
      {
        completed: String(progress.completed),
        total: String(progress.total),
      },
    );
  }
  if (item.text === "Timing correction attempt")
    return translateUi("Attempt {{attempt}}", { attempt: String(item.correctionAttempt) });
  const timing = item.captureTiming;
  return timing
    ? translateUi(item.text, {
        target: String(Number(timing.targetDurationSeconds.toFixed(2))),
        actual:
          timing.actualDurationSeconds === undefined
            ? ""
            : String(Number(timing.actualDurationSeconds.toFixed(2))),
        revision: String(timing.revision ?? 1),
        limit: String(captureChapterRetryLimit),
      })
    : translateUi(item.text);
}
