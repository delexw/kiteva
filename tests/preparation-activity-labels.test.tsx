import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  preparationStepLabel,
  usesTitleOnlyPreparation,
  type PreparationState,
} from "../src/shared/preparation";
import { RequestSchema, type Run, type AgentProgressEvent } from "../src/shared/contracts";
import { activityItems, customerToolActivity } from "../src/client/agent-activity-model";
import { roomActivityContexts } from "../src/client/room/project-stages";
import { PreparationCheckpoints } from "../src/client/components/preparation-checkpoints";
import { roomPreparationSteps } from "../src/client/room/room-activity";

const preparation: PreparationState = {
  fingerprint: "fixture",
  checkpoints: {
    inputs: { state: "completed", completedAt: "2026-01-01T10:00:00Z", output: {} },
    brief: {
      state: "completed",
      completedAt: "2026-01-01T10:00:01Z",
      output: { variant: "title-only", value: { subject: "An original story" } },
    },
    selection: {
      state: "interrupted",
      finishedAt: "2026-01-01T10:00:05Z",
      errorCode: "GENERATION_INTERRUPTED",
    },
  },
};
const run: Run = {
  id: "project",
  createdAt: "2026-01-01T10:00:00Z",
  phase: "cancelled",
  request: RequestSchema.parse({
    instructions: "An original story",
    selectedStyleIds: ["style-001"],
    candidateCount: 2,
  }),
  preparation,
  candidates: [],
  jobs: [],
};
const events: AgentProgressEvent[] = [
  ["StructuredOutput", "Brief preparation"],
  ["Read", "Explicit-style preview planning"],
  ["mcp__reference_browser__inspect_page", "Explicit-style preview planning"],
  ["StructuredOutput", "Explicit-style preview planning"],
].map(([toolName, purpose], index) => ({
  id: index + 1,
  runId: run.id,
  type: "tool",
  message: toolName,
  time: `2026-01-01T10:00:0${index + 1}Z`,
  data: { toolName, purpose, itemId: `item-${index}`, invocationId: purpose },
}));

it.each([0, 2])(
  "labels selected-style preparation correctly with %i previews",
  (candidateCount) => {
    const request = RequestSchema.parse({
      instructions: "An original story",
      selectedStyleIds: ["style-001"],
      candidateCount,
    });
    expect(preparationStepLabel("brief", request)).toBe("Project title");
    expect(preparationStepLabel("selection", request)).toBe("Preview planning");
  },
);

it("keeps full-brief and JEV direction-selection labels for their actual workflow", () => {
  const request = RequestSchema.parse({ instructions: "An original story" });
  expect(preparationStepLabel("brief", request)).toBe("Brief");
  expect(preparationStepLabel("selection", request)).toBe("Direction selection");
  const historicalFull: PreparationState = {
    fingerprint: "old",
    checkpoints: {
      brief: {
        state: "completed",
        completedAt: "earlier",
        output: { assetReviewRevision: 2, value: { subject: "Full brief" } },
      },
    },
  };
  expect(usesTitleOnlyPreparation(run.request, historicalFull)).toBe(false);
  expect(preparationStepLabel("brief", run.request, historicalFull)).toBe("Brief");
});

it("recognizes persisted title-only checkpoints without request context", () => {
  expect(preparationStepLabel("brief", undefined, preparation)).toBe("Project title");
  const html = renderToStaticMarkup(<PreparationCheckpoints preparation={preparation} />);
  expect(html).toContain("Project title · Complete");
  expect(html).toContain("Preview planning · Interrupted");
  expect(html).not.toContain("Direction selection");
});

