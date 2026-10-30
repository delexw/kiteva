import { useEffect, useRef, useState, type RefObject } from "react";
import type { LanguageMedia } from "../shared/language-tracks";

/** Own audio-language selection and seek restoration; subtitles are authored in the video. */
export function useVideoLanguageTracks(
  player: RefObject<HTMLVideoElement | null>,
  src: string | undefined,
  languageMedia?: LanguageMedia,
) {
  const [audioLanguage, setAudioLanguage] = useState<string>(
    languageMedia?.defaultNarration || languageMedia?.narration[0]?.language || "",
  );
  const pendingSwitch = useRef<{ time: number; playing: boolean } | null>(null);
  const mediaKey = JSON.stringify(languageMedia);
  useEffect(() => {
    setAudioLanguage((current) =>
      languageMedia?.narration.some((track) => track.language === current)
        ? current
        : languageMedia?.defaultNarration || languageMedia?.narration[0]?.language || "",
    );
  }, [mediaKey]);
  const playbackSource =
    languageMedia?.narration.find((track) => track.language === audioLanguage)?.video ||
    (languageMedia ? languageMedia.musicVideo : src);

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
    return playing;
  }
  return {
    playbackSource,
    audioLanguage,
    changeAudioLanguage,
    restorePlayback,
  };
}
