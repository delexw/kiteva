import { expect, it } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import { styleTechnologyRecommendations } from "../src/shared/style-technology";

it("keeps composition renderers out of all style recommendations", async () => {
  const catalog = await loadCatalog();
  const names = ["HyperFrames", "Remotion", "@remotion/renderer", "Multiplane"];
  expect(catalog.styles).toHaveLength(136);
  for (const style of catalog.styles) {
    expect(style.tech.recommended_stack.some((tool) => names.includes(tool.name))).toBe(false);
    expect(style.tech.render_pipeline).toContain("project's renderer setting");
    expect(style.tech.framework_selection).toMatchObject({ source: "project.renderer" });
    expect(style.tech.alternatives || []).not.toEqual(expect.arrayContaining(["Remotion"]));
    const original = catalog.originalStyles.find((entry) => entry.id === style.id)!;
    expect(style.visual_cues).toBe(original.visual_cues);
    expect(style.tech.implementation).toBe(
      (original.tech as { implementation: string }).implementation,
    );
  }
});

it("preserves useful drawing tools and source records without mutating them", async () => {
  const catalog = await loadCatalog();
  const style = catalog.styles.find((style) => style.id === "style-032")!;
  const input = {
    ...style.tech,
    alternatives: ["Remotion", "A drawing tool"],
    recommended_stack: [
      ...style.tech.recommended_stack,
      { name: "Remotion" },
      { name: "@remotion/shapes" },
    ],
  };
  const result = styleTechnologyRecommendations(input);
  expect(result.alternatives).toEqual(["A drawing tool"]);
  expect(result.recommended_stack.map((tool) => tool.name)).toContain("@remotion/shapes");
  expect(result.recommended_stack.map((tool) => tool.name)).toContain("SVG");
  expect(input.alternatives).toEqual(["Remotion", "A drawing tool"]);
  expect(input.recommended_stack.map((tool) => tool.name)).toContain("Remotion");
});