it("renders saved title-only and preview-planning events accurately without rewriting history", () => {
  const beforeEvents = JSON.stringify(events),
    beforeRun = JSON.stringify(run);
  const contexts = roomActivityContexts(run, events);
  expect(contexts[0].checkpoints.map((item) => item.title)).toEqual([
    "Reference material",
    "Project title",
    "Preview planning",
  ]);
  expect(contexts[0].items.map((item) => item.text)).toEqual([
    "Saving the project title…",
    "Planning your requested previews…",
    "Exploring your website for preview planning…",
    "Saving the preview directions…",
  ]);
  expect(JSON.stringify(events)).toBe(beforeEvents);
  expect(JSON.stringify(run)).toBe(beforeRun);
});

it.each(["loading", "success", "error", "abort"] as const)(
  "nests preview planning calls under their %s checkpoint without inferring the parent outcome",
  (status) => {
    const completed = events.map((event) => ({
      ...event,
      data: { ...(event.data as object), state: "item.completed" },
    }));
    const context = roomActivityContexts({ ...run, phase: "preparing" }, completed)[0];
    context.checkpoints = context.checkpoints.map((checkpoint) =>
      checkpoint.key === "selection" ? { ...checkpoint, status } : checkpoint,
    );
    const before = JSON.stringify(context);
    const grouped = roomPreparationSteps(context);
    const planning = grouped.checkpoints.find((checkpoint) => checkpoint.key === "selection")!;
    const title = grouped.checkpoints.find((checkpoint) => checkpoint.key === "brief")!;
    expect(planning.status).toBe(status);
    const html = renderToStaticMarkup(<>{planning.content}</>);
    expect(html).toContain("Planning your requested previews…");
    expect(html).toContain("Exploring your website for preview planning…");
    expect(html).not.toContain("Saving the project title…");
    expect(renderToStaticMarkup(<>{title.content}</>)).toContain("Saving the project title…");
    expect(grouped.remaining).toEqual([]);
    expect(JSON.stringify(context)).toBe(before);
  },
);

it("keeps activity without a matching checkpoint visible instead of dropping or misattributing it", () => {
  const context = roomActivityContexts(run, events)[0];
  context.checkpoints = [];
  expect(roomPreparationSteps(context).remaining).toEqual(context.items);
  const jobOwned = activityItems([{ ...events[1], jobId: "job" }], true, run)[0];
  expect(jobOwned.preparationStep).toBeUndefined();
});

it("does not relabel full-brief runs or job-owned tools as title extraction", () => {
  const automatic = {
    ...run,
    request: RequestSchema.parse({ instructions: "An original story" }),
    preparation: undefined,
  };
  expect(activityItems(events.slice(0, 1), true, automatic)[0].text).toBe(
    "Saving the draft brief…",
  );
  expect(activityItems([{ ...events[0], jobId: "job" }], true, run)[0].text).toBe(
    "Saving the draft brief…",
  );
  expect(customerToolActivity("StructuredOutput", "tool", "Project title extraction")).toBe(
    "Saving the project title…",
  );
  expect(customerToolActivity("StructuredOutput", "tool", "Explicit-style preview planning")).toBe(
    "Saving the preview directions…",
  );
});

it.each(["cancelled", "interrupted", "failed", "ready"] as const)(
  "stops unfinished preparation indicators when the project is %s",
  (phase) => {
    const savedEvents: AgentProgressEvent[] = events.map((event, index) => ({
      ...event,
      data: {
        ...(event.data as Record<string, unknown>),
        state: index < 3 ? "item.completed" : "item.started",
      },
    }));
    const snapshot = JSON.stringify(savedEvents);
    const items = roomActivityContexts({ ...run, phase }, savedEvents)[0].items;
    expect(items.map((item) => item.status)).toEqual([
      "complete",
      "complete",
      "complete",
      "stopped",
    ]);
    expect(JSON.stringify(savedEvents)).toBe(snapshot);
  },
);

it("keeps active preparation and independently running jobs active", () => {
  expect(activityItems(events, true, { ...run, phase: "preparing" }).at(-1)?.status).toBe(
    "running",
  );
  expect(activityItems([{ ...events[3], jobId: "job" }], true, run)[0].status).toBe("running");
});
