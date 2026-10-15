import { describe, it, expect } from "vitest";
import {
  validateExampleSvg,
  examplePrompt,
  examplePromptContext,
  examplePage,
} from "../src/server/catalog/style-examples";
import { loadCatalog } from "../src/server/catalog/catalog";
const svg = (content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">${content}</svg>`;
describe("model-authored one-page studies", () => {
  it("builds a simple style-specific prompt without using the video production template", async () => {
    const styles = (await loadCatalog()).styles.slice(0, 2);
    const prompt = examplePrompt(styles);
    expect(examplePromptContext(styles).styles[0].name).toBe(styles[0].name_en);
    expect(examplePromptContext(styles).styles[1].visual_cues).toBe(styles[1].visual_cues);
    expect(examplePromptContext(styles).styles[1].palette).toEqual(styles[1].palette);
    for (const [index, style] of styles.entries())
      expect(examplePromptContext(styles).styles[index].implementation).toBe(
        style.tech.implementation,
      );
    expect(prompt).toContain("implementation drawing guidance");
    expect(prompt).toContain("Read the complete styles array");
    expect(prompt).not.toContain(JSON.stringify(styles));
    expect(prompt).toContain("Avoid a shared template");
    expect(prompt).not.toContain("{{render_pipeline}}");
  });
  it("accepts internal gradients and quoted fragment URLs", () => {
    const art = svg(
      '<defs><linearGradient id="paint"><stop stop-color="#ffffff"/></linearGradient></defs><rect fill="url(\'#paint\')" width="100" height="100"/>',
    );
    expect(validateExampleSvg(art)).toBe(art);
  });
  it.each([
    "<script>alert(1)</script>",
    "<foreignObject>html</foreignObject>",
    '<image href="https://example.com/image.png"/>',
    '<use href="file:///private/secret.svg"/>',
    '<rect onclick="alert(1)"/>',
    '<rect fill="url(https://example.com/paint)"/>',
  ])("rejects active or external artwork %s", (content) =>
    expect(() => validateExampleSvg(svg(content))).toThrow(),
  );
  it("rejects invalid XML, dimensions and document entities", () => {
    expect(() => validateExampleSvg(svg("<rect>"))).toThrow();
    expect(() => validateExampleSvg(svg("").replace("1280 720", "600 340"))).toThrow();
    expect(() => validateExampleSvg("<!DOCTYPE svg>" + svg(""))).toThrow();
  });
  it("provides exactly one artwork image and validates style IDs", () => {
    expect(examplePage("style-001").match(/<img /g)).toHaveLength(1);
    expect(examplePage("style-001")).toContain("/api/examples/style-001/source");
    expect(() => examplePage("../../secret")).toThrow();
  });
});
