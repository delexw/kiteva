import { videoLanguageLabel } from "../../shared/video-language";
import { translateUi, useUiLanguage } from "../i18n";
import { CheckCircle2, Info, Mic } from "lucide-react";
import { SettingsSectionHeading } from "./settings-section-heading";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Select,
  Slider,
  Space,
  Tooltip,
  Typography,
} from "antd";
import {
  speechVoices,
  speechEngines,
  speechVoicesForEngine,
  pocketLanguages,
  qwenLanguages,
  qwenVoiceGroupsForEngine,
  isQwenSpeechEngine,
  pocketVoiceGroups,
  pocketLanguageForVoice,
  type SpeechSettings as Settings,
  type SpeechReadiness,
} from "../../shared/speech";
import type { VideoLanguage } from "../../shared/video-language";
import { api } from "../lib/api";
import "./speech-settings.css";

const languages: Record<string, string> = {
  en: "English",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
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
  videoLanguage,
  sharedScript = false,
  timedItem = false,
}: {
  value?: Settings;
  onChange: (settings: Settings) => void;
  audioAssets: Array<{ id: string; name: string }>;
  videoLanguage?: VideoLanguage;
  sharedScript?: boolean;
  timedItem?: boolean;
}) {
  useUiLanguage();
  const [status, setStatus] = useState<SpeechReadiness>();
  const [error, setError] = useState("");
  const [sample, setSample] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const engine = value?.mode === "narration" ? value.engine || "kokoro" : "kokoro";
  const voices = speechVoicesForEngine(engine);
  const selectedLanguage = value?.mode === "narration" ? value.language : undefined;
  const selectedVoice = value?.mode === "narration" ? value.voice : "";
  useEffect(() => {
    const controller = new AbortController();
    setStatus(undefined);
    if (value?.mode !== "narration") return;
    void api<SpeechReadiness>(
      `/api/speech/status?engine=${engine}${selectedVoice ? `&voice=${selectedVoice}` : ""}${selectedLanguage ? `&language=${selectedLanguage}` : ""}`,
      { signal: controller.signal },
    )
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
  }, [engine, selectedVoice, selectedLanguage, value?.mode]);
  const selectedSpeed = value?.mode === "narration" ? value.speed : 1;
  const selectedVolume = value?.mode === "narration" ? (value.volume ?? 1) : 1;
  useEffect(() => {
    revision.current++;
    setSample("");
    setError("");
    setBusy(false);
  }, [engine, selectedVoice, selectedSpeed, selectedLanguage, selectedVolume]);
  const voice =
    value?.mode === "narration"
      ? speechVoices.find((voice) => voice.id === value.voice)!
      : undefined;
  const narrate = () =>
    onChange({
      mode: "narration",
      voice: "af_heart",
      speed: 1,
      volume: 1,
      source: "write",
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
    <section aria-label={translateUi("Speech and vocals")} className="speech-settings">
      <SettingsSectionHeading
        title={translateUi("Speech / vocals")}
        description={translateUi(
          timedItem
            ? "Choose a narrator for this item."
            : "Choose a narrator or use your own vocal recording.",
        )}
        icon={<Mic size={18} />}
      />
      <Select
        className={value?.mode === "narration" ? "speech-control-half" : undefined}
        aria-label={translateUi("Speech mode")}
        style={{ width: "100%" }}
        value={value?.mode || "off"}
        options={[
          { value: "off", label: translateUi(timedItem ? "Off" : "Off · on-screen words only") },
          { value: "narration", label: translateUi("Narration · local voice") },
          {
            value: "uploaded",
            label: translateUi("Uploaded speech or singing"),
            disabled: timedItem || !audioAssets.length,
          },
          {
            value: "singing",
            label: translateUi("Generated singing · not available"),
            disabled: true,
          },
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
            aria-label={translateUi("Vocal recording")}
            style={{ width: "100%" }}
            value={value.assetId}
            options={audioAssets.map((asset) => ({ value: asset.id, label: asset.name }))}
            onChange={(assetId) => onChange({ ...value, assetId })}
          />
          <Typography.Text type="secondary">
            {translateUi(
              "Use a voice-only recording for the cleanest mix. Caption timing is not inferred from uploaded audio.",
            )}
          </Typography.Text>
        </>
      )}
      {value?.mode === "narration" && (
        <>
          <Select
            className="speech-control-half"
            aria-label={translateUi("Speech engine")}
            style={{ width: "100%" }}
            value={engine}
            options={speechEngines.map((item) => ({ value: item.id, label: item.label }))}
            onChange={(engine) =>
              onChange({
                ...value,
                engine,
                voice: speechVoicesForEngine(engine)[0].id,
                language: engine === "pocket-tts" || isQwenSpeechEngine(engine) ? "en" : undefined,
              })
            }
          />
          {status?.available ? (
            <Typography.Text type="secondary" className="speech-ready" role="status">
              <CheckCircle2 size={14} aria-hidden="true" />
              {translateUi("Local voice · no provider credits")}
            </Typography.Text>
          ) : (
            <Alert
              type="info"
              showIcon
              title={status?.detail || translateUi("Checking local speech…")}
            />
          )}
          <Select
            className="speech-control-half"
            aria-label={translateUi("Speech language")}
            style={{ width: "100%" }}
            value={
              videoLanguage && value.followVideoLanguage !== false
                ? "follow"
                : selectedLanguage || voice?.language
            }
            options={[
              ...(videoLanguage
                ? [
                    {
                      value: "follow",
                      label: translateUi("Follow video · {{value0}}", {
                        value0: translateUi(videoLanguageLabel(videoLanguage)),
                      }),
                    },
                  ]
                : []),
              ...(engine === "pocket-tts" || isQwenSpeechEngine(engine)
                ? (isQwenSpeechEngine(engine) ? qwenLanguages : pocketLanguages).map(
                    (language) => ({
                      value: language.id,
                      label: translateUi(language.label),
                    }),
                  )
                : Object.entries(languages)
                    .filter(([language]) => voices.some((voice) => voice.language === language))
                    .map(([value, label]) => ({ value, label: translateUi(label) }))),
            ]}
            onChange={(language) => {
              if (language === "follow") {
                onChange({ ...value, followVideoLanguage: true });
                return;
              }
              onChange(
                isQwenSpeechEngine(engine)
                  ? { ...value, followVideoLanguage: false, language }
                  : engine === "pocket-tts"
                    ? {
                        ...value,
                        followVideoLanguage: false,
                        language,
                        voice:
                          language === "zh"
                            ? "pocket_zh_xiaobei"
                            : pocketLanguageForVoice(value.voice)?.id === "zh"
                              ? "pocket_alba"
                              : value.voice,
                      }
                    : {
                        ...value,
                        followVideoLanguage: false,
                        language: undefined,
                        voice: voices.find((voice) => voice.language === language)!.id,
                      },
              );
            }}
          />
          <Space.Compact className="speech-control-half" style={{ width: "100%" }}>
            <Select<string>
              aria-label={translateUi("Narrator voice")}
              style={{ flex: 1 }}
              value={value.voice}
              options={
                isQwenSpeechEngine(engine)
                  ? qwenVoiceGroupsForEngine(engine).map((group) => ({
                      ...group,
                      label: translateUi(group.label),
                    }))
                  : engine === "pocket-tts"
                    ? pocketVoiceGroups
                        .map((group) => ({
                          ...group,
                          label: translateUi(group.label),
                          options: group.options.filter((option) =>
                            Boolean(
                              pocketLanguageForVoice(
                                option.value,
                                selectedLanguage || voice?.language,
                              ),
                            ),
                          ),
                        }))
                        .filter((group) => group.options.length)
                    : voices
                        .filter((item) => item.language === voice?.language)
                        .map((item) => ({ value: item.id, label: item.label }))
              }
              onChange={(voice) => onChange({ ...value, voice })}
            />
            <Button onClick={() => void listen()} loading={busy} disabled={!status?.available}>
              {translateUi("Listen")}
            </Button>
          </Space.Compact>
          {sample && (
            <audio aria-label={translateUi("Narrator sample")} controls autoPlay src={sample} />
          )}
          <div className="speech-control-half speech-adjustment">
            <span className="speech-control-label">
              {translateUi("Volume") + " "}
              <span>{Math.round((value.volume ?? 1) * 100)}%</span>
              <Tooltip
                title={translateUi(
                  "Voice levels are matched automatically, with clipping protection. Applies to Listen and the finished project.",
                )}
              >
                <button
                  type="button"
                  className="speech-help"
                  aria-label={translateUi("About narration volume")}
                >
                  <Info size={14} />
                </button>
              </Tooltip>
            </span>
            <Slider
              ariaLabelForHandle={translateUi("Narration volume")}
              ariaValueTextFormatterForHandle={(volume) => `${volume}%`}
              min={0}
              max={200}
              step={5}
              value={(value.volume ?? 1) * 100}
              onChange={(volume) => onChange({ ...value, volume: volume / 100 })}
            />
          </div>
          <div className="speech-control-half speech-adjustment">
            <span className="speech-control-label">
              {translateUi("Speed") + " "}
              <span>{value.speed}×</span>
            </span>
            <Slider
              ariaLabelForHandle={translateUi("Speaking speed")}
              min={0.75}
              max={1.5}
              step={0.05}
              value={value.speed}
              onChange={(speed) => onChange({ ...value, speed })}
            />
          </div>
          {!timedItem && (
            <label className="speech-control-half speech-adjustment">
              <span className="speech-control-label">
                {translateUi("Narration starts at (seconds)")}
              </span>
              <InputNumber
                min={0}
                max={300}
                step={0.1}
                value={value.startSeconds ?? 0}
                aria-label={translateUi("Narration starts at (seconds)")}
                onChange={(startSeconds) => onChange({ ...value, startSeconds: startSeconds ?? 0 })}
              />
            </label>
          )}
          {!sharedScript && (
            <>
              <Typography.Text className="speech-script-label">
                {translateUi("Script")}
              </Typography.Text>
              <Select
                aria-label={translateUi("Narration script source")}
                style={{ width: "100%" }}
                value={value.source}
                options={[
                  { value: "subtitles", label: translateUi("Speak the displayed subtitles") },
                  { value: "write", label: translateUi("Write a separate narration script") },
                  { value: "provided", label: translateUi("Use my narration script") },
                ]}
                onChange={(source) => onChange({ ...value, source })}
              />
              {value.source === "provided" && (
                <Input.TextArea
                  aria-label={translateUi("Narration script")}
                  autoSize={{ minRows: 3, maxRows: 8 }}
                  maxLength={8000}
                  value={value.text}
                  placeholder={translateUi("Write the words to speak…")}
                  onChange={(event) => onChange({ ...value, text: event.target.value })}
                />
              )}
              {value.source === "write" && (
                <Input.TextArea
                  aria-label={translateUi("Narration writing direction")}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  maxLength={2000}
                  value={value.instructions}
                  placeholder={translateUi("Language, tone and script direction…")}
                  onChange={(event) => onChange({ ...value, instructions: event.target.value })}
                />
              )}
            </>
          )}
          {!sharedScript && (
            <Typography.Text type="secondary" className="speech-footnote">
              {translateUi(
                "Writing instructions guide the script. Direction previews stay silent.",
              )}
            </Typography.Text>
          )}
        </>
      )}
      {error && <Alert type="error" showIcon title={error} />}
    </section>
  );
}
