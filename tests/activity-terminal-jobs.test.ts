import { expect, it } from "vitest";
import { activityItems } from "../src/shared/activity-model";
import {
  RequestSchema,
  type Run,
  type AgentProgressEvent,
  type Phase,
} from "../src/shared/contracts";
const event = (id: number, jobId: string, state = "item.started"): AgentProgressEvent => ({
  id,
  runId: "project",
  jobId,
  type: "tool",
  time: "2026-01-01",
  message: "Bash",
  data: { state, itemId: `tool-${id}`, invocationId: "build", purpose: "preview video generation" },
});
const project = (phase: Phase): Run => ({
  id: "project",
  createdAt: "2026-01-01",
  phase: "generating",
  request: RequestSchema.parse({ instructions: "Explain a concept" }),
  candidates: [],
  jobs: [
    {
      id: "finished",
      runId: "project",
      candidateId: "direction",
      kind: "preview",
      phase,
      model: "example",
      duration: 3,
      workspace: "/unused",
    },
    {
      id: "active",
      runId: "project",
      candidateId: "other",
      kind: "full",
      phase: "rendering",
      model: "example",
      duration: 30,
      workspace: "/unused",
    },
  ],
});
it.each(["ready", "cancelled", "failed", "interrupted"] as const)(
  "clears stale running outcomes in a %s job without stopping another active job",
  (phase) => {
    const items = activityItems(
      [event(1, "finished"), event(2, "active"), event(3, "finished", "item.completed")],
      false,
      project(phase),
    );
    expect(items.find((item) => item.id === 1)?.status).toBe("stopped");
    expect(items.find((item) => item.id === 2)?.status).toBe("running");
    expect(items.find((item) => item.id === 3)?.status).toBe("complete");
  },
);
it("keeps a running job's unfinished step running", () => {
  expect(activityItems([event(1, "finished")], false, project("generating"))[0].status).toBe(
    "running",
  );
});
it("stops customer text animation for a finished job without erasing its message", () => {
  const text: AgentProgressEvent = {
    ...event(1, "finished"),
    type: "text_delta",
    message: "Saved explanation",
    data: { audience: "customer" },
  };
  const item = activityItems([text], false, project("ready"))[0];
  expect(item.text).toBe("Saved explanation");
  expect(item.streaming).toBe(false);
});
