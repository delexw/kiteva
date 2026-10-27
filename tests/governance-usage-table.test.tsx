import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GovernanceUsageTable } from "../src/client/governance/usage-table";
import type { ModelActivity } from "../src/shared/governance";

it("shows which visual resource was selected for each job without confusing a probability with missing data", () => {
  const row: ModelActivity = {
    model: "jev-1.14.0",
    purpose: "Authoring resource selection",
    calls: 1,
    tools: 0,
    cacheHits: 0,
    inputTokens: 100,
    outputTokens: 10,
    cachedTokens: null,
    uncachedInputTokens: null,
    cacheWriteTokens: null,
    cacheWrite5mTokens: null,
    cacheWrite1hTokens: null,
    costLow: 0.01,
    costHigh: 0.01,
    costBasis: "SDK estimate",
    authoringSelections: [
      {
        jobId: "preview",
        kind: "preview",
        direction: "A clear idea",
        resources: [
          {
            id: "local_code",
            name: "Existing local code and libraries",
            selected: true,
            probability: 0.82,
          },
          { id: "react_bits", name: "React Bits", selected: false, probability: 0.16 },
        ],
      },
    ],
  };
  const html = renderToStaticMarkup(<GovernanceUsageTable rows={[row]} byFunction />);
  expect(html).toContain("Selected authoring resource");
  expect(html).toContain("Existing local code and libraries (82%)");
  expect(html).toContain("Preview · A clear idea");
  expect(html).toContain("ant-table-row-expand-icon");
  const missing = structuredClone(row);
  missing.authoringSelections![0].resources[0].probability = null;
  expect(renderToStaticMarkup(<GovernanceUsageTable rows={[missing]} byFunction />)).toContain(
    "Existing local code and libraries (Not recorded)",
  );
  missing.authoringSelections![0].resources[0].probability = 0;
  expect(renderToStaticMarkup(<GovernanceUsageTable rows={[missing]} byFunction />)).toContain(
    "Existing local code and libraries (0%)",
  );
  expect(renderToStaticMarkup(<GovernanceUsageTable rows={[row]} />)).not.toContain(
    "Selected authoring resource",
  );
});
it("preserves missing usage, zero cache counts, function attribution and cost ranges in the Ant Design table", () => {
  const row: ModelActivity = {
    model: "example-model",
    purpose: "Focused asset correction",
    calls: 1,
    tools: 0,
    cacheHits: 3,
    inputTokens: null,
    outputTokens: 50,
    cachedTokens: 0,
    uncachedInputTokens: null,
    cacheWriteTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    costLow: 0.01,
    costHigh: 0.02,
    costBasis: "SDK estimate",
  };
  const html = renderToStaticMarkup(<GovernanceUsageTable rows={[row]} byFunction />);
  for (const expected of [
    "Not recorded",
    "Cache writes",
    "Focused asset correction",
    "3 cached summaries reused",
    "$0.0100–$0.0200",
    "SDK estimate",
  ])
    expect(html).toContain(expected);
  expect(html).toContain('class="ant-table');
  expect(html).toContain("table-layout:fixed");
  expect(html).toContain("inset-inline-end:0");
});

it("shows SDK cache reads and cache writes instead of a fabricated cached-output column", () => {
  const row: ModelActivity = {
    model: "example-model",
    purpose: "Planning",
    calls: 1,
    tools: 0,
    cacheHits: 0,
    inputTokens: 1310,
    uncachedInputTokens: 10,
    outputTokens: 20,
    cachedTokens: 1000,
    cacheWriteTokens: 300,
    cacheWrite5mTokens: 100,
    cacheWrite1hTokens: 200,
    costLow: 0.00274,
    costHigh: 0.00274,
    costBasis: "Standard API equivalent",
  };
  const html = renderToStaticMarkup(<GovernanceUsageTable rows={[row]} byFunction />);
  expect(html).toContain("Cache reads");
  expect(html).toContain("Cache writes");
  expect(html).toContain("Uncached input");
  expect(html).toContain("5m: 100");
  expect(html).toContain("1h: 200");
  expect(html).not.toContain("Cached output");
});

it("keeps governance readable while the running backend still returns the older usage fields", () => {
  const legacy = {
    model: "example-model",
    purpose: "Planning",
    calls: 1,
    tools: 0,
    cacheHits: 0,
    inputTokens: 10,
    outputTokens: 20,
    cachedTokens: 0,
    costLow: 0.1,
    costHigh: 0.1,
    costBasis: "SDK estimate",
  } as ModelActivity;
  const html = renderToStaticMarkup(<GovernanceUsageTable rows={[legacy]} />);
  expect(html).toContain("Not recorded");
  expect(html).not.toContain("NaN");
});

it("makes combination evaluation expandable and renders its saved detail", () => {
  const row: ModelActivity = {
    model: "jev-1.14.0",
    purpose: "Combination evaluation",
    calls: 1,
    tools: 0,
    cacheHits: 0,
    inputTokens: 100,
    outputTokens: 1,
    cachedTokens: null,
    uncachedInputTokens: 100,
    cacheWriteTokens: null,
    cacheWrite5mTokens: null,
    cacheWrite1hTokens: null,
    costLow: 0.0000042,
    costHigh: 0.0000042,
    costBasis: "Standard API estimate · input tokens",
    combinationEvaluation: {
      selected: [
        {
          id: "candidate-1",
          title: "Clear explanation",
          styles: ["style-001"],
          rationale: "Fits the subject",
          score: 80,
          confidence: 0.7,
          dimensions: { clarity: 0.9 },
        },
      ],
      calls: [],
    },
  };
  const html = renderToStaticMarkup(<GovernanceUsageTable rows={[row]} byFunction />);
  expect(html).toContain("ant-table-row-expand-icon");
  expect(html).not.toContain("ant-table-row-expand-icon-spaced");
});
