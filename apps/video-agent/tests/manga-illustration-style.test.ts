import { beforeMangaReferenceStudy } from "./fixtures/manga-reference-baseline";
import { expect, it } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import { validateExampleSvg, validateExamplePalette } from "../src/server/catalog/style-examples";
import {
  mangaIllustrationPreviewHtml,
  mangaIllustrationPreviewSvg,
} from "../scripts/generate-manga-illustration-preview";

it("puts the reference drawing lessons on Manga, preserving the theatre's independent identity", async () => {
  const styles = (await loadCatalog()).styles;
  const manga = styles.find((style) => style.id === "style-032")!;
  const theatre = styles.find((style) => style.id === "style-136")!;
  expect(manga.name_en).toBe("Manga");
  expect(manga.visual_cues).toContain("animals, creatures, monsters, objects, machines");
  expect(manga.visual_cues).toContain("human faces, eyes and hands are optional");
  for (const guidance of [manga.tech.implementation, manga.executable_prompt_template]) {
    for (const lesson of [
      "Manga is a visual storytelling language",
      "do not default to a person",
      "For animals use species-specific proportions",
      "for monsters establish coherent invented anatomy",
      "for objects and machines use perspective",
      "only for a subject with relevant head/face/body features",
      "Eye-integrity pass (only when the chosen subject has visible eyes)",
      "one shared gaze target",
      "changing an opening requires changing its mask and lid together",
      "nest highlights inside the iris",
      "actual card size",
      "Do not add eyes to subjects that do not need them",
      "hand anatomy",
      "contour weights",
      "cloth folds",
      "gutters",
      "screen-tone spacing stable",
      "do not copy reference characters",
      "seekable composition time",
      "representative still",
      "aligned tangent directions",
      "closed tapered filled shapes",
      "not an angular mitten",
      "palm/pen contact",
      "light direction",
      "temporarily mirrored",
      "do not prove drawing quality",
      "a 2D rotation is not a three-quarter head turn",
      "head yaw, pitch, tilt, gaze and emotion",
      "angle-specific contours",
      "shoulder/torso relationship",
    ])
      expect(guidance).toContain(lesson);
  }
  expect(theatre.tech.implementation).toContain("independent cue-based schedule");
  expect(theatre.tech.implementation).not.toContain("Drawing-quality rules:");
  expect(theatre.visual_cues).not.toContain("Richly inked set and equipment");
});

it("draws the manga in editable SVG without embedded image assets", async () => {
  const svg = mangaIllustrationPreviewSvg();
  expect(() => validateExampleSvg(svg)).not.toThrow();
  const manga = (await loadCatalog()).styles.find((s) => s.id === "style-032")!;
  await expect(validateExamplePalette(svg, manga)).resolves.toBeUndefined();
  for (const subject of ["character", "eye", "drawing-hand"])
    expect(svg).toContain(`data-illustration="${subject}"`);
  for (const forbidden of ["<image", "<img", "data:image", ".png", ".webp", "https:"])
    expect(svg).not.toContain(forbidden);
  const html = mangaIllustrationPreviewHtml();
  expect(svg).toContain('data-part="far-eye"');
  expect(svg).not.toContain("scale(-.37 .4)");
  expect(html).toContain(svg);
  expect(html).toContain("paused:true");
  expect(html).not.toContain("artwork.png");
  expect(manga.tech.implementation).toContain("Code-only drawing contract");
  expect(manga.executable_prompt_template).toContain("Do not substitute AI-generated images");
});

it("normalizes only the three intentionally revised manga fields for historical checks", async () => {
  const styles = (await loadCatalog()).styles;
  const manga = styles.find((s) => s.id === "style-032")!;
  const old = beforeMangaReferenceStudy(manga);
  expect(old.visual_cues).not.toBe(manga.visual_cues);
  expect(old.tech.implementation).not.toBe(manga.tech.implementation);
  expect(old.executable_prompt_template).not.toBe(manga.executable_prompt_template);
  const {
    visual_cues: _oldVisual,
    executable_prompt_template: _oldPrompt,
    tech: oldTech,
    ...oldRest
  } = old;
  const {
    visual_cues: _newVisual,
    executable_prompt_template: _newPrompt,
    tech: newTech,
    ...newRest
  } = manga;
  expect(oldRest).toEqual(newRest);
  expect({ ...oldTech, implementation: newTech.implementation }).toEqual(newTech);
  const other = styles.find((s) => s.id === "style-018")!;
  expect(beforeMangaReferenceStudy(other)).toBe(other);
});

it("allows enough SVG detail for Manga without expanding other styles' drawing budgets", async () => {
  const { examplePrompt } = await import("../src/server/catalog/style-examples");
  const styles = (await loadCatalog()).styles;
  const manga = styles.find((style) => style.id === "style-032")!;
  const other = styles.find((style) => style.id === "style-018")!;
  expect(examplePrompt([manga])).toContain("short SVG size target does not apply");
  expect(examplePrompt([manga])).toContain("no embedded images or raster traces");
  expect(examplePrompt([other])).not.toContain("45000");
});
