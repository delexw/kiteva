import { expect, it } from "vitest";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
const renderToStaticMarkup = (element: ReactNode) =>
  renderMarkup(<MemoryRouter>{element}</MemoryRouter>);
import { technologyPool, technologyPoolSize } from "../src/shared/technology-pool";
import {
  filterTechnologyEntries,
  groupTechnologyEntries,
  technologyEntries,
} from "../src/client/technology-pool-model";
import { TechnologyPoolPage } from "../src/client/technology-pool-page";
it("lists every pool key once without pagination or omission", () => {
  expect(technologyEntries.map((entry) => entry.key)).toEqual(Object.keys(technologyPool));
  expect(technologyPoolSize).toBe(technologyEntries.length);
  const html = renderToStaticMarkup(<TechnologyPoolPage />);
  for (const key of Object.keys(technologyPool))
    expect(html.split(`data-row-key="${key}"`)).toHaveLength(2);
  expect(html).toContain(`${technologyEntries.length} technologies`);
  expect(html).not.toContain("ant-pagination");
});
it("groups every technology by exact type once, preserving filtered results and row order", () => {
  const groups = groupTechnologyEntries(technologyEntries);
  expect(groups.map((group) => group.kind)).toEqual(
    [...new Set(technologyEntries.map((entry) => entry.kind))].sort((a, b) => a.localeCompare(b)),
  );
  expect(groups.flatMap((group) => group.entries)).toHaveLength(technologyPoolSize);
  for (const group of groups)
    expect(group.entries).toEqual(technologyEntries.filter((entry) => entry.kind === group.kind));
  const filtered = filterTechnologyEntries(technologyEntries, "chartist");
  expect(groupTechnologyEntries(filtered).flatMap((group) => group.entries)).toEqual(filtered);
  expect(groupTechnologyEntries([])).toEqual([]);
});
it("searches the complete technology definition and combines exact type and role filters", () => {
  const entries = [
    {
      key: "generic-tool",
      kind: "library",
      definition: {
        name: "Generic tool",
        purpose: "A generic renderer",
        package: "generic-package",
        production_roles: ["style_renderer"],
        integration_guidance: "Supports precision frame capture",
      },
    },
    {
      key: "motion-tool",
      kind: "cli",
      definition: { name: "Motion tool", production_roles: ["motion_engine"] },
    },
  ];
  expect(filterTechnologyEntries(entries, "  PRECISION FRAME  ").map((entry) => entry.key)).toEqual(
    ["generic-tool"],
  );
  expect(
    filterTechnologyEntries(entries, "generic-package", "library", "style_renderer"),
  ).toHaveLength(1);
  expect(filterTechnologyEntries(entries, "generic-package", "cli")).toEqual([]);
  expect(filterTechnologyEntries(entries, "", "library", "motion_engine")).toEqual([]);
  expect(filterTechnologyEntries(entries, "missing")).toEqual([]);
  expect(filterTechnologyEntries(entries, "")).toEqual(entries);
});
