import { styleBackgroundGuidance } from "../../shared/style-palette";
import { ProductionSchema } from "../../shared/agents/schemas/video";
import type { Style } from "../../shared/contracts";
import { technologyPool } from "../../shared/technology-pool";

import { storyboardJsonGuidance } from "../domains/video/storyboard";

export { reviewedStyleProductionSchema } from "../../shared/agents/schemas/style-production";
export const stylePreviewTechnologyPool = Object.fromEntries(
  Object.entries(technologyPool).filter(
    ([key]) =>
      !["blender", "python_bpy", "cycles", "eevee_cycles", "eevee", "multiplane"].includes(key),
  ),
);
export function reviewedStylePreviewPrompt(style: Style, problem: string) {
  const previewRenderers = style.tech.style_renderer.recommended_stack_refs.filter(
    (name) => !/blender|\bbpy\b|cycles|eevee/i.test(name),
  );
  const previewMotionOwners = style.tech.motion_engine.recommended_stack_refs.filter(
    (name) => !/blender|\bbpy\b|cycles|eevee/i.test(name),
  );
  return `Create or repair a 3-second SILENT Motion Graphic motion preview for ${style.id}, ${style.name_en}.
User instruction for this rebuild: continue authoring with Claude Opus 5.5, but DO NOT use Blender, its application, command line, MCP tools, Python bpy, Cycles or EEVEE. Do not launch or test it again. Read TECHNOLOGY_POOL.json and choose suitable available non-Blender tools from that pool, such as Three.js, WebGL/GLSL, Canvas 2D, SVG, PixiJS, Paper.js, Rough.js and GSAP. Check installed dependencies before selecting them; no installs. This explicit instruction overrides any Blender recommendations in STYLE.json or an earlier session. Preserve the visual medium through the appropriate pool renderer and disclose approximations.
Read STYLE.json for the completed technology review, palette policy and implementation. Inspect ILLUSTRATION.png and ILLUSTRATION.svg as a composition/subject reference; index.html may not exist on the first attempt. Subject: an idea becomes a connected system. Preserve readable copy and approved color assignments, but construct a faithful scene using suitable renderers (${previewRenderers.join(", ") || "choose an appropriate available non-Blender renderer from TECHNOLOGY_POOL.json"}) and motion owners (${previewMotionOwners.join(", ") || "use the available local GSAP timeline as the seekable preview motion owner and declare it accurately"}). Do not merely animate the flat SVG if depth, lighting, a shader field, material transmission or paper folding defines this Motion Graphic. This is an illustrative procedural scene; disclose physical/material approximations.
If BACKGROUND_REVIEW.json is supplied, read its per-source timestamp findings and open every listed local reference contact sheet with Read before authoring. Apply only the techniques relevant to this Motion Graphic, separating scene-specific colors from material constraints. Do not copy the source subject, branding or lettering. Missing matches are an evidence limitation, not permission to invent observations.
Implementation: ${style.tech.implementation}
Optional reviewed recipes: ${JSON.stringify(style.tech.preview_recipes || [])}. For a requested refresh, demonstrate the new recipe that materially distinguishes this update while retaining the primary Motion Graphic. If more than one recipe is supplied, make a concise coherent demonstration or identify which recipe the preview covers. Silent musical examples use a clearly described authored cue sequence. Read the optional source palette as evidence; an existing primary preview palette is an example, not a permanent background restriction.
Selection: ${style.tech.library_selection}
${styleBackgroundGuidance} Example background swatch: ${style.palette.tokens.background}. If background_policy is fixed, preserve its exact value. Keep background and decorative grain stationary. Use deterministic shading/alpha as appropriate; inspect local text contrast using the resolved scene palette and preserve any explicitly approved tokens. Meaningful foreground motion must change at least 8% of card pixels; reveal, fold, rotate or reshape substantial scene objects. Keep the full composition legible and settled by 2.7 seconds, with no distracting tiny-only motion or full-canvas movement to game the check.
Write standalone index.html: root data-composition-id="video", data-width="1280", data-height="720", data-duration="3", data-fps="30", CSS width/height 100%. Register one fully built paused GSAP timeline at window.__timelines.video. gsap.min.js and chroma.min.js are local. node_modules is a read-only link to existing dependencies. Use local esbuild to bundle browser imports into separate local .js files if required; do not inline vendor-library bundles into the composition HTML, where library internals can trigger nondeterminism audits. no installs, remote imports or network. Preload/cache geometry and textures. Canvas/WebGL/Three state must derive from shared timeline time and redraw on hf-seek, including direct, backward and out-of-order seeking. Never use clocks, autonomous tickers, unseeded randomness or carried simulation state. Keep raymarch budgets bounded and verify browser/Node API boundaries. Never disable or suppress runtime/layout/contrast checks. Use clean, locally available system typography with safe margins; do not hide required text.
Write production.json and STORYBOARD.json with the actual renderers, motion owners, dimensions, duration, silent audio and limitations. ${storyboardJsonGuidance} Return production.json as production plus concise repairNotes; omit plan. Do not run rendering or browser tests; the host runs real QA and returns failures for correction in this same session. Current validation issue: ${problem.slice(-11000)}`;
}

export function validateReviewedStyleProduction(input: unknown, style: Style) {
  const production = ProductionSchema.parse(input);
  if (
    production.pipeline !== "HyperFrames" ||
    production.sourceFile !== "index.html" ||
    production.duration !== 3 ||
    production.width !== 1280 ||
    production.height !== 720
  )
    throw Error("Motion Graphic preview must use HyperFrames at 1280×720 for exactly 3 seconds");
  if (
    !style.tech.style_renderer.recommended_stack_refs.some((name) =>
      production.styleRenderer.includes(name),
    ) ||
    !style.tech.motion_engine.recommended_stack_refs.some((name) =>
      production.motionEngine.includes(name),
    )
  )
    throw Error("Motion Graphic preview must use its reviewed renderer and motion stack");
  return production;
}
