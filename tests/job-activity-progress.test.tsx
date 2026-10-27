import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JobActivityProgress } from "../src/client/components/activity-progress";
import type { AgentProgressEvent } from "../src/shared/contracts";

it("shows the card's measured progress without using another job's progress", () => {
  const events: AgentProgressEvent[] = [
    {
      id: 1,
      runId: "project",
      jobId: "first",
      type: "render_progress",
      message: "capture: 1/4 frames",
      time: "2026-01-01T00:00:00Z",
    },
    {
      id: 2,
      runId: "project",
      jobId: "second",
      type: "render_progress",
      message: "capture: 3/4 frames",
      time: "2026-01-01T00:00:01Z",
    },
  ];
  const markup = renderToStaticMarkup(<JobActivityProgress jobId="first" events={events} />);
  expect(markup).toContain("Rendering your video");
  expect(markup).toContain('aria-valuenow="25"');
  expect(markup).not.toContain('aria-valuenow="75"');
  expect(renderToStaticMarkup(<JobActivityProgress jobId="absent" events={events} />)).toBe("");
});
