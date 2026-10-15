import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  technologyCardPath,
  technologyEntryForDefinition,
  technologyEntries,
} from "../src/client/technology-pool-model";
import { TechnologyCard } from "../src/client/components/technology-card";
import { loadCatalog } from "../src/server/catalog/catalog";
it("links every style recommendation to its unique canonical pool key", async () => {
  const catalog = await loadCatalog();
  expect(new Set(technologyEntries.map((entry) => entry.definition.name)).size).toBe(
    technologyEntries.length,
  );
  for (const style of catalog.styles)
    for (const library of style.tech.recommended_stack) {
      const entry = technologyEntryForDefinition(library);
      expect(entry).toBeDefined();
      expect(entry!.definition.name).toBe(library.name);
    }
  expect(technologyEntryForDefinition({ name: "Unknown tool" })).toBeUndefined();
});
it("builds stable card URLs from keys and escapes URL characters", () => {
  expect(technologyCardPath("hyperframes")).toBe("/technologies?tool=hyperframes");
  expect(technologyCardPath("a/b ?")).toBe("/technologies?tool=a%2Fb%20%3F");
});
it("renders reusable tool details and a share action without accessing browser APIs during SSR", () => {
  const entry = technologyEntries[0];
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <TechnologyCard entry={entry} />
    </MemoryRouter>,
  );
  expect(html).toContain(entry.key);
  expect(html).toContain("Copy link");
  expect(html).toContain("Full technology definition");
  expect(html).toContain("Suggested APIs");
});
