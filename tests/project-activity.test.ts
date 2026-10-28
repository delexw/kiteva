import { expect, it } from "vitest";
import { Store } from "../src/server/jobs/store";
import {
  mergeActivityEvents,
  projectActivityEvent,
  activityPageSize,
  summaryEventLimit,
} from "../src/shared/project-activity";
import type { AgentProgressEvent } from "../src/shared/contracts";
const event = (id: number, type = "render_progress", data?: unknown): AgentProgressEvent => ({
  id,
  runId: "project",
  jobId: "job",
  type,
  time: "2026-01-01T00:00:00Z",
  message: "Rendering 1/2",
  data,
});

it("keeps diagnostic bodies on the backend while preserving labels, outcomes and scopes", () => {
  const raw = event(1, "tool_result", {
    purpose: "full video generation",
    invocationId: "call",
    prompt: "private".repeat(10000),
    results: [{ itemId: "tool", failed: true, output: "large".repeat(10000) }],
  });
  const compact = projectActivityEvent(raw)!;
  expect(compact.data).toEqual({
    purpose: "full video generation",
    invocationId: "call",
    results: [{ itemId: "tool", failed: true }],
  });
  expect(JSON.stringify(compact)).not.toContain("private");
  expect(projectActivityEvent(event(2, "invocation", { prompt: "private" }))).toBeUndefined();
  expect(projectActivityEvent(event(3, "text_delta"))).toBeUndefined();
  expect(
    projectActivityEvent({
      ...event(4, "agent_message", { audience: "customer" }),
      message: "Please sign in",
    })?.message,
  ).toBe("Please sign in");
  expect(raw.data).toHaveProperty("prompt");
});

it("bounds live UI data and keeps a separate bounded allowance for operation ownership", () => {
  let events: AgentProgressEvent[] = [];
  for (let i = 0; i < 4000; i++)
    events = mergeActivityEvents(
      events,
      [event(i, i % 20 === 0 ? "activity_scope" : "render_progress")],
      summaryEventLimit,
    );
  expect(events.filter((e) => e.type !== "activity_scope")).toHaveLength(summaryEventLimit);
  expect(events.filter((e) => e.type === "activity_scope")).toHaveLength(128);
  expect(events.at(-1)?.id).toBe(3999);
  expect(mergeActivityEvents(events, events, summaryEventLimit)).toEqual(events);
});

it("pages stable event windows in both directions without gaps, including hidden diagnostic-only pages", () => {
  const store = new Store(":memory:");
  try {
    store.emit("project", "activity_scope", "Render", "job", {
      activityScope: { id: "render", label: "Rendering your video", state: "running" },
    });
    for (let i = 0; i < 1200; i++)
      store.emit("project", "render_progress", `Rendering ${i}/1200`, "job", {
        activityScopeId: "render",
      });
    const latest = store.activityPage("project");
    expect(latest.events.filter((e) => e.type !== "activity_scope")).toHaveLength(activityPageSize);
    expect(latest).toMatchObject({ hasOlder: true, hasNewer: false });
    expect(latest.events[0].type).toBe("activity_scope");
    const older = store.activityPage("project", latest.before);
    expect(older).toMatchObject({ hasOlder: true, hasNewer: true });
    expect(older.after + 1).toBe(latest.before);
    expect(store.activityPage("project", undefined, older.after).events).toEqual(latest.events);
    const first = store.activityPage("project", older.before);
    expect(first.hasOlder).toBe(false);
    expect(first.after + 1).toBe(older.before);
    for (let i = 0; i < 600; i++)
      store.emit("project", "invocation", "Internal", undefined, { prompt: "private" });
    const hidden = store.activityPage("project");
    expect(hidden.events).toEqual([]);
    expect(hidden.hasOlder).toBe(true);
    expect(store.allEvents("project").at(-1)?.data).toHaveProperty("prompt", "private");
  } finally {
    store.close();
  }
});

it("keeps the shot phase boundary when a bounded window evicts earlier frame counters", () => {
  const phase = {
    ...event(1, "phase"),
    message: "Rendering the Multiplane shot (6/60: shots/example.html)",
  };
  const events = mergeActivityEvents(
    [phase],
    Array.from({ length: 2000 }, (_, i) => event(i + 2)),
    summaryEventLimit,
  );
  expect(events[0]).toEqual(phase);
  expect(events).toHaveLength(summaryEventLimit + 1);
});

it("pages one parent's children without mixing other versions or project preparation", () => {
  const store = new Store(":memory:");
  try {
    for (let i = 0; i < activityPageSize + 10; i++) {
      store.emit("project", "error", "Selected version step", "version-a");
      store.emit("project", "error", "Other version step", "version-b");
    }
    store.emit("project", "error", "Project preparation");
    const first = store.activityPage("project", undefined, undefined, "version-a");
    expect(first.events).toHaveLength(activityPageSize);
    expect(first.events.every((event) => event.jobId === "version-a")).toBe(true);
    expect(first).toMatchObject({ hasOlder: true, hasNewer: false });
    const older = store.activityPage("project", first.before, undefined, "version-a");
    expect(older.events).toHaveLength(10);
    expect(older).toMatchObject({ hasOlder: false, hasNewer: true });
    expect(store.activityPage("project", undefined, older.after, "version-a").events).toEqual(
      first.events,
    );
    expect(
      store.activityPage("project", undefined, undefined, "").events.map((event) => event.message),
    ).toEqual(["Project preparation"]);
    expect(store.activityPage("project", undefined, undefined, "missing")).toMatchObject({
      events: [],
      hasOlder: false,
      hasNewer: false,
    });
  } finally {
    store.close();
  }
});
