import { Alert, Button, Card, Input, Select, Space, Typography } from "antd";
import "./script-items.css";
import { translateUi, useUiLanguage } from "../i18n";
import { scriptItemsProblem, type ScriptItem } from "../../shared/script-items";
import { MAX_VIDEO_DURATION, videoDurationRange } from "../../shared/video-duration";

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
  const durationLimit =
    typeof duration === "number" ? videoDurationRange(duration).max : MAX_VIDEO_DURATION;
  const problem = scriptItemsProblem(items, durationLimit);
  return (
    <section className="script-items" aria-label={translateUi("Timed script items")}>
      <Typography.Title level={4}>{translateUi("Timed script items")}</Typography.Title>
      <p>
        {translateUi(
          "Each item has its own time window and text. Narration, languages, voices and subtitle visibility come from the global settings. Times are seconds from the start of the film.",
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
          </Card>
        ))}
        <Button
          disabled={items.length >= 80}
          onClick={() => {
            const limit = durationLimit;
            const previousEnd = items.length ? items[items.length - 1].endSeconds : 0;
            const startSeconds = previousEnd < limit ? Math.max(0, previousEnd) : 0;
            onChange([
              ...items,
              {
                id: crypto.randomUUID(),
                startSeconds,
                endSeconds: Math.min(startSeconds + 10, durationLimit),
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
