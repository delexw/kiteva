import { expect, it } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import { validateExampleSvg, validateExamplePalette } from "../src/server/catalog/style-examples";
import {
  mangaTheatrePreviewSvg,
  mangaTheatrePreviewFrames,
} from "../scripts/generate-manga-theatre-preview";

it("publishes the original backstage manga style with separate renderer, motion and export roles", async () => {
  const catalog = await loadCatalog();
  const style = catalog.styles.find((entry) => entry.id === "style-136")!;
  expect(style.name_en).toBe("Manga Production Theatre");
  expect(style.provenance).toBe("authored");
  expect(style.tech.style_renderer.recommended_stack_refs).toEqual([
    "HTML/CSS",
    "SVG",
    "Rough.js",
    "PixiJS",
  ]);
  expect(style.tech.motion_engine.recommended_stack_refs).toEqual([
    "GSAP",
    "Anime.js",
    "Matter.js",
  ]);
  expect(style.tech.recommended_stack.find((tool) => tool.name === "HyperFrames")).toBeUndefined();
  expect(style.tech.render_pipeline).toContain("project's renderer setting");
  expect(style.motion_references.candidates.map((entry) => entry.motion_id)).toEqual([
    "motion-012",
    "motion-036",
    "motion-029",
  ]);
  expect(style.visual_cues).toContain("timed storyboard JSON");
  expect(style.visual_cues).toContain("opening title optional");
  expect(style.palette.tokens.reaction).toBe("#F47B45");
  expect(style.tech.implementation).toContain("delivery settings");
  expect(style.executable_prompt_template).toContain("reading holds");
  expect(style.tech.implementation).toContain("dialogue");
  for (const guidance of [style.tech.implementation, style.executable_prompt_template]) {
    expect(guidance).toContain("independent cue-based schedule");
    expect(guidance).toContain("idle/frozen, travel, work, react and settle");
    expect(guidance).toContain("camera crew use a slower smooth tracking move");
    expect(guidance).toContain("Idle characters stay fully still");
    expect(guidance).toContain("never invented audible speech");
    expect(guidance).toContain("1–3 degree head nod");
    expect(guidance).toContain("do not add unvalidated fields to STORYBOARD.json");
  }
});

it("creates a safe local manga preview with persistent foreground crew and separate scrolling scenery", async () => {
  const svg = mangaTheatrePreviewSvg();
  expect(() => validateExampleSvg(svg)).not.toThrow();
  const style = (await loadCatalog()).styles.find((entry) => entry.id === "style-136")!;
  await expect(validateExamplePalette(svg, style)).resolves.toBeUndefined();
  expect(svg).toContain('id="scenery"');
  expect(svg).toContain('id="director"');
  expect(svg.indexOf('id="director"')).toBeGreaterThan(svg.indexOf('id="dialogue"'));
  expect(svg).not.toContain("https:");
  for (const role of ["stage", "art", "lighting", "sound", "camera"]) {
    expect(svg).toContain(`id="crew-${role}"`);
    expect(svg).toContain(`id="status-${role}"`);
    expect(svg).toContain(`id="active-${role}"`);
  }
  expect(svg).not.toContain("HOW IT’S MADE");
});

it("plans sample crew motion and status from JSON using the shared deterministic planner", () => {
  const frames = mangaTheatrePreviewFrames();
  expect(frames).toHaveLength(91);
  expect(frames[0].crew.every((state) => state.x === state.home)).toBe(true);
  expect(frames[40].crew.every((state) => state.working)).toBe(true);
  expect(
    frames.at(-1)?.crew.every((state) => state.phase === "ready" && state.x === state.home),
  ).toBe(true);
  expect(mangaTheatrePreviewFrames()).toEqual(frames);
});

it("embeds a portable mandatory crew implementation in the style metadata", async () => {
  const style = (await loadCatalog()).styles.find((entry) => entry.id === "style-136")!;
  expect(style.tech.reference_implementation).toMatchObject({
    version: 1,
    required: true,
    format: "HTML/CSS",
    files: [
      { name: "crew.css", language: "css", code: expect.stringContaining("clip-path: polygon(") },
      {
        name: "crew.html",
        language: "html",
        code: expect.stringContaining('data-role="director"'),
      },
    ],
  });
  for (const guidance of [style.tech.implementation, style.executable_prompt_template]) {
    expect(guidance).toContain("MANDATORY CHARACTER IMPLEMENTATION");
    expect(guidance).toContain("tech.reference_implementation.files");
    expect(guidance).toContain("do not redraw the cast from the prose alone");
  }
  expect(JSON.stringify(style.tech.reference_implementation)).not.toMatch(
    /src\/client|storyboard-crew\.tsx|import\s|https?:|url\(/,
  );
});
