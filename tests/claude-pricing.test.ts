import { expect, it } from "vitest";
import { claudeApiCost, type ClaudeTokenUsage } from "../src/server/governance/claude-pricing";
const usage: ClaudeTokenUsage = {
  input: 60221,
  output: 230259,
  reads: 47011404,
  writes: 2862858,
  writes5m: 0,
  writes1h: 2862858,
};
it("reconstructs standard Opus API cost including one-hour cache writes", () => {
  expect(claudeApiCost("claude-opus-5-5", usage)).toEqual({
    low: 37.1512088,
    high: 37.1512088,
    basis: "Standard API equivalent",
  });
});
it("prices mixed cache durations separately and shows bounds for unknown durations", () => {
  const mixed = {
    ...usage,
    input: 1000000,
    output: 1000000,
    reads: 1000000,
    writes: 2000000,
    writes5m: 1000000,
    writes1h: 1000000,
  };
  expect(claudeApiCost("claude-opus-5-5", mixed)).toMatchObject({ low: 37.2, high: 37.2 });
  expect(
    claudeApiCost("claude-opus-5-5", { ...mixed, writes5m: null, writes1h: null }),
  ).toMatchObject({ low: 34.2, high: 40.2 });
});
it("keeps Haiku's request-length uncertainty visible rather than pricing a turn as one request", () => {
  expect(
    claudeApiCost("claude-haiku-5-5", {
      ...usage,
      input: 1000000,
      output: 1000000,
      reads: 1000000,
      writes: 0,
      writes5m: 0,
      writes1h: 0,
    }),
  ).toMatchObject({ low: 0.61, high: 3.05 });
});
it("preserves unknown usage and rejects invalid counts", () => {
  expect(claudeApiCost("unknown-model", usage)).toBeNull();
  expect(claudeApiCost("claude-opus-5-5", { ...usage, writes: null })).toBeNull();
  expect(claudeApiCost("claude-opus-5-5", { ...usage, input: NaN })).toBeNull();
});
