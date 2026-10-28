import { Select } from "antd";
import type { LanguageMedia } from "../../shared/language-tracks";
import { videoLanguageLabel } from "../../shared/video-language";
import { translateUi, useUiLanguage } from "../i18n";
export function LanguagePlaybackControls({
  media,
  audioLanguage,
  subtitleLanguage,
  onAudioChange,
  onSubtitleChange,
}: {
  media: LanguageMedia;
  audioLanguage: string;
  subtitleLanguage: string;
  onAudioChange: (language: string) => void;
  onSubtitleChange: (language: string) => void;
}) {
  useUiLanguage();
  return (
    <div className="kiteva-language-controls">
      {media.narration.length > 0 && (
        <label>
          {translateUi("Narration language")}
          <Select
            aria-label={translateUi("Narration language")}
            getPopupContainer={(trigger) => trigger.parentElement!}
            value={audioLanguage}
            options={media.narration.map((track) => ({
              value: track.language,
              label: videoLanguageLabel(track.language),
            }))}
            onChange={onAudioChange}
          />
        </label>
      )}
      <label>
        {translateUi("Subtitle language")}
        <Select
          aria-label={translateUi("Subtitle language")}
          getPopupContainer={(trigger) => trigger.parentElement!}
          value={subtitleLanguage}
          options={[
            { value: "off", label: translateUi("Off") },
            ...media.subtitles.map((track) => ({
              value: track.language,
              label: videoLanguageLabel(track.language),
            })),
          ]}
          onChange={onSubtitleChange}
        />
      </label>
    </div>
  );
}
