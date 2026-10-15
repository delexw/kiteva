import { reviewedStyleProductionSchema } from "../src/shared/agents/schemas/style-production";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import {
  reviewedStylePreviewPrompt,
  stylePreviewTechnologyPool,
  validateReviewedStyleProduction,
} from "../src/server/catalog/style-preview-authoring";

describe("reviewed native style previews", () => {
  it("uses the reviewed implementation and preserves background roles", async () => {
    const catalog = await loadCatalog();
    const style = catalog.styles.find((entry) => entry.id === "style-125")!;
    const prompt = reviewedStylePreviewPrompt(style, "Correct the rendering failure");
    expect(prompt).toContain(style.tech.implementation);
    expect(prompt).toContain(style.palette.tokens.background);
    expect(prompt).toContain("Do not merely animate the flat SVG");
    expect(prompt).toContain("same session");
    expect(prompt).toContain("BACKGROUND_REVIEW.json");
    expect(prompt).toContain("open every listed local reference contact sheet");
  });
  it("declares the local preview timeline for legacy styles without a reviewed motion owner", async () => {
    const style = (await loadCatalog()).styles.find((entry) => entry.id === "style-022")!;
    expect(reviewedStylePreviewPrompt(style, "Refresh from evidence")).toContain(
      "local GSAP timeline",
    );
  });
  it("keeps Claude as author while excluding Blender from the supplied tool pool", async () => {
    for (const key of ["blender", "python_bpy", "cycles", "eevee_cycles", "eevee"])
      expect(stylePreviewTechnologyPool).not.toHaveProperty(key);
    expect(Object.values(stylePreviewTechnologyPool).map((tool) => tool.name)).toContain(
      "Three.js",
    );
    const style = (await loadCatalog()).styles.find((entry) => entry.id === "style-056")!;
    const prompt = reviewedStylePreviewPrompt(style, "Resume the unfinished preview");
    expect(prompt).toContain("continue authoring with Claude Opus 5.5");
    expect(prompt).toContain("DO NOT use Blender");
    expect(prompt).toContain("overrides any Blender recommendations");
    expect(prompt).not.toContain("suitable renderers (Blender");
  });
  it("accepts reviewed renderers and rejects flattened substitutes or wrong output scope", async () => {
    const catalog = await loadCatalog();
    const style = catalog.styles.find((entry) => entry.id === "style-125")!;
    const production = {
      pipeline: "HyperFrames",
      fallbackReason: null,
      sourceFile: "index.html",
      duration: 3,
      width: 1280,
      height: 720,
      styleRenderer: ["Three.js"],
      motionEngine: ["GSAP"],
      audioDescription: "Silent",
      limitations: ["Procedural material approximation"],
    };
    expect(validateReviewedStyleProduction(production, style)).toEqual(production);
    expect(reviewedStyleProductionSchema(style).safeParse(production).success).toBe(true);
    const catalogPreview = reviewedStyleProductionSchema(style).parse({
      ...production,
      displayTitle: "A descriptive catalog style name",
    });
    expect(catalogPreview).not.toHaveProperty("displayTitle");
    expect(
      reviewedStyleProductionSchema(style).safeParse({
        ...production,
        styleRenderer: ["Three.js/WebGL"],
      }).success,
    ).toBe(false);
    expect(() =>
      validateReviewedStyleProduction({ ...production, styleRenderer: ["SVG"] }, style),
    ).toThrow(/reviewed/);
    expect(() => validateReviewedStyleProduction({ ...production, duration: 10 }, style)).toThrow(
      /exactly 3 seconds/,
    );
  });
});
