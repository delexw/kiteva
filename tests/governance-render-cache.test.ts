import { expect, it } from "vitest";
import { RequestSchema, type AgentProgressEvent, type Run } from "../src/shared/contracts";
import { projectGovernance } from "../src/server/governance/report";

const run: Run = {
  id: "example",
  createdAt: "2026-01-01",
  phase: "ready",
  request: RequestSchema.parse({ instructions: "Explain a concept" }),
  jobs: [],
  candidates: [],
};
const event = (id: number, type: string, data: Record<string, unknown>): AgentProgressEvent => ({
  id,
  runId: run.id,
  time: "2026-01-01T00:00:00Z",
  type,
  message: "",
  data: {
    model: "jev-1.14.0",
    provider: "jev",
    purpose: "Render cache review",
    invocationId: "cache",
    ...data,
  },
});
const invocation = event(1, "invocation", {
  prompt: {
    user: JSON.stringify({
      state: {
        shot: "shots/opening.html",
        changeBrief: {
          summary: "Only narration changed",
          renderImpact: "Visuals unchanged",
          uncertain: false,
        },
      },
    }),
  },
});
const usage = event(2, "usage", {
  usage: { input_tokens: 100, output_tokens: 10 },
  decision: {
    questionKey: "cache",
    answer: { choice: "reuse", confidence: 1, probabilities: { reuse: 1, refresh: 0 } },
  },
});

it("joins recorded cache inputs and decisions without duplicating reviews or usage", () => {
  const row = projectGovernance(run, [invocation, usage, usage]).activity[0];
  expect(row.calls).toBe(1);
  expect(row.inputTokens).toBe(100);
  expect(row.renderCacheReviews).toEqual([
    expect.objectContaining({
      id: "cache",
      shot: "shots/opening.html",
      choice: "reuse",
      confidence: 1,
      probabilities: { reuse: 1, refresh: 0 },
      summary: "Only narration changed",
      renderImpact: "Visuals unchanged",
      uncertain: false,
      promptUrl: "/api/admin/governance/example/prompts/cache",
    }),
  ]);
  expect(projectGovernance(run, [usage, invocation]).activity[0].renderCacheReviews).toEqual(
    row.renderCacheReviews,
  );
});

it("supports historical raw evidence without a change brief", () => {
  const old = event(1, "invocation", {
    prompt: {
      user: JSON.stringify({ state: { shot: "shots/scene.html", changes: [], sourceContext: [] } }),
    },
  });
  const row = projectGovernance(run, [old, usage]).activity[0];
  expect(row.renderCacheReviews?.[0].shot).toBe("shots/scene.html");
  expect(row.renderCacheReviews?.[0].summary).toBeUndefined();
});

it("keeps incomplete or invalid recorded review data unavailable rather than inventing a decision", () => {
  const broken = event(1, "invocation", { prompt: { user: "{" } });
  const invalid = event(2, "usage", {
    decision: { questionKey: "cache", answer: { choice: "reuse", confidence: 2 } },
  });
  const detail = projectGovernance(run, [broken, invalid]).activity[0].renderCacheReviews?.[0];
  expect(detail).toMatchObject({
    shot: null,
    choice: null,
    confidence: null,
    probabilities: { reuse: null, refresh: null },
  });
  expect(
    projectGovernance(run, [event(3, "usage", { purpose: "Other review" })]).activity[0]
      .renderCacheReviews,
  ).toBeUndefined();
});
