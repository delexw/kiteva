import { MotionRecipeSchema } from "../src/shared/agents/schemas/motion-recipe";
import { hasRemoteResources } from "../src/server/rendering/render";
import { describe, it, expect } from "vitest";
import { styleMotionHtml, motionRecipePrompt } from "../src/server/catalog/style-motion";
import { validateExamplePalette } from "../src/server/catalog/style-examples";
import { loadCatalog } from "../src/server/catalog/catalog";
const svg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${color}"/><circle cx="640" cy="360" r="40" fill="#D32F2F"/></svg>`;
const recipe = {
  styleId: "style-001",
  action: "assemble" as const,
  amplitude: 1,
  direction: "horizontal" as const,
  rationale: "Grid-aligned assembly",
};
describe("style motion demos", () => {
  it("allows URLs displayed as SVG labels while blocking remote attributes and scripts", () => {
    expect(
      hasRemoteResources(
        '<svg xmlns="http://www.w3.org/2000/svg"><text>http://example.com/index.html</text></svg>',
      ),
    ).toBe(false);
    expect(hasRemoteResources('<text fill="url(https://example.com/paint)">Caption</text>')).toBe(
      true,
    );
    expect(hasRemoteResources('<script>fetch("https://example.com")</script>')).toBe(true);
  });
  it("separates validated model recipes from application-authored executable code", () => {
    const html = styleMotionHtml(svg("#FFFFFF"), {
      ...recipe,
      rationale: "</script><script>alert(1)</script>",
    });
    expect(html).toContain("window.__timelines={video:timeline}");
    expect(html).not.toContain("</script><script>alert");
    expect(html).toContain('data-duration="3"');
  });
  it("rejects unsupported actions and extreme movement", () => {
    expect(() => MotionRecipeSchema.parse({ ...recipe, action: "eval" })).toThrow();
    expect(() => MotionRecipeSchema.parse({ ...recipe, amplitude: 100 })).toThrow();
  });
  it("uses catalog motion guidance and distinguishes vector studies from physical simulation", async () => {
    const c = await loadCatalog();
    const prompt = motionRecipePrompt(c.styles.slice(0, 2));
    expect(prompt).toContain(c.styles[0].name_en);
    expect(prompt).toContain("motion");
    expect(prompt).toContain("physical simulation");
  });
  it("verifies actual background pixels and exact palette membership", async () => {
    const original = (await loadCatalog()).styles[0];
    const style = {
      ...original,
      palette: { ...original.palette, background_policy: "fixed" as const },
    };
    await expect(validateExamplePalette(svg("#FFFFFF"), style)).resolves.toBeUndefined();
    await expect(validateExamplePalette(svg("#D32F2F"), style)).rejects.toThrow("background");
    await expect(validateExamplePalette(svg("#FFFF00"), style)).rejects.toThrow("outside");
  });
});
