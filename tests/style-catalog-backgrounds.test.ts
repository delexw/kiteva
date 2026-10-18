import { describe, expect, it } from "vitest";
import chroma from "chroma-js";
import { examplePrompt, validateExamplePalette } from "../src/server/catalog/style-examples";
import { reviewedStylePreviewPrompt } from "../src/server/catalog/style-preview-authoring";
import { loadCatalog } from "../src/server/catalog/catalog";

describe("synced style backgrounds", () => {
  it("preserves source stage colors and separates pottery material from its scene", async () => {
    const catalog = await loadCatalog();
    const tokens = (id: string) => catalog.styles.find((style) => style.id === id)!.palette.tokens;
    expect(tokens("style-116").background).toBe("#1B3ED2");
    expect(tokens("style-117").background).toBe("#07080A");
    expect(tokens("style-119").background).toBe("#F0EEE6");
    expect(tokens("style-125").background).not.toBe(tokens("style-125").vessel_material);
  });

  it("records poster evidence and readable caption pairs for the repository-sync styles", async () => {
    const catalog = await loadCatalog();
    const additions = catalog.styles.filter(
      (style) => Number(style.id.slice(6)) >= 116 && Number(style.id.slice(6)) <= 126,
    );
    expect(additions).toHaveLength(11);
    for (const style of additions) {
      expect(style.palette.background_evidence).toMatchObject({
        poster_inspected: true,
        exact_hex_from_source: ["style-116", "style-117", "style-119"].includes(style.id),
      });
      expect(
        chroma.contrast(style.palette.tokens.background, style.palette.tokens.foreground),
      ).toBeGreaterThanOrEqual(4.5);
      const tools = style.tech.recommended_stack.map((entry) => entry.name);
      for (const reference of [
        ...style.tech.style_renderer.recommended_stack_refs,
        ...style.tech.motion_engine.recommended_stack_refs,
      ])
        expect(tools).toContain(reference);
    }
  });
});

it("treats catalog backgrounds as scene-dependent examples while preserving source swatches", async () => {
  const styles = (await loadCatalog()).styles;
  expect(styles).toHaveLength(138);
  for (const style of styles) expect(style.palette.background_policy).toBe("scene_dependent");
  const warmStyle = styles.find((style) => style.id === "style-028")!;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#102947"/><circle cx="640" cy="360" r="80" fill="#DDEBFF"/></svg>';
  await expect(validateExamplePalette(svg, warmStyle)).resolves.toBeUndefined();
  await expect(
    validateExamplePalette(svg.replace("<circle", "<script/> <circle"), warmStyle),
  ).rejects.toThrow();
  for (const prompt of [
    examplePrompt([warmStyle]),
    reviewedStylePreviewPrompt(warmStyle, "Refresh study"),
  ]) {
    expect(prompt).toContain("not a required canvas color");
    expect(prompt).toContain("Task-provided exact colors");
    expect(prompt).not.toContain("background MUST");
    expect(prompt).not.toContain("Background must remain");
  }
});

it("keeps completed frame evidence separate from mandatory palette rules and missing matches", async () => {
  const reviewed = (await loadCatalog()).styles.filter(
    (style) => style.palette.source_frame_review,
  );
  expect(reviewed).toHaveLength(92);
  expect(
    reviewed.filter((style) => style.palette.source_frame_review!.sources.length),
  ).toHaveLength(71);
  for (const style of reviewed) {
    const evidence = style.palette.source_frame_review!;
    expect(evidence.source_review_complete).toBe(true);
    expect(evidence.sample_window_seconds).toEqual([1, 8]);
    expect(evidence.guidance).toContain("not permanent canvas restrictions");
    expect(evidence.sampling_limitation).toContain("not semantic background tokens");
    if (!evidence.sources.length)
      expect(evidence.guidance).toContain("do not invent source evidence");
    for (const source of evidence.sources) {
      expect(source.source_url).toContain("https://skillry.dev/ai-videos/opus-5-5/");
      expect(source.observed_seconds.every((second) => second >= 1 && second <= 8)).toBe(true);
    }
  }
});
