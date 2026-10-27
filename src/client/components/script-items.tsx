import { Alert, Button, Card, Input, Select, Space, Switch, Typography } from "antd";
import "./script-items.css";
import { SpeechSettings } from "./speech-settings";
import { translateUi, useUiLanguage } from "../i18n";
import { scriptItemsProblem, type ScriptItem } from "../../shared/script-items";

export function ScriptItems({
  items,
  duration,
  onChange,
}: {
  items: ScriptItem[];
  duration: number | "auto";
  onChange: (items: ScriptItem[]) => void;
}) {
  useUiLanguage();
  const change = (index: number, patch: Partial<ScriptItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index: number, offset: number) => {
    const next = [...items];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  const problem = scriptItemsProblem(items, duration);
  return (
    <section className="script-items" aria-label={translateUi("Timed script items")}>
      <Typography.Title level={4}>{translateUi("Timed script items")}</Typography.Title>
      <p>
        {translateUi(
          "Each item has its own time window, text, subtitle visibility and voice. Times are seconds from the start of the film.",
        )}
      </p>
      <Space orientation="vertical" className="script-items-list" size={16}>
        {items.map((item, index) => (
          <Card
            key={item.id}
            className="script-item"
            title={translateUi("Script item {{value0}}", { value0: index + 1 })}
            extra={
              <Space size={4}>
                <Button
                  size="small"
                  aria-label={translateUi("Move item up")}
                  disabled={!index}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="small"
                  aria-label={translateUi("Move item down")}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  size="small"
                  danger
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  {translateUi("Remove item")}
                </Button>
              </Space>
            }
          >
            <div className="script-item-timing">
              <label>
                {translateUi("Start (seconds)")}{" "}
                <Input
                  type="number"
                  aria-label={translateUi("Start (seconds)")}
                  min={0}
                  max={300}
                  step={0.1}
                  value={item.startSeconds}
                  onChange={(event) =>
                    change(index, { startSeconds: event.target.valueAsNumber || 0 })
                  }
                />
              </label>
              <label>
                {translateUi("End (seconds)")}{" "}
                <Input
                  type="number"
                  aria-label={translateUi("End (seconds)")}
                  min={0}
                  max={300}
                  step={0.1}
                  value={item.endSeconds}
                  onChange={(event) =>
                    change(index, { endSeconds: event.target.valueAsNumber || 0 })
                  }
                />
              </label>
            </div>
            <label className="script-item-text">
              <span>{translateUi("Script source")}</span>
              <Select
                aria-label={translateUi("Script source")}
                value={item.source || "provided"}
                options={[
                  { value: "provided", label: translateUi("My script") },
                  { value: "write", label: translateUi("Write a script") },
                ]}
                onChange={(source) => change(index, { source })}
              />
            </label>
            <label className="script-item-text">
              <span>
                {translateUi(item.source === "write" ? "Script instructions" : "Item text")}
              </span>
              <Input.TextArea
                aria-label={translateUi("Item text")}
                value={item.text}
                maxLength={8000}
                autoSize={{ minRows: 2, maxRows: 6 }}
                onChange={(event) => change(index, { text: event.target.value })}
              />
            </label>
            <label className="script-item-subtitles">
              <Switch
                aria-label={translateUi("Show subtitles on screen")}
                checked={item.showSubtitles}
                onChange={(showSubtitles) => change(index, { showSubtitles })}
              />{" "}
              {translateUi("Show subtitles on screen")}
            </label>
            <SpeechSettings
              timedItem
              sharedScript
              audioAssets={[]}
              value={
                item.speech.mode === "narration"
                  ? {
                      ...item.speech,
                      source: "provided",
                      text: item.text,
                      instructions: "",
                      followVideoLanguage: false,
                    }
                  : item.speech
              }
              onChange={(speech) => {
                if (speech.mode === "uploaded") return;
                change(index, {
                  speech:
                    speech.mode === "off"
                      ? speech
                      : {
                          mode: "narration",
                          engine: speech.engine,
                          voice: speech.voice,
                          language: speech.language,
                          volume: speech.volume,
                          speed: speech.speed,
                        },
                });
              }}
            />
          </Card>
        ))}
        <Button
          disabled={items.length >= 80}
          onClick={() => {
            const limit = typeof duration === "number" ? duration : 300;
            const previousEnd = items.length ? items[items.length - 1].endSeconds : 0;
            const startSeconds = previousEnd < limit ? Math.max(0, previousEnd) : 0;
            onChange([
              ...items,
              {
                id: crypto.randomUUID(),
                startSeconds,
                endSeconds: Math.min(
                  startSeconds + 10,
                  typeof duration === "number" ? duration : 300,
                ),
                text: "",
                showSubtitles: true,
                speech: { mode: "off" },
              },
            ]);
          }}
        >
          {translateUi("Add script item")}
        </Button>
        {problem && <Alert type="warning" showIcon title={problem} />}
      </Space>
    </section>
  );
}
