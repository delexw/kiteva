import { FileVideo, AudioLines, FileText } from "lucide-react";
import { useState } from "react";
import { Button, ConfigProvider, Flex, Select } from "antd";
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
    <ConfigProvider getPopupContainer={(trigger) => trigger?.parentElement ?? document.body}>
      <section
        className="language-media-downloads"
        style={{ width: "max-content", maxWidth: "calc(100vw - 48px)" }}
        aria-label={translateUi("Language downloads")}
      >
        <h4>{translateUi("Language downloads")}</h4>
        <Flex gap="middle" wrap align="center">
          {selected ? (
            <Flex gap="middle" wrap align="center">
              <Flex gap="small" wrap align="center">
                <Select
                  aria-label={translateUi("Download narration language")}
                  value={selected.language}
                  options={media.narration.map((track) => ({
                    value: track.language,
                    label: videoLanguageLabel(track.language),
                  }))}
                  onChange={setLanguage}
                />
                <Button
                  aria-label={translateUi("Download MP4")}
                  title={translateUi("Download MP4")}
                  icon={<FileVideo size={18} />}
                  href={selected.video}
                  download={`${downloadName}-${selected.language}.mp4`}
                ></Button>
              </Flex>
              <Flex gap="small" wrap align="center">
                <Select
                  aria-label={translateUi("Download audio type")}
                  value={audio}
                  options={[
                    { value: "mix", label: translateUi("Voice and music") },
                    { value: "voice", label: translateUi("Narration only") },
                  ]}
                  onChange={setAudio}
                />
                <Button
                  aria-label={translateUi("Download audio")}
                  title={translateUi("Download audio")}
                  icon={<AudioLines size={18} />}
                  href={audio === "mix" ? selected.mix : selected.audio}
                  download={`${downloadName}-${selected.language}-${audio}.${audio === "mix" ? "m4a" : "wav"}`}
                ></Button>
              </Flex>
            </Flex>
          ) : (
            <Button href={media.musicVideo} download={`${downloadName}.mp4`}>
              {translateUi("Download MP4")}
            </Button>
          )}
          {captions && (
            <Flex gap="small" wrap align="center">
              <Select
                aria-label={translateUi("Download subtitle language")}
                value={captions.language}
                options={media.subtitles.map((track) => ({
                  value: track.language,
                  label: videoLanguageLabel(track.language),
                }))}
                onChange={setSubtitle}
              />
              <Button
                aria-label="SRT"
                title="SRT"
                icon={<FileText size={18} />}
                href={captions.srt}
                download={`${downloadName}-${captions.language}.srt`}
              >
                SRT
              </Button>
              <Button
                aria-label="VTT"
                title="VTT"
                icon={<FileText size={18} />}
                href={captions.vtt}
                download={`${downloadName}-${captions.language}.vtt`}
              >
                VTT
              </Button>
            </Flex>
          )}
        </Flex>
      </section>
    </ConfigProvider>
  );
}
