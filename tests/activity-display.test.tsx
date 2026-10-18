import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { displayActivityItems } from "../src/client/activity-display";
import { activityItems, type ActivityItem } from "../src/client/agent-activity-model";
import { uiLanguage } from "../src/client/i18n/service";
import { roomActivityStep } from "../src/client/room/room-activity";

const item = (id: number, change: Partial<ActivityItem> = {}): ActivityItem => ({
  id,
  scope: "job",
  jobId: "job",
  invocationId: "call",
  purpose: "full video generation",
  kind: "tool",
  text: "Building your full video…",
  time: "2026-10-19T00:00:00Z",
  status: "complete",
  ...change,
});
it("shows one video task around a recorded instrumental step, without duplicate building rows or counts", () => {
  const source = [
    item(1, { repetitions: 15 }),
    item(2, { text: "Rendering your instrumental music…" }),
    item(3, { repetitions: 2 }),
  ];
  const before = JSON.stringify(source);
  const shown = displayActivityItems(source);
  expect(shown).toHaveLength(1);
  expect(shown[0]).toMatchObject({
    text: "Creating your video…",
    children: [{ text: "Rendering your instrumental music…", status: "complete" }],
  });
  expect(shown[0].status).toBeUndefined();
  expect(shown[0].repetitions).toBeUndefined();
  expect(JSON.stringify(source)).toBe(before);
  const step = roomActivityStep(shown[0]);
  expect(step.title).toBe("Creating your video…");
  expect(step.status).toBeUndefined();
  const children = renderToStaticMarkup(<>{step.content}</>);
  expect(children).toContain("Rendering your instrumental music…");
  expect(children).toContain("success");
});
it("preserves running and failed capability statuses without claiming video completion", () => {
  const [shown] = displayActivityItems([
    item(1),
    item(2, { text: "Recording your website reference…", status: "failed" }),
    item(3, { status: "running" }),
  ]);
  expect(shown.status).toBe("running");
  expect(shown.children?.[0].status).toBe("failed");
});
it("does not merge different jobs, model invocations, or review and repair tasks", () => {
  const shown = displayActivityItems([
    item(1),
    item(2, { invocationId: "second" }),
    item(3, { scope: "other-job" }),
    item(4, { purpose: "Result quality review", text: "Reviewing your finished result…" }),
    item(5, { purpose: "technical correction", text: "Fixing playback issues…" }),
  ]);
  expect(shown).toHaveLength(5);
  expect(shown.slice(3).map((i) => i.text)).toEqual([
    "Reviewing your finished result…",
    "Fixing playback issues…",
  ]);
});
it("keeps legacy labels, customer messages and preview tasks, while hiding action counts", () => {
  const shown = displayActivityItems([
    item(1, { purpose: undefined, text: "Reading project content…", repetitions: 5 }),
    item(2, { kind: "message", text: "Your original message" }),
    item(3, { purpose: "preview video generation", text: "Building your video preview…" }),
  ]);
  expect(shown.map((i) => i.text)).toEqual([
    "Reading project content…",
    "Your original message",
    "Building your video preview…",
  ]);
  expect(shown.every((i) => i.repetitions === undefined)).toBe(true);
  expect(String(roomActivityStep(shown[0]).title)).not.toContain("×");
});
it("uses only curated event labels and keeps raw content out of the presentation", () => {
  const events = [
    {
      id: 1,
      runId: "run",
      jobId: "job",
      time: "2026-10-19T00:00:00Z",
      type: "command_execution",
      message: "private command and filename",
      data: { purpose: "full video generation", invocationId: "call", itemId: "tool" },
    },
  ];
  const shown = displayActivityItems(activityItems(events));
  expect(shown[0].text).toBe("Creating your video…");
  expect(JSON.stringify(shown)).not.toContain("private command");
  expect(renderToStaticMarkup(<>{roomActivityStep(shown[0]).description}</>)).not.toContain(
    "private command",
  );
});

it("translates the video parent and recorded child capabilities into Chinese", async () => {
  try {
    await uiLanguage.change("zh-CN");
    const [shown] = displayActivityItems([
      item(1),
      item(2, { text: "Rendering your instrumental music…" }),
    ]);
    expect(roomActivityStep(shown).title).toBe("正在创作你的视频…");
    expect(renderToStaticMarkup(<>{roomActivityStep(shown).content}</>)).toContain(
      "正在渲染器乐配乐…",
    );
  } finally {
    await uiLanguage.change("en");
  }
});

it("shows each recorded capability once within its task while retaining failures and active work", () => {
  const [shown] = displayActivityItems([
    item(1, { text: "Exploring your website reference…" }),
    item(2, { text: "Capturing your website reference…", status: "failed" }),
    item(3, { text: "Exploring your website reference…" }),
    item(4, { text: "Capturing your website reference…" }),
    item(5, { text: "Exploring your website reference…", status: "running" }),
  ]);
  expect(shown.children?.map((child) => [child.text, child.status])).toEqual([
    ["Exploring your website reference…", "running"],
    ["Capturing your website reference…", "failed"],
  ]);
});

it("advances the existing video group's timestamp and exposes the recorded details step", () => {
  const [shown] = displayActivityItems([
    item(1, { time: "2026-10-19T00:00:00Z" }),
    item(2, { time: "2026-10-19T00:02:00Z" }),
    item(3, { text: "Recording video details…", status: "running", time: "2026-10-19T00:04:00Z" }),
  ]);
  expect(shown.time).toBe("2026-10-19T00:04:00Z");
  expect(shown.status).toBe("running");
  expect(shown.children?.map((child) => child.text)).toEqual(["Recording video details…"]);
});
