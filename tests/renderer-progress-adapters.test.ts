import { expect, it } from "vitest";
import type { AgentProgressEvent } from "../src/shared/contracts";
import { hyperframesProgress } from "../src/server/rendering/hyperframes/progress";
import {
  multiplaneProgressAdapter,
  multiplaneShotProgress,
  createMultiplaneShotProgress,
} from "../src/server/rendering/multiplane/progress";
import { remotionProgress } from "../src/server/rendering/remotion/progress";

const adapters = [
  {
    name: "HyperFrames",
    adapter: hyperframesProgress,
    message: '@hf-progress {"code":"capture","pct":50}',
  },
  { name: "Multiplane", adapter: multiplaneProgressAdapter, message: "capture: 5/10 frames" },
  { name: "Remotion", adapter: remotionProgress, message: "Rendered 5/10" },
];

it.each(adapters)(
  "$name owns its native output and returns the shared progress shape",
  ({ adapter, message }) => {
    const event: AgentProgressEvent = {
      id: 1,
      runId: "example",
      type: "render_progress",
      message,
      time: "2026-10-22T00:00:00Z",
    };
    expect(adapter.matches(event)).toBe(true);
    expect(adapter.update(event)).toEqual({ shot: 1, shots: 1, percent: 50 });
    for (const other of adapters.filter((entry) => entry.adapter !== adapter))
      expect(other.adapter.matches(event)).toBe(false);
  },
);

it.each(["Reusing the validated Multiplane shot", "Reusing the Multiplane shot checkpoint"])(
  "Multiplane counts %s as completed work",
  (phase) => {
    const event: AgentProgressEvent = {
      id: 1,
      runId: "example",
      type: "phase",
      message: `${phase} (2/4: shot.html)`,
      time: "2026-10-22T00:00:00Z",
    };
    expect(multiplaneProgressAdapter.matches(event)).toBe(true);
    expect(multiplaneProgressAdapter.update(event)).toEqual({ shot: 2, shots: 4, percent: 50 });
    expect(
      multiplaneProgressAdapter.update({
        ...event,
        message: phase,
      }),
    ).toEqual({ shot: 1, shots: 1, percent: 100 });
  },
);

it("reports each completed shot while processing cached and freshly rendered work", () => {
  const percentages = [0, 1, 2, 3, 4].map((completed) => {
    const progress = multiplaneShotProgress(completed, 4);
    const event: AgentProgressEvent = {
      id: completed,
      runId: "example",
      type: "render_progress",
      time: "2026-01-01T00:00:00Z",
      ...progress,
    };
    expect(multiplaneProgressAdapter.matches(event)).toBe(true);
    return multiplaneProgressAdapter.update(event)?.percent;
  });
  expect(percentages).toEqual([0, 25, 50, 75, 100]);
  expect(() => multiplaneShotProgress(5, 4)).toThrow();
  expect(() => multiplaneShotProgress(0, 0)).toThrow();
});

it("aggregates interleaved shot frames and cache restores without jumps or regressions", () => {
  const tracker = createMultiplaneShotProgress([100, 300]);
  const event = (progress: ReturnType<typeof tracker.snapshot>): AgentProgressEvent => ({
    id: 1,
    runId: "example",
    type: "render_progress",
    time: "2026-01-01",
    ...progress,
  });
  const halfSecond = tracker.frame(1, "capture: 150/300 frames")!;
  const progress = multiplaneProgressAdapter.update(event(halfSecond))!;
  expect(progress.percent).toBe(37.5);
  expect(
    multiplaneProgressAdapter.update(
      {
        ...event(halfSecond),
        type: "phase",
        message: "Rendering the Multiplane shot (1/2: first.html)",
        data: {},
      },
      progress,
    ),
  ).toEqual(progress);
  expect(
    multiplaneProgressAdapter.update(event(tracker.frame(0, "capture: 50/100 frames")!))?.percent,
  ).toBe(50);
  expect(multiplaneProgressAdapter.update(event(tracker.complete(1)))?.percent).toBe(87.5);
  expect(
    multiplaneProgressAdapter.update(event(tracker.frame(1, "capture: 1/300 frames")!))?.percent,
  ).toBe(87.5);
  expect(multiplaneProgressAdapter.update(event(tracker.complete(0)))?.percent).toBe(99);
  expect(tracker.snapshot().data.completed).toBe(2);
  expect(tracker.complete(0).data.completed).toBe(2);
});
