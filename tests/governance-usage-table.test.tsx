import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GovernanceUsageTable } from "../src/client/governance/usage-table";
import type { ModelActivity } from "../src/shared/governance";
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
