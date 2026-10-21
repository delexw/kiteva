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
    costLow: 0.01,
    costHigh: 0.02,
    costBasis: "SDK estimate",
  };
  const html = renderToStaticMarkup(<GovernanceUsageTable rows={[row]} byFunction />);
  for (const expected of [
    "Not recorded",
    "Not reported",
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
