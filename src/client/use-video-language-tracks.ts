import { useEffect, useRef, useState, type RefObject } from "react";
import type { LanguageMedia } from "../shared/language-tracks";

/** Own native media-track selection and seek restoration; no generation or downloads. */
export function useVideoLanguageTracks(
  player: RefObject<HTMLVideoElement | null>,
  src: string | undefined,
  languageMedia?: LanguageMedia,
) {
  const [audioLanguage, setAudioLanguage] = useState<string>(
    languageMedia?.defaultNarration || languageMedia?.narration[0]?.language || "",
  );
  const [subtitleLanguage, setSubtitleLanguage] = useState<string>(
    languageMedia?.defaultSubtitle || "off",
  );
  const pendingSwitch = useRef<{ time: number; playing: boolean } | null>(null);
  const mediaKey = JSON.stringify(languageMedia);
  useEffect(() => {
    setAudioLanguage((current) =>
      languageMedia?.narration.some((track) => track.language === current)
        ? current
        : languageMedia?.defaultNarration || languageMedia?.narration[0]?.language || "",
    );
    setSubtitleLanguage((current) =>
      current === "off" || languageMedia?.subtitles.some((track) => track.language === current)
        ? current
        : "off",
    );
  }, [mediaKey]);
  const playbackSource =
    languageMedia?.narration.find((track) => track.language === audioLanguage)?.video ||
    (languageMedia ? languageMedia.musicVideo : src);
  function selectSubtitles(language: string) {
    const video = player.current;
    if (!video || !languageMedia) return;
    for (const track of video.textTracks)
      track.mode = track.language === language ? "showing" : "disabled";
  }
  useEffect(() => {
    selectSubtitles(subtitleLanguage);
  }, [subtitleLanguage, mediaKey]);

  function changeAudioLanguage(language: string) {
    if (player.current) {
      pendingSwitch.current = { time: player.current.currentTime, playing: !player.current.paused };
      player.current.pause();
    }
    setAudioLanguage(language);
  }
  function restorePlayback(video: HTMLVideoElement) {
    const pending = pendingSwitch.current;
    let playing: Promise<void> | undefined;
    if (pending) {
      video.currentTime = Math.min(pending.time, video.duration || pending.time);
      pendingSwitch.current = null;
      if (pending.playing) playing = video.play();
    }
    selectSubtitles(subtitleLanguage);
    return playing;
  }
  return {
    playbackSource,
    audioLanguage,
    subtitleLanguage,
    changeAudioLanguage,
    changeSubtitleLanguage: setSubtitleLanguage,
    restorePlayback,
    selectSubtitles,
  };
}
