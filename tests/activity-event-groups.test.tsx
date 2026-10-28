import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentProgressEvent } from "../src/shared/contracts";
import { activityItems } from "../src/client/agent-activity-model";
import { displayActivityItems } from "../src/client/activity-display";
import { roomActivityStep, roomPreparationSteps } from "../src/client/room/room-activity";

const event = (id: number, data: unknown, type = "tool", jobId?: string): AgentProgressEvent => ({
  id,
  runId: "run",
  jobId,
  type,
  time: `2026-01-01T00:00:${String(id).padStart(2, "0")}Z`,
  message: "Read",
  data,
});
const scope = (id: number, scopeId: string, parentId?: string) =>
  event(
    id,
    {
      activityScope: { id: scopeId, parentId, state: "running", label: `Execution ${scopeId}` },
    },
    "activity_scope",
  );

it("ignores execution hierarchy and replaces event-name duplicates with the latest outcome", () => {
  const events = Array.from({ length: 12 }, (_, i) =>
    scope(i + 1, `level-${i}`, i ? `level-${i - 1}` : undefined),
  );
  const data = {
    purpose: "Full video planning",
    activityScopeId: "level-11",
    invocationId: "first",
    itemId: "first",
    state: "item.started",
  };
  events.push(
    event(20, data),
    { ...event(21, { ...data, itemId: "other" }), message: "inspect_page" },
    event(22, {
      ...data,
      activityScopeId: "level-3",
      invocationId: "next",
      itemId: "next",
      state: "item.completed",
    }),
  );
  const before = JSON.stringify(events);
  const shown = displayActivityItems(activityItems(events));
  expect(shown).toHaveLength(2);
  expect(shown.every((item) => !item.children)).toBe(true);
  expect(shown.at(-1)).toMatchObject({
    id: 20,
    itemId: "next",
    status: "complete",
    time: events.at(-1)!.time,
  });
  expect(shown.some((item) => item.text.startsWith("Execution"))).toBe(false);
  expect(JSON.stringify(events)).toBe(before);
});

it("uses the video event group across execution scopes while keeping separate jobs separate", () => {
  const data = { purpose: "full video generation", invocationId: "call", state: "item.completed" };
  const events = [
    scope(1, "root"),
    scope(2, "nested", "root"),
    event(3, { ...data, activityScopeId: "nested", itemId: "a" }, "tool", "a"),
    event(4, { ...data, activityScopeId: "root", itemId: "b" }, "tool", "b"),
  ];
  const shown = displayActivityItems(activityItems(events));
  expect(shown).toHaveLength(2);
  expect(shown.map((item) => item.text)).toEqual(["Creating your video…", "Creating your video…"]);
  for (const group of shown) {
    expect(group.children).toHaveLength(1);
    expect(group.children![0].children).toBeUndefined();
  }
});

it("keeps preparation checkpoints for events that also carry tracing metadata", () => {
  const items = activityItems([
    scope(1, "root"),
    event(2, {
      activityScopeId: "root",
      purpose: "Project title extraction",
      invocationId: "call",
      itemId: "read",
      state: "item.completed",
    }),
  ]);
  const preparationStep = items[0].preparationStep!;
  expect(preparationStep).toBeTruthy();
  const grouped = roomPreparationSteps({
    key: "main",
    label: "Preparation",
    summary: "",
    status: "loading",
    items,
    checkpoints: [{ key: preparationStep, title: "Project title" }],
  });
  expect(grouped.checkpoints).toHaveLength(1);
  expect(grouped.remaining).toEqual([]);
  expect(renderToStaticMarkup(<>{grouped.checkpoints[0].content}</>)).toContain(
    "Extracting your project title…",
  );
});

