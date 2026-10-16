import { Mic } from "lucide-react";
import { SettingsSectionHeading } from "./settings-section-heading";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Select, Slider, Space, Typography } from "antd";
import {
  speechVoices,
  type SpeechSettings as Settings,
  type SpeechReadiness,
} from "../../shared/speech";
import { api } from "../lib/api";
import "./speech-settings.css";

const languages: Record<string, string> = {
  "en-us": "English · US",
  "en-gb": "English · UK",
  es: "Spanish",
  "fr-fr": "French",
  ja: "Japanese",
  zh: "Chinese",
};
export function SpeechSettings({
  value,
  onChange,
  audioAssets,
}: {
  value?: Settings;
  onChange: (settings: Settings) => void;
  audioAssets: Array<{ id: string; name: string }>;
}) {
  const [status, setStatus] = useState<SpeechReadiness>();
  const [error, setError] = useState("");
  const [sample, setSample] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<SpeechReadiness>("/api/speech/status", { signal: controller.signal })
      .then(setStatus)
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus({
            available: false,
            detail:
              "Speech service is unavailable. Upload a recording or check the local speech setup.",
          });
      });
    return () => {
      controller.abort();
      revision.current++;
    };
  }, []);
  const selectedVoice = value?.mode === "narration" ? value.voice : "";
  const selectedSpeed = value?.mode === "narration" ? value.speed : 1;
  useEffect(() => {
    revision.current++;
    setSample("");
    setError("");
  }, [selectedVoice, selectedSpeed]);
  const voice =
    value?.mode === "narration"
      ? speechVoices.find((voice) => voice.id === value.voice)!
      : undefined;
  const narrate = () =>
    onChange({
      mode: "narration",
      voice: "af_heart",
      speed: 1,
      source: "lyrics",
      text: "",
      instructions: "",
    });
  const listen = async () => {
    if (value?.mode !== "narration") return;
    const current = ++revision.current;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>("/api/speech/sample", {
        method: "POST",
        body: JSON.stringify(value),
      });
      if (current === revision.current) setSample(result.url);
    } catch (error) {
      if (current === revision.current) setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Speech and vocals" className="speech-settings">
      <SettingsSectionHeading
        title="Speech / vocals"
        description="Choose a narrator or use your own vocal recording."
        icon={<Mic size={18} />}
      />
      <Select
        aria-label="Speech mode"
        style={{ width: "100%" }}
        value={value?.mode || "off"}
        options={[
          { value: "off", label: "Off · on-screen words only" },
          { value: "narration", label: "Narration · local voice" },
          { value: "uploaded", label: "Uploaded speech or singing", disabled: !audioAssets.length },
          { value: "singing", label: "Generated singing · not available", disabled: true },
        ]}
        onChange={(mode) =>
          mode === "narration"
            ? narrate()
            : onChange(mode === "uploaded" ? { mode, assetId: audioAssets[0].id } : { mode: "off" })
        }
      />
      {value?.mode === "uploaded" && (
        <>
          <Select
            aria-label="Vocal recording"
            style={{ width: "100%" }}
            value={value.assetId}
            options={audioAssets.map((asset) => ({ value: asset.id, label: asset.name }))}
            onChange={(assetId) => onChange({ ...value, assetId })}
          />
          <Typography.Text type="secondary">
            Use a voice-only recording for the cleanest mix. Caption timing is not inferred from
            uploaded audio.
          </Typography.Text>
        </>
      )}
      {value?.mode === "narration" && (
        <>
          <Alert
            type={status?.available ? "success" : "info"}
            showIcon
            title={status?.detail || "Checking local speech…"}
          />
          <Select
            aria-label="Speech language"
            style={{ width: "100%" }}
            value={voice?.language}
            options={Object.entries(languages).map(([value, label]) => ({ value, label }))}
            onChange={(language) =>
              onChange({
                ...value,
                voice: speechVoices.find((voice) => voice.language === language)!.id,
              })
            }
          />
          <Space.Compact style={{ width: "100%" }}>
            <Select
              aria-label="Narrator voice"
              style={{ flex: 1 }}
              value={value.voice}
              options={speechVoices
                .filter((item) => item.language === voice?.language)
                .map((item) => ({ value: item.id, label: item.label }))}
              onChange={(voice) => onChange({ ...value, voice })}
            />
            <Button onClick={() => void listen()} loading={busy} disabled={!status?.available}>
              Listen
            </Button>
          </Space.Compact>
          {sample && <audio aria-label="Narrator sample" controls autoPlay src={sample} />}
          <label>
            Speaking speed · {value.speed}×
            <Slider
              aria-label="Speaking speed"
              min={0.75}
              max={1.5}
              step={0.05}
              value={value.speed}
              onChange={(speed) => onChange({ ...value, speed })}
            />
          </label>
          <Select
            aria-label="Narration script source"
            style={{ width: "100%" }}
            value={value.source}
            options={[
              { value: "lyrics", label: "Speak the displayed lyrics" },
              { value: "write", label: "Write a separate narration script" },
              { value: "provided", label: "Use my narration script" },
            ]}
            onChange={(source) => onChange({ ...value, source })}
          />
          {value.source === "provided" && (
            <Input.TextArea
              aria-label="Narration script"
              autoSize={{ minRows: 3, maxRows: 8 }}
              maxLength={8000}
              value={value.text}
              placeholder="Write the words to speak…"
              onChange={(event) => onChange({ ...value, text: event.target.value })}
            />
          )}
          {value.source === "write" && (
            <Input.TextArea
              aria-label="Narration writing direction"
              autoSize={{ minRows: 2, maxRows: 4 }}
              maxLength={2000}
              value={value.instructions}
              placeholder="Language, tone and script direction…"
              onChange={(event) => onChange({ ...value, instructions: event.target.value })}
            />
          )}
          <Typography.Text type="secondary">
            Faceless narration. Voice delivery depends on the selected voice; writing instructions
            guide the script. Direction previews stay silent.
          </Typography.Text>
        </>
      )}
      {error && <Alert type="error" showIcon title={error} />}
    </section>
  );
}
