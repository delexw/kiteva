import { expect, it } from "vitest";
import type { Usage } from "@openai/codex-sdk";
import { codexApiCost } from "../src/server/governance/codex-pricing";
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
const event = (
  id: number,
  usage: Usage,
  extra: Record<string, unknown> = {},
): AgentProgressEvent => ({
  id,
  runId: run.id,
  type: "usage",
  message: "",
  time: run.createdAt,
  data: {
    provider: "codex",
    model: "gpt-6-luna",
    sessionId: "thread",
    invocationId: `turn-${id}`,
    purpose: `stage-${id}`,
    usageScope: "session",
    ...usage,
    ...extra,
  },
});

it("prices the real SDK resume snapshots once instead of summing cumulative usage", () => {
  const first: Usage = {
    input_tokens: 10608,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 9,
    reasoning_output_tokens: 0,
  };
  const resumed: Usage = {
    input_tokens: 21245,
    cached_input_tokens: 10496,
    cache_write_input_tokens: 0,
    output_tokens: 18,
    reasoning_output_tokens: 0,
  };
  const next = event(2, resumed);
  const rows = projectGovernance(run, [event(1, first), next, { ...next, id: 3 }]).activity;
  expect(rows[0].costLow).toBeCloseTo(0.0010653, 10);
  expect(rows[1].costLow).toBeCloseTo(0.00012356, 10);
  expect(rows.reduce((sum, row) => sum + row.costLow!, 0)).toBeCloseTo(0.00118886, 10);
  for (const row of rows) expect(row.costHigh).toBe(row.costLow);
});

it("prices writes and reads as input subsets and does not add reasoning twice", () => {
  const usage: Usage = {
    input_tokens: 1000,
    cached_input_tokens: 600,
    cache_write_input_tokens: 100,
    output_tokens: 100,
    reasoning_output_tokens: 80,
  };
  expect(codexApiCost("gpt-6.1-sol", usage)).toBeCloseTo(0.00191, 10);
  expect(
    projectGovernance(run, [event(1, usage, { model: "gpt-6.1-sol" })]).activity[0].costLow,
  ).toBeCloseTo(0.00191, 10);
});

it("keeps reported SDK costs ahead of calculated Codex estimates", () => {
  const usage: Usage = {
    input_tokens: 1000,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 10,
    reasoning_output_tokens: 0,
  };
  expect(projectGovernance(run, [event(1, usage, { cost: 0.25 })]).activity[0]).toMatchObject({
    costLow: 0.25,
    costHigh: 0.25,
  });
});

it("supports zero usage and rejects unknown models or inconsistent counters", () => {
  const usage = {
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 0,
  };
  expect(codexApiCost("gpt-6-luna", usage)).toBe(0);
  expect(codexApiCost("unknown", usage)).toBeNull();
  expect(codexApiCost("toString", usage)).toBeNull();
  expect(codexApiCost("gpt-6-luna", { ...usage, cached_input_tokens: 1 })).toBeNull();
  expect(codexApiCost("gpt-6-luna", { ...usage, output_tokens: NaN })).toBeNull();
  expect(codexApiCost("gpt-6-luna", { ...usage, input_tokens: -1 })).toBeNull();
});

it("does not infer long-context premiums from many requests' aggregate tokens", () => {
  expect(
    codexApiCost("gpt-6.1-sol", {
      input_tokens: 1000000,
      cached_input_tokens: 0,
      cache_write_input_tokens: 0,
      output_tokens: 100000,
    }),
  ).toBe(3);
});