it("updates one render group across failed attempts and corrections using recorded scope outcomes", () => {
  const trace = (
    id: number,
    attempt: string,
    state: "running" | "failed" | "complete" | "stopped",
  ) =>
    event(
      id,
      { activityScope: { id: attempt, label: "Rendering your video", state } },
      "activity_scope",
      "video",
    );
  const progress = (id: number, attempt: string, message: string, type = "render_progress") => ({
    ...event(id, { activityScopeId: attempt }, type, "video"),
    message,
  });
  const events = [
    trace(1, "first", "running"),
    progress(2, "first", "Rendering validated composition", "phase"),
    progress(
      3,
      "first",
      "Checking the Multiplane shot: stage size (9/25: shot.html)",
      "validation",
    ),
    trace(4, "first", "failed"),
    {
      ...event(
        5,
        {
          purpose: "playback correction",
          invocationId: "fix",
          itemId: "edit",
          state: "item.completed",
        },
        "tool",
        "video",
      ),
      message: "Edit",
    },
    trace(6, "retry", "running"),
    progress(7, "retry", "Rendering validated composition", "phase"),
    progress(
      8,
      "retry",
      "Checking the Multiplane shot: stage size (2/25: shot.html)",
      "validation",
    ),
  ];
  const source = JSON.stringify(events);
  const render = (input: typeof events) =>
    displayActivityItems(activityItems(input)).filter((item) => item.progressStage === "render");
  const failed = render(events.slice(0, 4));
  expect(failed).toHaveLength(1);
  expect(failed[0]).toMatchObject({ status: "failed", progressPercent: 32 });
  expect(failed[0].children![0].status).toBe("failed");
  const retried = render(events);
  expect(retried).toHaveLength(1);
  expect(retried[0]).toMatchObject({
    status: "running",
    progressPercent: 4,
    activityScopeId: "retry",
  });
  expect(retried[0].children).toHaveLength(1);
  expect(retried[0].children![0].status).toBe("running");
  const stopped = render([...events, trace(9, "retry", "stopped")]);
  expect(stopped[0].status).toBe("stopped");
  const complete = render([
    ...events,
    progress(9, "retry", "Render complete"),
    trace(10, "retry", "complete"),
  ]);
  expect(complete).toHaveLength(1);
  expect(complete[0]).toMatchObject({ status: "complete", progressPercent: 100 });
  expect(JSON.stringify(events)).toBe(source);
  const separate = render([
    ...events,
    { ...progress(11, "other", "Rendering validated composition", "phase"), jobId: "other-video" },
  ]);
  expect(separate).toHaveLength(2);
  const html = renderToStaticMarkup(<>{roomActivityStep(retried[0]).content}</>);
  expect(html.match(/Checking the design and playback/g)).toHaveLength(1);
});

it("nests render warnings and cache-summary tools by ownership without completing render progress", () => {
  const events = [
    {
      ...scope(1, "render"),
      jobId: "video",
      data: {
        activityScope: { id: "render", label: "Rendering your video", state: "running" },
      },
    },
    {
      ...event(2, { activityScopeId: "render" }, "phase", "video"),
      message: "Rendering validated composition",
    },
    {
      ...event(3, { activityScopeId: "render" }, "render_progress", "video"),
      message: "Rendered 3/50",
    },
    { ...scope(4, "summary", "render"), jobId: "video" },
    {
      ...event(5, { activityScopeId: "summary" }, "warning", "video"),
      message: "Render cache review unavailable; rebuilding the affected shot.",
    },
    {
      ...event(
        6,
        {
          activityScopeId: "summary",
          purpose: "Render cache change summary",
          invocationId: "summary-call",
          itemId: "summary-output",
          toolName: "StructuredOutput",
          state: "item.completed",
        },
        "tool",
        "video",
      ),
      message: "StructuredOutput",
    },
    {
      ...event(
        7,
        {
          purpose: "playback correction",
          invocationId: "fix",
          itemId: "edit",
          state: "item.completed",
        },
        "tool",
        "video",
      ),
      message: "Edit",
    },
  ];
  const before = JSON.stringify(events);
  const shown = displayActivityItems(activityItems(events));
  const render = shown.find((item) => item.progressStage === "render")!;
  expect(render).toMatchObject({
    status: "running",
    progressPercent: 6,
    activityScopeId: "render",
  });
  expect(render.children!.map((child) => child.text)).toEqual(
    expect.arrayContaining(["This step needs another check…", "Recording render change summary…"]),
  );
  expect(shown.some((item) => item.text === "Recording render change summary…")).toBe(false);
  expect(shown.some((item) => item.purpose === "playback correction")).toBe(true);
  expect(JSON.stringify(events)).toBe(before);
  const html = renderToStaticMarkup(<>{roomActivityStep(render).content}</>);
  expect(html).toContain("Recording render change summary");
});
