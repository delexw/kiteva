import { useState } from "react";
import { Select } from "antd";
import type { LanguageMedia } from "../../shared/language-tracks";
import { videoLanguageLabel } from "../../shared/video-language";
import { translateUi, useUiLanguage } from "../i18n";
export function LanguageMediaDownloads({
  media,
  downloadName,
}: {
  media: LanguageMedia;
  downloadName: string;
}) {
  useUiLanguage();
  const [language, setLanguage] = useState(media.defaultNarration || media.narration[0]?.language);
  const [subtitle, setSubtitle] = useState(media.subtitles[0]?.language);
  const [audio, setAudio] = useState("mix");
  const selected =
    media.narration.find((track) => track.language === language) || media.narration[0];
  const captions =
    media.subtitles.find((track) => track.language === subtitle) || media.subtitles[0];
  return (
    <section className="language-media-downloads" aria-label={translateUi("Language downloads")}>
      <h4>{translateUi("Language downloads")}</h4>
      {selected ? (
        <>
          <Select
            aria-label={translateUi("Download narration language")}
            value={selected.language}
            options={media.narration.map((track) => ({
              value: track.language,
              label: videoLanguageLabel(track.language),
            }))}
            onChange={setLanguage}
          />
          <a href={selected.video} download={`${downloadName}-${selected.language}.mp4`}>
            {translateUi("Download MP4")}
          </a>
          <Select
            aria-label={translateUi("Download audio type")}
            value={audio}
            options={[
              { value: "mix", label: translateUi("Voice and music") },
              { value: "voice", label: translateUi("Narration only") },
            ]}
            onChange={setAudio}
          />
          <a
            href={audio === "mix" ? selected.mix : selected.audio}
            download={`${downloadName}-${selected.language}-${audio}.${audio === "mix" ? "m4a" : "wav"}`}
          >
            {translateUi("Download audio")}
          </a>
        </>
      ) : (
        <a href={media.musicVideo} download={`${downloadName}.mp4`}>
          {translateUi("Download MP4")}
        </a>
      )}
      {captions && (
        <>
          <Select
            aria-label={translateUi("Download subtitle language")}
            value={captions.language}
            options={media.subtitles.map((track) => ({
              value: track.language,
              label: videoLanguageLabel(track.language),
            }))}
            onChange={setSubtitle}
          />
          <a href={captions.srt} download={`${downloadName}-${captions.language}.srt`}>
            SRT
          </a>{" "}
          <a href={captions.vtt} download={`${downloadName}-${captions.language}.vtt`}>
            VTT
          </a>
        </>
      )}
    </section>
  );
}
