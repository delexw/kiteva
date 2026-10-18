import { Select, Typography } from "antd";
import { videoLanguages, type VideoLanguage } from "../../shared/video-language";

export function VideoLanguageControl({
  value,
  onChange,
}: {
  value?: VideoLanguage;
  onChange: (language: VideoLanguage) => void;
}) {
  return (
    <label className="room-inline-field">
      Video language
      <Select
        aria-label="Video language"
        value={value}
        placeholder="Use idea language"
        options={[...videoLanguages]}
        onChange={onChange}
      />
      <Typography.Text type="secondary">
        Applies to titles, captions, narration and lyrics. Translation runs when you build the
        project. Your original idea stays unchanged.
      </Typography.Text>
    </label>
  );
}
