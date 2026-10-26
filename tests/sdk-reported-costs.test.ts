import { expect, it } from "vitest";
import { projectGovernance } from "../src/server/governance/report";
import { RequestSchema, type Run, type AgentProgressEvent } from "../src/shared/contracts";

const run: Run = {
  id: "project",
  createdAt: "2026-10-26T00:00:00Z",
  phase: "preparing",
  request: RequestSchema.parse({ instructions: "Explain an idea" }),
  jobs: [],
  candidates: [],
};
const usage = (id: number, cost: number | undefined): AgentProgressEvent => ({
  id,
  runId: run.id,
  time: run.createdAt,
  type: "usage",
  message: "",
  data: {
    provider: "claude",
    model: "claude-haiku-5-5",
    sessionId: "session",
    invocationId: `turn-${id}`,
    purpose: `stage-${id}`,
    modelUsage: {
      "claude-haiku-5-5": {
        inputTokens: id * 1000000,
        outputTokens: id * 200,
        cacheReadInputTokens: id * 900000,
        cacheCreationInputTokens: id * 10000,
        ...(cost === undefined ? {} : { costUSD: cost }),
      },
    },
  },
});

it("shows one SDK Haiku cost despite unknown request lengths and cache durations", () => {
  const [row] = projectGovernance(run, [usage(1, 0.6484)]).activity;
  expect(row).toMatchObject({ costLow: 0.6484, costHigh: 0.6484 });
});

it("counts resumed SDK spend once, including duplicate results and zero increments", () => {
  const resumed = usage(2, 0.8);
  const rows = projectGovernance(run, [
    usage(1, 0.6),
    resumed,
    { ...resumed, id: 9 },
    usage(3, 0.8),
  ]).activity;
  expect(rows[0].costLow).toBe(0.6);
  expect(rows[1].costLow).toBeCloseTo(0.2);
  expect(rows[2].costLow).toBe(0);
  for (const row of rows) expect(row.costHigh).toBe(row.costLow);
});

it("preserves reported zero and missing costs without token-price fallbacks", () => {
  expect(projectGovernance(run, [usage(1, 0)]).activity[0].costLow).toBe(0);
  expect(projectGovernance(run, [usage(1, undefined)]).activity[0]).toMatchObject({
    costLow: null,
    costHigh: null,
  });
});

it("starts a new cost baseline when the SDK resets its cumulative counter", () => {
  const rows = projectGovernance(run, [usage(1, 2), usage(2, 0.1), usage(3, 0.3)]).activity;
  expect(rows[0].costLow).toBe(2);
  expect(rows[1].costLow).toBe(0.1);
  expect(rows[2].costLow).toBeCloseTo(0.2);
});
