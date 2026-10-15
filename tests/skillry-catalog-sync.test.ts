import { describe, expect, it } from "vitest";
import chroma from "chroma-js";
import { loadCatalog } from "../src/server/catalog/catalog";
import { reviewedStylePreviewPrompt } from "../src/server/catalog/style-preview-authoring";

describe("Skillry catalog additions and focused recipes", () => {
  it("adds distinct 3D contracts with honest source background evidence", async () => {
    const catalog = await loadCatalog();
    for (const id of ["style-127", "style-128"]) {
      const style = catalog.styles.find((entry) => entry.id === id)!;
      expect(style.palette.background_evidence).toMatchObject({
        exact_hex_from_source: false,
        poster_inspected: false,
      });
      expect(
        chroma.contrast(style.palette.tokens.foreground, style.palette.tokens.background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(style.executable_prompt_template).toContain("STORYBOARD.json");
      expect(style.executable_prompt_template).not.toContain("Stained-Glass Light Projection");
      expect(style.tech.recommended_stack.some((tool) => tool.name === "HyperFrames")).toBe(true);
    }
    expect(catalog.styles.find((style) => style.id === "style-127")!.visual_cues).toContain(
      "section views",
    );
    expect(catalog.styles.find((style) => style.id === "style-128")!.tech.implementation).toMatch(
      /approximation|approximate/i,
    );
  });
  it("preserves primary palettes while exposing source-specific optional recipes", async () => {
    const catalog = await loadCatalog();
    const type = catalog.styles.find((style) => style.id === "style-093")!;
    expect(type.palette.tokens.background).toBe("#FAF5E9");
    expect(type.tech.preview_recipes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_palette: expect.objectContaining({ background: "#102820" }),
          guidance: expect.stringContaining("actual glyphs"),
        }),
      ]),
    );
    expect(
      catalog.styles.find((style) => style.id === "style-105")!.tech.preview_recipes,
    ).toHaveLength(2);
  });
  it("makes optional recipes available to native preview authoring", async () => {
    const catalog = await loadCatalog();
    const style = catalog.styles.find((entry) => entry.id === "style-095")!;
    const prompt = reviewedStylePreviewPrompt(style, "Refresh the representative product reveal");
    expect(prompt).toContain("registered_xray");
    expect(prompt).toContain("shared transform");
    expect(prompt).toContain("deterministic");
  });
});
