import type { LanguageMedia } from "../../shared/language-tracks";

/** Resolve artifact URLs once for playback and download consumers. */
export function languageMediaUrls(
  media: LanguageMedia,
  resolve: (file: string) => string,
): LanguageMedia {
  return {
    ...media,
    musicVideo: resolve(media.musicVideo),
    narration: media.narration.map((track) => ({
      ...track,
      video: resolve(track.video),
      audio: resolve(track.audio),
      mix: resolve(track.mix),
    })),
    subtitles: media.subtitles.map((track) => ({
      ...track,
      vtt: resolve(track.vtt),
      srt: resolve(track.srt),
    })),
  };
}
