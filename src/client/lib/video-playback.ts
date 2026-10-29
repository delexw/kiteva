export function playbackTime(seconds: number) {
  const time = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(time / 60)
    .toString()
    .padStart(2, "0")}:${(time % 60).toString().padStart(2, "0")}`;
}

/** Only one audible player owns playback; silent looping previews may keep running. */
export function pauseOtherPlayback(active?: HTMLMediaElement) {
  for (const media of document.querySelectorAll<HTMLMediaElement>("video, audio"))
    if (media !== active && !media.paused && !media.muted) media.pause();
}
