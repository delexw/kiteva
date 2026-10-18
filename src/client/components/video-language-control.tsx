import { translateUi, useUiLanguage } from "../i18n";
import { Select, Typography } from "antd";
import { videoLanguages, type VideoLanguage } from "../../shared/video-language";

export function VideoLanguageControl({
  value,
  onChange,
}: {
  value?: VideoLanguage;
  onChange: (language: VideoLanguage) => void;
}) {
  useUiLanguage();
  return (
    <label className="room-inline-field">
      {translateUi("Video language")}
      <Select
        aria-label={translateUi("Video language")}
        value={value}
        placeholder={translateUi("Use idea language")}
        options={videoLanguages.map((entry) => ({ ...entry, label: translateUi(entry.label) }))}
        onChange={onChange}
      />
      <Typography.Text type="secondary">
        {translateUi(
          "Applies to titles, captions, narration and lyrics. Translation runs when you build the project. Your original idea stays unchanged.",
        )}
      </Typography.Text>
    </label>
  );
}
