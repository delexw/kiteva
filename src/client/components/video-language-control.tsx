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
          "Controls titles, labels, diagrams and credits built into the video. Narration and subtitle tracks have their own language settings.",
        )}
      </Typography.Text>
    </label>
  );
}
