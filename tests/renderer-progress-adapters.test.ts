import { expect, it } from "vitest";
import type { AgentProgressEvent } from "../src/shared/contracts";
import { hyperframesProgress } from "../src/server/rendering/hyperframes/progress";
import { multiplaneProgressAdapter } from "../src/server/rendering/multiplane/progress";
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

it("Multiplane counts a reused shot as completed work", () => {
  const event: AgentProgressEvent = {
    id: 1,
    runId: "example",
    type: "phase",
    message: "Reusing the validated Multiplane shot (2/4: shot.html)",
    time: "2026-10-22T00:00:00Z",
  };
  expect(multiplaneProgressAdapter.matches(event)).toBe(true);
  expect(multiplaneProgressAdapter.update(event)).toEqual({ shot: 2, shots: 4, percent: 50 });
  expect(
    multiplaneProgressAdapter.update({
      ...event,
      message: "Reusing the validated Multiplane shot",
    }),
  ).toEqual({ shot: 1, shots: 1, percent: 100 });
});
