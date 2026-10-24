import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentProgressEvent } from "../src/shared/contracts";
import { activityItems } from "../src/client/agent-activity-model";
import { displayActivityItems } from "../src/client/activity-display";
import { roomPreparationSteps } from "../src/client/room/room-activity";

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
