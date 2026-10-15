import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityRow, AgentActivity, ProgressDisclosure } from "../src/client/agent-activity";
import { activityItems, mergeProgressItems } from "../src/client/agent-activity-model";
import type { AgentProgressEvent } from "../src/shared/contracts";
function event(
  id: number,
  type: string,
  message: string,
  jobId = "a",
  data?: unknown,
): AgentProgressEvent {
  return {
    id,
    runId: "project",
    jobId,
    type,
    message,
    time: "2026-10-11T00:00:00Z",
    data: { audience: "customer", ...(data as object) },
  };
}
describe("readable agent activity", () => {
  it("shows branded loading only while the grouped progress is active", () => {
    const items = [
      {
        id: 1,
        scope: "project",
        kind: "tool" as const,
        text: "Reading project content…",
        time: "2026-10-11T00:00:00Z",
      },
    ];
    for (const active of [true, false]) {
      const html = renderToStaticMarkup(
        <ProgressDisclosure items={items} title="Project preparation" active={active} />,
      );
      expect(html).toContain("/kiteva-mark.svg");
      expect(html).not.toContain("lucide-brain");
      expect(html.includes("progress-kiteva-mark-loading")).toBe(active);
      expect(html.includes("Thinking…")).toBe(active);
      expect(html).toContain('aria-expanded="false"');
    }
  });
  it("hides internal failed and stopped indicators while keeping useful progress", () => {
    for (const status of ["failed", "stopped"] as const) {
      const html = renderToStaticMarkup(
        <ActivityRow
          item={{
            id: 1,
            scope: "project",
            kind: "tool",
            text: "Reading project content…",
            time: "2026-10-11T00:00:00Z",
            status,
          }}
        />,
      );
      expect(html).toContain("Reading project content…");
      expect(html).not.toContain('role="img"');
    }
    for (const status of ["running", "complete"] as const) {
      const html = renderToStaticMarkup(
        <ActivityRow
          item={{
            id: 1,
            scope: "project",
            kind: "tool",
            text: "Reading project content…",
            time: "2026-10-11T00:00:00Z",
            status,
          }}
        />,
      );
      expect(html).toContain(`aria-label="${status === "running" ? "Working" : "Done"}"`);
    }
  });
  it("streams fragments into one message and replaces the completed duplicate", () => {
    const events = [event(1, "text_delta", "Building "), event(2, "text_delta", "geometry.")];
    expect(activityItems(events)).toMatchObject([{ text: "Building geometry.", streaming: true }]);
    events.push(event(3, "agent_message", "Building geometry."));
    expect(activityItems(events)).toMatchObject([{ text: "Building geometry.", streaming: false }]);
  });
  it("separates concurrent candidates and content blocks and ignores reconnect duplicates", () => {
    const first = event(1, "text_delta", "One", "a");
    const items = activityItems([
      first,
      first,
      event(2, "text_delta", "Two", "b"),
      event(3, "text_start", "", "a"),
      event(4, "text_delta", "Next", "a"),
    ]);
    expect(items.map((item) => item.text)).toEqual(["One", "Two", "Next"]);
  });
  it("updates Codex cumulative messages and tool calls in place", () => {
    const items = activityItems([
      event(1, "agent_message", "Building", "a", { itemId: "text", state: "item.started" }),
      event(2, "agent_message", "Building shapes", "a", { itemId: "text", state: "item.updated" }),
      event(3, "agent_message", "Building shapes.", "a", {
        itemId: "text",
        state: "item.completed",
      }),
      event(4, "command_execution", "render\n", "a", { itemId: "cmd", state: "item.started" }),
      event(5, "command_execution", "render\nDone", "a", {
        itemId: "cmd",
        state: "item.completed",
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ text: "Building shapes.", streaming: false });
    expect(items[1]).toMatchObject({
      text: "Working on your project…",
      status: "complete",
    });
  });
  it("matches tool progress and results by identity, including parallel failures", () => {
    const items = activityItems([
      event(1, "tool", "Read", "a", { itemId: "one" }),
      event(2, "tool", "Write", "a", { itemId: "two" }),
      event(3, "tool_progress", "Read · 2s", "a", { itemId: "one", toolName: "Read" }),
      event(4, "tool_result", "", "a", {
        results: [
          { itemId: "one", failed: true, output: "Denied" },
          { itemId: "two", failed: false, output: "Saved" },
        ],
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.status)).toEqual(["failed", "complete"]);
  });
  it("renders messages and named tools without SDK labels, usage JSON or duplicate tool messages", () => {
    const html = renderToStaticMarkup(
      <AgentActivity
        events={[
          event(1, "state", "Workflow updated"),
          event(2, "session", "Claude session opened"),
          event(3, "text_delta", "**Building** shapes."),
          event(4, "agent_message", "**Building** shapes."),
          event(5, "tool", "Bash", "a", { itemId: "tool" }),
          event(6, "agent_message", "Tool: Bash", "a", { audience: "internal" }),
          event(7, "tool_result", "ok"),
          event(8, "usage", "Turn complete", "a", { cost: 1.23 }),
        ]}
      />,
    );
    expect(html).toContain('data-streamdown="strong">Building');
    expect(html).toContain("Working on your project…");
    expect(html).not.toContain("View result");
    expect(html).not.toContain("Bash");
    for (const hidden of [
      "text_delta",
      "agent_message",
      "tool_result",
      "Workflow updated",
      "Tool: Bash",
      "1.23",
    ])
      expect(html).not.toContain(hidden);
  });
});
it("reuses the streaming activity display within the progress area", () => {
  const html = renderToStaticMarkup(
    <AgentActivity variant="progress" events={[event(1, "text_delta", "Planning your story.")]} />,
  );
  expect(html).toContain("activity-panel activity-progress");
  expect(html).toContain("Live progress");
  expect(html).toContain("Planning your story.");
  expect(html).not.toContain("text_delta");
});

it("shows customer actions without commands, tool results, paths or export promotions", () => {
  const html = renderToStaticMarkup(
    <AgentActivity
      events={[
        event(1, "tool", "Read", "a", { itemId: "read" }),
        event(2, "tool_result", "/Users/private/storyboard.json", "a"),
        event(3, "file_change", "update: /Users/private/index.html", "a", { itemId: "edit" }),
        event(4, "render_progress", "Keep editing with Framey in HyperFrames https://example.com"),
        event(5, "render_progress", "/Users/private/preview.mp4"),
        event(6, "text_delta", "Let me check HyperFrames audio syntax.", "a", {
          audience: "internal",
        }),
        event(7, "text_start", ""),
        event(8, "text_delta", "Refining the scene."),
      ]}
    />,
  );
  expect(html).toContain("Reading project content…");
  expect(html).toContain("Updating the design…");
  expect(html).toContain("Creating your video…");
  expect(html).toContain("Refining the scene.");
  for (const hidden of [
    "/Users/",
    "storyboard.json",
    "index.html",
    "preview.mp4",
    "Framey",
    "HyperFrames",
    "https://",
    "View result",
  ])
    expect(html).not.toContain(hidden);
});

it("hides raw narration regardless of its vocabulary, including legacy events and split streams", () => {
  const text = "Next I'll generate the code-made score and check the palette with chroma-js.";
  for (const narration of [text, "This scene looks great.", "The Miro tools are not needed."]) {
    const raw = ["agent_message", "reasoning", "text_delta"].map((type, i) => ({
      ...event(i + 1, type, narration),
      data: undefined,
    }));
    expect(activityItems(raw)).toEqual([]);
    expect(activityItems(raw.map((e) => ({ ...e, data: { audience: "internal" } })))).toEqual([]);
  }
  expect(
    activityItems([
      event(1, "text_delta", "Next I'll", "a", { audience: "internal" }),
      event(2, "text_delta", " generate sound", "a", { audience: "internal" }),
    ]),
  ).toEqual([]);
  // Visibility follows structured intent, never the words in the message.
  expect(activityItems([event(1, "agent_message", text)])).toMatchObject([{ text }]);
  expect(activityItems([event(1, "reasoning", text)])).toEqual([]);
});

it("groups consecutive identical progress within a job without mixing candidates", () => {
  const items = activityItems([
    event(1, "tool", "Bash", "a", { itemId: "a1" }),
    event(2, "tool_result", "done", "a"),
    event(3, "tool", "Bash", "a", { itemId: "a2" }),
    event(4, "tool_result", "done", "a"),
    event(5, "tool", "Bash", "b", { itemId: "b1" }),
    event(6, "tool_result", "done", "b"),
    event(7, "tool", "Bash", "a", { itemId: "a3" }),
    event(8, "tool_result", "", "a", {
      results: [{ itemId: "a3", failed: true, output: "private" }],
    }),
  ]);
  expect(items).toHaveLength(3);
  expect(items[0]).toMatchObject({ jobId: "a", repetitions: 2, status: "complete" });
  expect(items[1]).toMatchObject({ jobId: "b", status: "complete" });
  expect(items[2]).toMatchObject({ jobId: "a", status: "failed" });
  const html = renderToStaticMarkup(
    <AgentActivity
      events={[
        event(1, "tool", "Read"),
        event(2, "tool_result", "done"),
        event(3, "tool", "Read"),
        event(4, "tool_result", "done"),
      ]}
    />,
  );
  expect(html).toContain("2 updates");
  expect(html).toMatch(/class="[^"]*activity-content/);
  expect(html).not.toContain("<header>");
});
it("adds existing update counts and stops grouping when the message changes", () => {
  const base = {
    id: 1,
    scope: "project:a",
    kind: "tool" as const,
    text: "Working on your project…",
    time: "2026-10-11T00:00:00Z",
    status: "complete" as const,
    repetitions: 2,
  };
  expect(mergeProgressItems(base, { ...base, id: 2, repetitions: 3 })).toMatchObject({
    repetitions: 5,
  });
  expect(mergeProgressItems(base, { ...base, scope: "project:b" })).toBeUndefined();
  expect(mergeProgressItems(base, { ...base, text: "Updating the design…" })).toBeUndefined();
  const items = activityItems([
    event(1, "tool", "Bash", "a", { itemId: "a" }),
    event(2, "tool", "Write", "a", { itemId: "b" }),
    event(3, "tool", "Bash", "a", { itemId: "c" }),
  ]);
  expect(items.map((item) => item.text)).toEqual([
    "Working on your project…",
    "Updating the design…",
    "Working on your project…",
  ]);
  expect(items.every((item) => !item.repetitions)).toBe(true);
});

it("shows automatic capacity retry progress within the owning job", () => {
  const items = activityItems([
    event(1, "retry", "Internal detail", "preview-a", { reason: "model_capacity" }),
  ]);
  expect(items).toMatchObject([
    { jobId: "preview-a", kind: "notice", text: "Model is busy. Retrying automatically…" },
  ]);
});
