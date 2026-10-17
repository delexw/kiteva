import { styleBackgroundGuidance } from "../../shared/style-palette";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import chroma from "chroma-js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Style, StyleExample } from "../../shared/contracts";
import { dataRoot } from "../runtime/config";
import { styleArtworkFolder } from "./style-preview-assets";
export { styleArtworkFolder } from "./style-preview-assets";
export function isReadyStyleExample(record: StyleExample | undefined) {
  return (
    !!record &&
    record.status === "ready" &&
    (record.provider === "claude" ||
      (record.authorship === "application" &&
        record.model === "application-authored" &&
        !record.provider))
  );
}
export const examplesFolder = path.join(dataRoot, "examples");

export {
  ExampleDesignSchema,
  type ExampleDesign,
} from "../../shared/agents/schemas/example-design";
import type { ExampleDesign } from "../../shared/agents/schemas/example-design";
export function examplePromptContext(styles: Style[]) {
  return {
    styles: styles.map((style) => ({
      id: style.id,
      name: style.name_en,
      visual_cues: style.visual_cues,
      implementation: style.tech.implementation,
      palette: style.palette,
    })),
  };
}
export function examplePrompt(styles: Style[]) {
  const mangaDetail = styles.some((style) => style.id === "style-032")
    ? " For Manga (style-032) only, the short SVG size target does not apply: allow up to 45000 characters for a finished subject-driven illustration and story-relevant close-up or structural detail. Use smooth cubic Bezier contours, tapered filled ink accents, opaque form layers and clipped screentones. Choose human or non-human subjects from the brief; do not require a portrait, eye or hand insert. Refine subject structure, anatomy where relevant, and joins before adding texture; do not reduce the subject to an eye icon or node diagram to save characters. Keep all illustration code-authored and editable; no embedded images or raster traces."
    : "";
  return `Design ONE beautiful static 1280×720 page for EACH Motion Graphic below, on the simple subject "An idea becomes a connected system". Make each page's illustration, composition and typography express its own Motion Graphic clearly. Avoid a shared template: compare the designs and make them unmistakably different. Honor approved exact colors, visual cues and implementation drawing guidance in the required input. ${styleBackgroundGuidance} Apply its relevant construction and refinement techniques to this static illustration; do not execute video production steps. For a fixed background policy, use the exact supplied palette. For scene_dependent backgrounds, choose a Motion Graphic-appropriate background and coordinated foreground colors; the supplied hex values are examples. Include an explicit full-canvas 1280×720 background rectangle as the first visible element. Keep material colors separate from the scene background. Return self-contained SVG artwork, about 1800-3200 characters each.${mangaDetail} Reuse SVG defs and patterns instead of repeating shapes. Use vector illustration, masks, gradients, textures or patterns where useful. Use system font families only, no scripts, external files, photographic assets, foreignObject, animation or video framework. This is a static Motion Graphic study, not a video. Do not invent photographs: interpret asset-dependent Motion Graphics through illustrative graphics. Return examples with exactly the supplied IDs and a single-sentence design note. Read the complete styles array from the required input JSON. Do not research or inspect unrelated sources. Return all ${styles.length} supplied Motion Graphics.`;
}
export function validateExampleSvg(svg: string) {
  if (svg.length > 150000 || /<!DOCTYPE|<!ENTITY/i.test(svg)) throw Error("Invalid SVG document");
  const valid = XMLValidator.validate(svg);
  if (valid !== true) throw Error(`Invalid SVG XML: ${valid.err.msg}`);
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(svg);
  if (!parsed.svg || String(parsed.svg["@_viewBox"]).trim().replace(/\s+/g, " ") !== "0 0 1280 720")
    throw Error("Motion Graphic page must use viewBox 0 0 1280 720");
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (/^(script|foreignObject|iframe|image)$/i.test(key))
        throw Error(`Unsafe SVG element: ${key}`);
      if (/^@_on/i.test(key)) throw Error("SVG event handlers are not allowed");
      if (
        /^@_(href|xlink:href)$/i.test(key) &&
        (typeof entry !== "string" || !entry.startsWith("#"))
      )
        throw Error("External SVG references are not allowed");
      if (
        typeof entry === "string" &&
        (/javascript:|@import/i.test(entry) ||
          Array.from(entry.matchAll(/url\(([^)]*)\)/g)).some(
            (match) =>
              !match[1]
                .trim()
                .replace(/^['"]|['"]$/g, "")
                .startsWith("#"),
          ))
      )
        throw Error("External SVG resources are not allowed");
      if (Array.isArray(entry)) entry.forEach(visit);
      else visit(entry);
    }
  }
  visit(parsed.svg);
  return svg;
}
export async function validateExamplePalette(svg: string, style: Style) {
  validateExampleSvg(svg);
  if (style.palette.background_policy === "scene_dependent") {
    // Suggested catalog swatches are not approved project colors. Still verify real SVG rendering.
    await sharp(Buffer.from(svg)).resize(1280, 720).png().toBuffer();
    return;
  }
  const allowed = new Set(
    Object.values(style.palette.tokens).map((color) => chroma(color).hex().toLowerCase()),
  );
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(svg);
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (
        /^@_(fill|stroke|stop-color|color)$/.test(key) &&
        typeof entry === "string" &&
        chroma.valid(entry) &&
        !allowed.has(chroma(entry).hex().toLowerCase())
      )
        throw Error(`Color ${entry} is outside ${style.id}'s exact palette`);
      if (Array.isArray(entry)) entry.forEach(visit);
      else visit(entry);
    }
  }
  visit(parsed.svg);
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(1280, 720)
    .flatten({ background: style.palette.tokens.background })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const expected = chroma(style.palette.tokens.background).rgb();
  const rectangles: Array<Record<string, unknown> | undefined> = Array.isArray(parsed.svg.rect)
    ? parsed.svg.rect
    : [parsed.svg.rect];
  const fullCanvas = rectangles.filter(
    (rect): rect is Record<string, unknown> =>
      rect !== undefined &&
      Number(rect["@_width"]) === 1280 &&
      Number(rect["@_height"]) === 720 &&
      Number(rect["@_x"] || 0) === 0 &&
      Number(rect["@_y"] || 0) === 0,
  );
  if (
    !fullCanvas.length ||
    !chroma.valid(String(fullCanvas[0]["@_fill"])) ||
    chroma(String(fullCanvas[0]["@_fill"])).hex() !==
      chroma(style.palette.tokens.background).hex() ||
    fullCanvas
      .slice(1)
      .some(
        (rect) =>
          chroma.valid(String(rect["@_fill"])) &&
          Number(rect["@_opacity"] ?? 1) === 1 &&
          chroma(String(rect["@_fill"])).hex() !== chroma(style.palette.tokens.background).hex(),
      )
  )
    throw Error(`Full-canvas background must be exactly ${style.palette.tokens.background}`);
  let matchingPixels = 0;
  for (let pixel = 0; pixel < data.length; pixel += info.channels) {
    if (expected.every((value, index) => Math.abs(data[pixel + index] - value) <= 2))
      matchingPixels++;
  }
  if (!matchingPixels)
    throw Error(`Rendered background must contain ${style.palette.tokens.background}`);
}
export async function readExampleRecords(): Promise<StyleExample[]> {
  try {
    return JSON.parse(await readFile(path.join(styleArtworkFolder, "manifest.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function writeExampleRecords(records: StyleExample[]) {
  await mkdir(styleArtworkFolder, { recursive: true });
  const temp = path.join(styleArtworkFolder, "manifest.json.tmp");
  await writeFile(temp, JSON.stringify(records, null, 2));
  await rename(temp, path.join(styleArtworkFolder, "manifest.json"));
}
export async function publishExample(design: ExampleDesign, record: StyleExample) {
  validateExampleSvg(design.svg);
  await mkdir(styleArtworkFolder, { recursive: true });
  const source = `${design.styleId}.svg`;
  const thumbnail = `${design.styleId}.webp`;
  const temporary = path.join(styleArtworkFolder, `${thumbnail}.tmp`);
  await sharp(Buffer.from(design.svg))
    .resize(1280, 720, { fit: "fill" })
    .webp({ quality: 92 })
    .toFile(temporary);
  await writeFile(path.join(styleArtworkFolder, source), design.svg);
  await rename(temporary, path.join(styleArtworkFolder, thumbnail));
  return {
    ...record,
    status: "ready" as const,
    thumbnail,
    source,
    generatedAt: new Date().toISOString(),
    designNotes: design.designNotes,
    error: undefined,
  };
}
export function examplePage(styleId: string, video = false, applicationAuthored = false) {
  const author = applicationAuthored ? "Application-authored" : "AI-authored";
  if (!/^style-\d{3}$/.test(styleId)) throw Error("Invalid Motion Graphic ID");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>One-page Motion Graphic study</title><style>html{background:#16181a;color:#b8b9ba;font-family:system-ui}body{margin:0;min-height:100vh;display:grid;align-content:center;gap:14px}img{width:100%;max-width:1280px;height:auto;display:block;margin:auto}p{text-align:center;font-size:12px;margin:0 12px 18px}</style>${video ? `<video controls autoplay muted loop playsinline poster="/api/examples/${styleId}" src="/api/examples/${styleId}/video" style="width:100%;max-width:1280px;margin:auto"></video>` : `<img src="/api/examples/${styleId}/source" alt="${author} single-page illustration of this Motion Graphic">`}<p>${author} illustrative Motion Graphic study · not reference footage</p></html>`;
}
