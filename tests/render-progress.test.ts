import { expect, it } from "vitest";
import { renderProgressUpdate } from "../src/client/render-progress";
import { activityItems } from "../src/client/agent-activity-model";
import {
  activityLabel,
  activityProgressPercent,
  latestActivityProgress,
  displayActivityItems,
} from "../src/client/activity-display";
import type { AgentProgressEvent } from "../src/shared/contracts";
const event = (id: number, type: string, message: string, jobId = "full"): AgentProgressEvent => ({
  id,
  type,
  message,
  jobId,
  runId: "example",
  time: `2026-10-22T00:00:${String(id).padStart(2, "0")}Z`,
});
it("tracks saved segmented render messages without resetting on encoding or the next shot", () => {
  const start = renderProgressUpdate(
    event(1, "phase", "Rendering the Multiplane shot (20/35: shots/a2-14.html)"),
  )!;
  expect(start.percent).toBeCloseTo((19 / 35) * 100);
  const capture = renderProgressUpdate(
    event(2, "render_progress", "capture: 120/240 frames"),
    start,
  )!;
  expect(capture.percent).toBeCloseTo((19.5 / 35) * 100);
  expect(
    renderProgressUpdate(event(3, "render_progress", "encode: 0/240 frames"), capture)?.percent,
  ).toBe(capture.percent);
  const finish = renderProgressUpdate(
    event(4, "render_progress", "finalize: 240/240 frames"),
    capture,
  )!;
  expect(finish.percent).toBeCloseTo((20 / 35) * 100);
  const next = renderProgressUpdate(
    event(
      5,
      "validation",
      "Checking the Multiplane shot: stage size, duration and frame rate (21/35: shots/a2-15.html)",
    ),
    finish,
  )!;
  expect(next.percent).toBe(finish.percent);
  expect(renderProgressUpdate(event(6, "render_progress", "capture: 0/0 frames"), next)).toBe(next);
  expect(renderProgressUpdate(event(7, "render_progress", "arbitrary output"))).toBeUndefined();
});
it("groups code-driven shot checks and rendering together, keeps jobs and repairs separate", () => {
  const events = [
    event(
      1,
      "validation",
      "Checking the Multiplane shot: stage size, duration and frame rate (1/2: shots/first.html)",
    ),
    event(
      2,
      "validation",
      "Checking that every frame depends only on time (1/2: shots/first.html)",
    ),
    event(3, "phase", "Rendering the Multiplane shot (1/2: shots/first.html)"),
    event(4, "render_progress", "finalize: 10/10 frames"),
    event(
      5,
      "validation",
      "Checking the Multiplane shot: stage size, duration and frame rate (2/2: shots/last.html)",
    ),
    event(6, "render_progress", "capture: 5/10 frames"),
  ];
  const grouped = displayActivityItems(activityItems(events));
  expect(grouped).toHaveLength(1);
  expect(grouped[0].progressPercent).toBe(75);
  expect(activityLabel(grouped[0])).toContain("75%");
  expect(grouped[0].children).toHaveLength(1);
  expect(JSON.stringify(grouped)).not.toContain("shots/");
  expect(
    displayActivityItems(
      activityItems([...events, event(7, "render_progress", "capture: 1/10 frames", "other")]),
    ),
  ).toHaveLength(2);
  expect(
    displayActivityItems(
      activityItems([
        ...events,
        event(7, "error", "Failed"),
        event(8, "phase", "Rendering the Multiplane shot (1/2: shots/retry.html)"),
      ]),
    ),
  ).toHaveLength(3);
});
it("uses measured percentages for viewing-copy exports", () => {
  const grouped = activityItems([
    event(1, "render_progress", "720p viewing copy 20%"),
    event(2, "render_progress", "720p viewing copy 45%"),
  ]);
  expect(grouped).toHaveLength(1);
  expect(grouped[0].progressPercent).toBe(45);
});

it("uses HyperFrames machine percentages across multi-line chunks and ignores unrelated percentages", () => {
  const progress = renderProgressUpdate(
    event(
      1,
      "render_progress",
      'Streaming frame 670/840\n@hf-progress {"code":"capture","done":670,"total":840,"pct":69}\n@hf-progress {"code":"encode","done":746,"total":840,"pct":89}\n',
    ),
  )!;
  expect(progress.percent).toBe(89);
  expect(
    renderProgressUpdate(event(2, "render_progress", '@hf-progress {"pct":60}'), progress)?.percent,
  ).toBe(89);
  expect(
    renderProgressUpdate(
      event(3, "render_progress", "[static-dedup] reused frames (99%)"),
      progress,
    )?.percent,
  ).toBe(89);
  expect(
    renderProgressUpdate(event(4, "render_progress", '@hf-progress {"pct":500}'), progress)
      ?.percent,
  ).toBe(89);
  expect(
    renderProgressUpdate(event(5, "render_progress", '@hf-progress {"pct":'), progress)?.percent,
  ).toBe(89);
  expect(
    renderProgressUpdate(
      event(6, "render_progress", "  █████████████████████████  100%  Render complete\n"),
      progress,
    )?.percent,
  ).toBe(100);
});

it.each([
  ["Rendered 30/60", 50],
  ["Rendering frames     ━━━━━━━━━          30/60", 50],
  ["Encoding video       ━━━━━━━━━          30/60", 50],
  ["Rendered 60/60", 99],
  ["Encoded 60/60", 100],
])("reads native Remotion progress %s", (message, percent) => {
  expect(renderProgressUpdate(event(1, "render_progress", message))?.percent).toBe(percent);
});

it.each(["HyperFrames", "Multiplane", "Remotion"])(
  "groups %s rendering and completes on the shared application marker",
  (renderer) => {
    const message = {
      HyperFrames: '@hf-progress {"pct":50}',
      Multiplane: "capture: 5/10 frames",
      Remotion: "Rendered 5/10",
    };
    const events = [
      event(1, "phase", "Rendering preview"),
      event(2, "render_progress", message[renderer as keyof typeof message]),
      event(3, "render_progress", "Render complete"),
    ];
    const grouped = displayActivityItems(activityItems(events));
    expect(grouped).toHaveLength(1);
    expect(grouped[0].progressPercent).toBe(100);
    expect(grouped[0].children).toHaveLength(0);
  },
);

it("resets the percentage for a new render pass in the same job", () => {
  const complete = renderProgressUpdate(event(1, "render_progress", "Render complete"))!;
  const next = renderProgressUpdate(
    event(2, "phase", "Rendering validated composition"),
    complete,
  )!;
  expect(next.percent).toBe(0);
  expect(
    renderProgressUpdate(event(3, "render_progress", '@hf-progress {"pct":25}'), next)?.percent,
  ).toBe(25);
});

it("relays only the parent's current measured child and clears stale progress after work changes", () => {
  const measured = {
    id: 1,
    scope: "full",
    kind: "notice" as const,
    text: "Rendering your video…",
    time: "2026-10-22T00:00:00Z",
    progressPercent: 71,
  };
  const parent: import("../src/client/activity-display").DisplayActivityItem = {
    ...measured,
    progressPercent: undefined,
    children: [measured],
  };
  expect(activityProgressPercent(parent)).toBe(71);
  expect(latestActivityProgress([measured])?.progressPercent).toBe(71);
  parent.children!.push({ ...measured, id: 2, progressPercent: undefined });
  expect(activityProgressPercent(parent)).toBeUndefined();
  expect(
    latestActivityProgress([
      measured,
      { ...measured, id: 2, text: "Mixing your audio…", progressPercent: undefined },
    ]),
  ).toBeUndefined();
});
