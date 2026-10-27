import type { SubtitleCue as Cue } from "./types";
export function subtitleDocuments(cues: Cue[]) {
  const timestamp = (seconds: number, separator: string) => {
    const ms = Math.round(Math.max(0, seconds) * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${separator}${String(ms % 1000).padStart(3, "0")}`;
  };
  const blocks = (separator: string, vtt: boolean) =>
    cues
      .map(
        (cue, i) =>
          `${i + 1}\n${timestamp(cue.startSeconds, separator)} --> ${timestamp(cue.endSeconds, separator)}\n${vtt ? cue.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") : cue.text}\n`,
      )
      .join("\n");
  return { vtt: `WEBVTT\n\n${blocks(".", true)}`, srt: blocks(",", false) };
}
