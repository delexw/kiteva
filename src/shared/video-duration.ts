export const MAX_VIDEO_DURATION = 300;
export const MIN_AUTO_VIDEO_DURATION = 15;
export const VIDEO_DURATION_TOLERANCE_SECONDS = 5;

/** Requested length is a target; internal storyboard and media durations remain consistent. */
export function videoDurationRange(targetSeconds: number) {
  return {
    min: Math.max(3, targetSeconds - VIDEO_DURATION_TOLERANCE_SECONDS),
    max: Math.min(MAX_VIDEO_DURATION, targetSeconds + VIDEO_DURATION_TOLERANCE_SECONDS),
  };
}

export function fullVideoDurationMatches(
  actualSeconds: number,
  plannedSeconds: number,
  targetSeconds = plannedSeconds,
) {
  const range = videoDurationRange(targetSeconds);
  return (
    Number.isFinite(actualSeconds) &&
    actualSeconds >= range.min &&
    actualSeconds <= range.max &&
    Math.abs(actualSeconds - plannedSeconds) <= VIDEO_DURATION_TOLERANCE_SECONDS
  );
}
