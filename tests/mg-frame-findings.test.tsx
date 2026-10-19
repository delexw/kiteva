import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { catalogRoot } from "../src/server/runtime/config";
import { loadCatalog } from "../src/server/catalog/catalog";
import {
  MotionGraphicVariantSchema,
  MotionPatternSchema,
  MotionVariantSchema,
} from "../src/shared/contracts";
import {
  motionGraphicVariantGuidance,
  validateCatalogVariants,
  withMotionGraphicVariantPolicy,
} from "../src/shared/catalog-variants";
import { pageStyleContext } from "../src/server/domains/page/prompts";
import { MotionGraphicVariants, MotionVariantList } from "../src/client/catalog-variants";
import { drawMotionPreview, supportedMotionIds } from "../src/client/motion-drawing";
import { motionProgress } from "../src/client/motion-previews/drawing";
import {
  EXPAND_FROM,
  glyphRadius,
  INK_FLOOD,
  PANEL,
} from "../src/client/motion-previews/motion-044";
import {
  FRAME,
  frameBox,
  LOOP_POINTS,
  MARK_POINT_COUNT,
  markPoints,
  PORTAL,
  regionCoverScale,
  UNIT_CORNERS,
} from "../src/client/motion-previews/motion-045";
import {
  ARROW_HALO,
  arrowHead,
  cardRect,
  DEVICE,
  FEED_ARROWS,
  PIPELINE,
  PROCESSING_COMPLETE,
  STEP_ARROWS,
  STEPS,
} from "../src/client/motion-previews/motion-046";
import { ghostState } from "../src/client/motion-previews/motion-036";
import {
  squashScale,
  SQUASH,
  BURST,
  ORNAMENTS_FROM,
  SPIKE_COLOR,
} from "../src/client/motion-previews/motion-040";
import { deckPose, DECK } from "../src/client/motion-previews/motion-008";
import {
  HERO_COPY_X,
  HERO_SUBTITLE,
  LAST_TILE_LANDS,
  selectedRect,
  ZOOM_THROUGH,
} from "../src/client/motion-previews/motion-025";
import {
  AVATAR_HOP,
  bracketCorners,
  connectorStage,
  CONNECTOR_SCALE,
  CONNECTOR_STAGES,
  layoutAt,
} from "../src/client/motion-previews/motion-026";
import { bowlCenter, GLYPH_PORTAL } from "../src/client/motion-previews/motion-038";
import { annotationState, ANNOTATION } from "../src/client/motion-previews/motion-029";

type Command = unknown[];
function drawCommands(id: string, time: number) {
  const commands: Command[] = [];
  const context = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args: unknown[]) =>
          commands.push([name, ...args]),
      set: (_, name, value) => {
        commands.push([name, value]);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  drawMotionPreview(context, id, time);
  return commands;
}
const named = (commands: Command[], name: string) => commands.filter((c) => c[0] === name);
const texts = (id: string, time: number) =>
  named(drawCommands(id, time), "fillText").map((c) => String(c[1]));
const seekStable = (id: string, times: number[]) => {
  const forward = times.map((time) => drawCommands(id, time));
  const backward = [...times]
    .reverse()
    .map((time) => drawCommands(id, time))
    .reverse();
  expect(backward, id).toEqual(forward);
  drawCommands(id, 6);
  expect(drawCommands(id, times[1]!), id).toEqual(forward[1]);
};

const CANDIDATE_KEYS = [
  "glyph-ink-flood-container-handoff",
  "annotation-mark-portal-transition",
  "cumulative-device-feed-pipeline",
  "keyword-glyph-portal-emission",
  "squash-to-band-card-flip",
  "ghost-smear-glyph-build",
  "burst-masked-word-swap-slam",
  "morphing-connector-to-frame-brackets",
  "brush-annotation-lifecycle",
  "burst-hub-selected-card-zoom-through",
  "card-split-fan-deck",
  "punk-zine-brush-kinetic-card",
  "neon-sticker-collage-on-black",
  "retro-propaganda-device-collage",
];
const validStyleVariant = {
  id: "demo-variant",
  name: "Demo",
  source_key: "demo",
  summary: "A demo look.",
  use_when: "Always in tests.",
  visual_guidance: ["One visual rule."],
  animation_guidance: ["One animation rule."],
  palette_guidance: "Illustrative only.",
};

describe("typed variant contracts and utilities", () => {
  it("parses optional Motion Graphic variants with defaults and rejects malformed values", () => {
    const parsed = MotionGraphicVariantSchema.parse(validStyleVariant);
    expect(parsed.illustrative_swatches).toEqual([]);
    expect(parsed.paired_motion_ids).toEqual([]);
    expect(() =>
      MotionGraphicVariantSchema.parse({ ...validStyleVariant, id: "Bad Id" }),
    ).toThrow();
    expect(() =>
      MotionGraphicVariantSchema.parse({
        ...validStyleVariant,
        illustrative_swatches: [{ role: "x", hex: "red" }],
      }),
    ).toThrow();
    expect(() =>
      MotionGraphicVariantSchema.parse({ ...validStyleVariant, visual_guidance: [] }),
    ).toThrow();
  });

  it("requires a valid preview window for motion variants", () => {
    const motionVariant = {
      id: "demo",
      name: "Demo",
      source_key: "demo",
      summary: "s",
      use_when: "u",
      motion_sequence: ["step"],
      executable_guidance: "g",
      preview_window_seconds: [1, 2],
      verification: ["v"],
    };
    expect(MotionVariantSchema.parse(motionVariant).limitations).toEqual([]);
    expect(() =>
      MotionVariantSchema.parse({ ...motionVariant, preview_window_seconds: [3, 2] }),
    ).toThrow();
    expect(() =>
      MotionVariantSchema.parse({ ...motionVariant, preview_window_seconds: [0, 7] }),
    ).toThrow();
  });

  it("rejects duplicate variants and pairings with unknown motions", () => {
    const variant = MotionGraphicVariantSchema.parse({
      ...validStyleVariant,
      paired_motion_ids: ["motion-001"],
    });
    expect(() =>
      validateCatalogVariants(
        [{ id: "style-x", motion_graphic_variants: [variant] }],
        [{ id: "motion-001" }],
      ),
    ).not.toThrow();
    expect(() =>
      validateCatalogVariants(
        [{ id: "style-x", motion_graphic_variants: [variant, variant] }],
        [{ id: "motion-001" }],
      ),
    ).toThrow(/Duplicate Motion Graphic variant/);
    expect(() =>
      validateCatalogVariants([{ id: "style-x", motion_graphic_variants: [variant] }], []),
    ).toThrow(/Unknown motion motion-001/);
  });

  it("formats concise agent guidance and leaves styles without variants unchanged", () => {
    const variant = MotionGraphicVariantSchema.parse({
      ...validStyleVariant,
      paired_motion_ids: ["motion-044"],
    });
    const guidance = motionGraphicVariantGuidance(variant);
    expect(guidance).toContain("Demo (optional variant)");
    expect(guidance).toContain("Visual: One visual rule.");
    expect(guidance).toContain("Animation: One animation rule.");
    expect(guidance).toContain("Pairs with: motion-044.");
    const plain = { id: "style-x" };
    expect(withMotionGraphicVariantPolicy(plain)).toBe(plain);
  });
});

describe("catalog integration", () => {
  it("adds three complete motions and keeps every prior ID, style and count", async () => {
    const catalog = await loadCatalog();
    const raw = JSON.parse(
      await readFile(path.join(catalogRoot, "motion-pattern-catalog.json"), "utf8"),
    );
    expect(raw.metadata.pattern_count).toBe(48);
    expect(catalog.motions.map((motion) => motion.id)).toEqual(
      Array.from({ length: 48 }, (_, i) => `motion-${String(i + 1).padStart(3, "0")}`),
    );
    expect(catalog.styles).toHaveLength(139);
    const template = Object.keys(raw.patterns.find((p: { id: string }) => p.id === "motion-041"));
    for (const id of ["motion-044", "motion-045", "motion-046"]) {
      const entry = raw.patterns.find((p: { id: string }) => p.id === id);
      for (const key of template) expect(entry, `${id}.${key}`).toHaveProperty(key);
      const motion = MotionPatternSchema.parse(entry);
      expect(motion.executable_prompt_template).toContain("{{render_pipeline}}");
      expect(motion.source_evidence).toMatchObject({
        source_kind: "frame_analysis",
        exact_hex_from_source: false,
        review_model: "claude-opus-5-5",
        review_session_id: "db119551-bfab-4049-ae2a-1d3deaad6b42",
      });
      expect(supportedMotionIds).toContain(id);
    }
  });

  it("links the new motions only from justified Motion Graphics with review evidence", async () => {
    const catalog = await loadCatalog();
    const review = JSON.parse(
      await readFile(path.join(catalogRoot, "reviews/mg-frame-findings.json"), "utf8"),
    );
    const attached = (id: string) =>
      catalog.styles
        .filter((style) => style.motion_references.candidates.some((c) => c.motion_id === id))
        .map((style) => style.id);
    expect(attached("motion-044")).toEqual(["style-016", "style-054", "style-093"]);
    expect(attached("motion-045")).toEqual(["style-016", "style-024", "style-098"]);
    expect(attached("motion-046")).toEqual(["style-003", "style-044", "style-107", "style-111"]);
    const links = review.motion_graphic_links as { style_id: string; motion_id: string }[];
    expect(links).toHaveLength(10);
    // The typed catalog (served by the API and written to agent context) keeps provenance.
    for (const link of links) {
      const style = catalog.styles.find((entry) => entry.id === link.style_id)!;
      const candidate = style.motion_references.candidates.find(
        (entry) => entry.motion_id === link.motion_id,
      );
      expect(candidate, `${link.style_id}/${link.motion_id}`).toBeDefined();
      expect(candidate!.review_evidence).toBe("assets/catalog/reviews/mg-frame-findings.json");
      expect(candidate!.usage_guidance.length).toBeGreaterThan(60);
    }
    // Earlier reviewed links keep their provenance through validation too.
    const punk = catalog.styles.find((entry) => entry.id === "style-016")!;
    expect(
      punk.motion_references.candidates.find((entry) => entry.motion_id === "motion-037"),
    ).toMatchObject({
      review_evidence: "outputs/fable-review/motion-reference-review/review.json",
      reviewed_style_cues_sha256:
        "d6bf6b9c6b5c8d4b8478c94ae636aca7aedd47e89b3b1418c36ad2fe28d788c8",
    });
    expect(
      pageStyleContext(punk).motion_references.candidates.find(
        (entry) => entry.motion_id === "motion-044",
      )?.review_evidence,
    ).toBe("assets/catalog/reviews/mg-frame-findings.json");
  });

  it("records all fourteen recommendations with honest provenance and real implementations", async () => {
    const catalog = await loadCatalog();
    const review = JSON.parse(
      await readFile(path.join(catalogRoot, "reviews/mg-frame-findings.json"), "utf8"),
    );
    // A first rendered review requested repairs; a separate final review then passed.
    const visual = review.visual_review;
    expect(visual.status).toBe("passed");
    expect(visual.first_review.session_id).toBe("5f6d7510-c62d-4f6b-8434-8e9f55627cd7");
    const final = visual.final_review;
    expect(final.model).toBe("claude-opus-5-5");
    expect(typeof final.session_id).toBe("string");
    expect(final.session_id.trim().length).toBeGreaterThan(0);
    expect(final.session_id).not.toBe(visual.first_review.session_id);
    const hashedIds = Object.keys(final.source_hashes).sort();
    expect(hashedIds).toHaveLength(10);
    const previewReviews = final.preview_reviews as {
      id: string;
      imageRead: boolean;
      passed: boolean;
    }[];
    expect(previewReviews).toHaveLength(10);
    const reviewedIds = previewReviews.map((entry) => entry.id);
    expect(new Set(reviewedIds).size).toBe(10);
    expect([...reviewedIds].sort()).toEqual(hashedIds);
    for (const entry of previewReviews) {
      expect(entry.imageRead, entry.id).toBe(true);
      expect(entry.passed, entry.id).toBe(true);
    }
    // Each approved hash must match the preview source actually present now.
    const previewDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/client/motion-previews",
    );
    for (const id of hashedIds) {
      const source = await readFile(path.join(previewDir, `${id}.ts`));
      expect(createHash("sha256").update(source).digest("hex"), id).toBe(final.source_hashes[id]);
    }
    const ui = final.motion_graphic_ui_review;
    expect(ui.imagesRead).toHaveLength(4);
    expect(new Set(ui.imagesRead).size).toBe(4);
    expect(ui.passed).toBe(true);
    expect(review.implementation_provenance.author).toContain("claude-opus-5-5");
    expect(review.recommendations.map((entry: { key: string }) => entry.key)).toEqual(
      CANDIDATE_KEYS,
    );
    for (const entry of review.recommendations) {
      expect(entry.evidence_frames.length, entry.key).toBeGreaterThan(0);
      expect(entry.limitations.length, entry.key).toBeGreaterThan(0);
      if (entry.kind === "new_motion") {
        expect(supportedMotionIds).toContain(entry.motion_id);
        expect(entry.preview_module).toBe(`src/client/motion-previews/${entry.motion_id}.ts`);
      } else if (entry.kind === "existing_motion_variant") {
        const motion = catalog.motions.find((m) => m.id === entry.motion_id)!;
        const variant = motion.variants?.find((v) => v.id === entry.variant_id);
        expect(variant, entry.key).toBeDefined();
        expect(variant!.source_key).toBe(entry.key);
        expect(variant!.preview_window_seconds).toEqual(entry.preview_window_seconds);
        // The mechanism is visible: the preview changes across its stated window.
        const [start, end] = variant!.preview_window_seconds;
        expect(drawCommands(motion.id, start), entry.key).not.toEqual(
          drawCommands(motion.id, (start + end) / 2),
        );
      } else {
        expect(entry.kind).toBe("existing_motion_graphic_variant");
        for (const styleId of entry.style_ids) {
          const style = catalog.styles.find((s) => s.id === styleId)!;
          const variant = style.motion_graphic_variants?.find((v) => v.id === entry.variant_id);
          expect(variant, `${styleId}/${entry.key}`).toBeDefined();
          expect(variant!.source_key).toBe(entry.key);
          // Optional variants never replace the default look or palette policy.
          expect(style.palette.background_policy).toBe("scene_dependent");
          expect(variant!.palette_guidance).toMatch(/not (mandatory|a required)/);
        }
      }
    }
    // Variants are not new Motion Graphic IDs.
    expect(
      catalog.styles.filter((style) => style.motion_graphic_variants).map((s) => s.id),
    ).toEqual(["style-003", "style-016", "style-055", "style-111", "style-139"]);
  });

  it("carries variant guidance into video and page agent context", async () => {
    const catalog = await loadCatalog();
    const punk = catalog.styles.find((style) => style.id === "style-016")!;
    const video = withMotionGraphicVariantPolicy(punk) as typeof punk & {
      motion_graphic_variant_policy: string;
      motion_graphic_variant_guidance: { id: string; guidance: string }[];
    };
    expect(video.motion_graphic_variants).toEqual(punk.motion_graphic_variants);
    expect(video.motion_graphic_variant_policy).toContain("default visual direction");
    expect(video.motion_graphic_variant_guidance[0]!.guidance).toContain(
      "viewfinder corner brackets",
    );
    const page = pageStyleContext(punk) as ReturnType<typeof pageStyleContext> & {
      motion_graphic_variants?: { variants: { id: string }[] };
    };
    expect(page.motion_graphic_variants?.variants.map((v) => v.id)).toEqual([
      "punk-zine-brush-kinetic-card",
    ]);
    const plain = catalog.styles.find((style) => style.id === "style-001")!;
    expect(pageStyleContext(plain)).not.toHaveProperty("motion_graphic_variants");
  });

  it("renders variants in Motion Graphic and motion details only when present", async () => {
    const catalog = await loadCatalog();
    const neon = catalog.styles.find((style) => style.id === "style-111")!;
    const html = renderToStaticMarkup(
      <MotionGraphicVariants variants={neon.motion_graphic_variants} />,
    );
    expect(html).toContain("Optional variants");
    expect(html).toContain("Neon Flat-Sticker Collage on Black");
    expect(html).toContain("illustrative");
    expect(html).toContain("motion-045, motion-046");
    expect(html).not.toContain("Style");
    expect(renderToStaticMarkup(<MotionGraphicVariants variants={undefined} />)).toBe("");
    const motion = catalog.motions.find((entry) => entry.id === "motion-040")!;
    const list = renderToStaticMarkup(<MotionVariantList variants={motion.variants} />);
    expect(list).toContain("Burst-Masked Word Swap and Oversized Slam");
    expect(list).toContain("Squash-to-Band Card Flip");
    expect(list).toContain("4.5s");
  });
});

describe("motion-044 glyph ink-flood container handoff", () => {
  it("holds the readable title, floods centre glyphs first and closes every hole", () => {
    expect(texts("motion-044", 1).join("")).toBe("FORMAT");
    expect(named(drawCommands("motion-044", 1), "strokeText")).toHaveLength(0);
    expect(glyphRadius(2, 1.8)).toBeGreaterThan(glyphRadius(1, 1.8));
    expect(glyphRadius(1, 1.8)).toBeGreaterThan(glyphRadius(0, 1.8));
    expect(glyphRadius(0, 1.8)).toBe(0);
    const early = named(drawCommands("motion-044", 1.75), "strokeText").map((c) => c[1]);
    expect(new Set(early)).toEqual(new Set(["R", "M"]));
    // Dilation follows real glyph outlines (text strokes), not a rectangle wipe.
    expect(named(drawCommands("motion-044", 2.2), "strokeText").length).toBeGreaterThan(6);
    expect(drawCommands("motion-044", 2.6)).toContainEqual(["fillRect", 115, 140, 410, 72]);
    expect(drawCommands("motion-044", 2.4)).not.toContainEqual(["fillRect", 115, 140, 410, 72]);
  });

  it("keeps the incoming title hidden until the panel is complete", () => {
    for (let frame = 0; frame * 0.05 < INK_FLOOD.panelComplete; frame++)
      expect(texts("motion-044", frame * 0.05)).not.toContain("NEW FRAME");
    expect(drawCommands("motion-044", 4.4)).toContainEqual([
      "fillRect",
      PANEL.x,
      PANEL.y,
      PANEL.w,
      PANEL.h,
    ]);
    expect(texts("motion-044", 4.4)).toContain("NEW FRAME");
    expect(drawCommands("motion-044", 4.6)).toEqual(drawCommands("motion-044", 6));
    seekStable("motion-044", [0, 1.8, 2.5, 3.1, 3.9, 6]);
  });

  it("eases the panel expansion exactly once", () => {
    const { start, end } = INK_FLOOD.expand;
    for (const fraction of [0.25, 0.5, 0.75]) {
      const time = start + (end - start) * fraction;
      const p = motionProgress(time, start, end);
      expect(drawCommands("motion-044", time)).toContainEqual([
        "fillRect",
        EXPAND_FROM.x + (PANEL.x - EXPAND_FROM.x) * p,
        EXPAND_FROM.y + (PANEL.y - EXPAND_FROM.y) * p,
        EXPAND_FROM.w + (PANEL.w - EXPAND_FROM.w) * p,
        EXPAND_FROM.h + (PANEL.h - EXPAND_FROM.h) * p,
      ]);
    }
    // A single smoothstep reaches the halfway rect exactly at the midpoint.
    expect(motionProgress((start + end) / 2, start, end)).toBeCloseTo(0.5, 12);
  });
});

describe("motion-045 annotation-mark portal transition", () => {
  it("draws the mark monotonically and reuses the same point list as the portal frame", () => {
    // Only paths stroked in the marker colour at full opacity are the annotation mark;
    // artwork and ornaments use other strokes and the faint lasso trail is semi-transparent.
    const markPaths = (time: number) => {
      const paths: number[][][] = [];
      let alpha = 1,
        marker = false,
        current: number[][] | undefined;
      // Emulate Canvas save()/restore() for the state this parser tracks: the region copy
      // fades its own alpha inside a saved block, and restore() returns real alpha to 1.
      const saved: { alpha: number; marker: boolean }[] = [];
      for (const command of drawCommands("motion-045", time)) {
        const [name, ...args] = command;
        if (name === "save") saved.push({ alpha, marker });
        else if (name === "restore") {
          const state = saved.pop();
          if (state) ({ alpha, marker } = state);
        } else if (name === "globalAlpha") alpha = Number(args[0]);
        else if (name === "strokeStyle") marker = args[0] === "#3D7BFF";
        else if (name === "beginPath") current = marker && alpha === 1 ? [] : undefined;
        else if ((name === "moveTo" || name === "lineTo") && current)
          current.push([Number(args[0]), Number(args[1])]);
        else if (name === "stroke" && current) {
          paths.push(current);
          current = undefined;
        }
      }
      return paths;
    };
    const drawnPath = (time: number) => {
      const paths = markPaths(time);
      expect(paths.length, `${time}s`).toBeLessThanOrEqual(1);
      return paths[0] ?? [];
    };
    expect(drawnPath(PORTAL.draw.start - 0.1)).toEqual([]);
    const partial = [1.0, 1.4];
    const lengths = [...partial, PORTAL.draw.end + 0.1].map((time) => drawnPath(time).length);
    expect(lengths[0]).toBeLessThan(lengths[1]!);
    expect(lengths[1]).toBeLessThan(lengths[2]!);
    // While drawing, the path is a prefix of the authored mark (the tip may be partial).
    for (const time of partial) {
      const path = drawnPath(time);
      expect(path.slice(0, -1)).toEqual(markPoints(time).slice(0, path.length - 1));
    }
    expect(drawnPath(PORTAL.draw.end + 0.1)).toEqual(markPoints(PORTAL.draw.end + 0.1));
    // Backward seek un-draws to exactly the same partial path.
    const forward = drawnPath(1.4);
    drawnPath(2.0);
    expect(drawnPath(1.4)).toEqual(forward);
    // The same full point list is stroked through the morph, zoom and locked frame.
    for (const time of [2.5, 3.0, PORTAL.locked + 0.01, 6])
      expect(drawnPath(time), `${time}s`).toEqual(markPoints(time));
    for (const time of [0.3, 1.2, 2.0, 2.5, 3.0, 3.5, 6])
      expect(markPoints(time)).toHaveLength(MARK_POINT_COUNT);
    // Locked: every point lies on the final rectangle.
    for (const [x, y] of markPoints(PORTAL.locked + 0.01)) {
      const onVertical = Math.min(
        Math.abs(x - (FRAME.cx - FRAME.a)),
        Math.abs(x - (FRAME.cx + FRAME.a)),
      );
      const onHorizontal = Math.min(
        Math.abs(y - (FRAME.cy - FRAME.b)),
        Math.abs(y - (FRAME.cy + FRAME.b)),
      );
      expect(Math.min(onVertical, onHorizontal)).toBeLessThan(1e-6);
    }
  });

  it("locks a true rectangle whose four exact corners belong to the same 72-point loop", () => {
    expect(MARK_POINT_COUNT - LOOP_POINTS).toBe(24);
    const locked = markPoints(PORTAL.locked + 0.01);
    const loop = locked.slice(MARK_POINT_COUNT - LOOP_POINTS);
    expect(loop).toHaveLength(72);
    for (const [ux, uy] of UNIT_CORNERS) {
      const corner = [FRAME.cx + FRAME.a * ux!, FRAME.cy + FRAME.b * uy!];
      expect(
        loop.some(([x, y]) => Math.abs(x! - corner[0]!) < 1e-9 && Math.abs(y! - corner[1]!) < 1e-9),
        `corner ${corner}`,
      ).toBe(true);
    }
    // No chamfer: every consecutive pair of loop points shares an x or a y (axis-aligned).
    for (let i = 1; i < loop.length; i++) {
      const [x0, y0] = loop[i - 1]!,
        [x1, y1] = loop[i]!;
      expect(Math.min(Math.abs(x1! - x0!), Math.abs(y1! - y0!)), `segment ${i}`).toBeLessThan(1e-9);
    }
    // The straighten begins without a pop: the first straightening frame stays on the lasso.
    const before = markPoints(PORTAL.straighten.start);
    const justAfter = markPoints(PORTAL.straighten.start + 0.001);
    before.forEach(([x, y], i) => {
      expect(Math.hypot(justAfter[i]![0]! - x!, justAfter[i]![1]! - y!)).toBeLessThan(0.5);
    });
  });

  it("scales the clipped region copy uniformly so round shapes stay round", () => {
    for (const time of [2.5, 2.8, 3.0, 3.3]) {
      const scales = named(drawCommands("motion-045", time), "scale");
      expect(scales.length, `${time}s`).toBeGreaterThan(0);
      for (const scale of scales) expect(scale[1], `${time}s`).toBe(scale[2]);
      const box = frameBox(time);
      const k = regionCoverScale(box);
      expect(scales).toContainEqual(["scale", k, k]);
      // Cover: the uniformly scaled art fills the whole clip box.
      expect(196 * k).toBeGreaterThanOrEqual(box.a * 2 - 1e-9);
      expect(116 * k).toBeGreaterThanOrEqual(box.b * 2 - 1e-9);
    }
  });

  it("reveals ornaments and the next title only after the frame locks", () => {
    for (let frame = 0; frame * 0.1 < PORTAL.locked; frame++) {
      const commands = drawCommands("motion-045", frame * 0.1);
      expect(commands).not.toContainEqual(["strokeStyle", "#FF5C8A"]);
      expect(named(commands, "fillText").map((c) => c[1])).not.toContain("03  REFERENCE VIDEO");
    }
    expect(texts("motion-045", 4.4)).toContain("03  REFERENCE VIDEO");
    expect(drawCommands("motion-045", 4.4)).toEqual(drawCommands("motion-045", 6));
    seekStable("motion-045", [0, 1.1, 2.0, 2.5, 2.7, 3.0, 3.6, 6]);
  });
});

describe("motion-046 cumulative device-feed pipeline", () => {
  const closePaths = (time: number) => named(drawCommands("motion-046", time), "closePath").length;
  it("shows card labels only after the card is complete and arrowheads only at full shafts", () => {
    expect(texts("motion-046", 0.6)).not.toContain("1  ASSETS");
    expect(texts("motion-046", 0.8)).toContain("1  ASSETS");
    expect(texts("motion-046", 1.9)).not.toContain("2  PROMPT");
    expect(texts("motion-046", 2.1)).toContain("2  PROMPT");
    // One extra closed path (the head) appears only once the step-1 shaft is complete.
    const [arrow1, arrow2] = STEPS.map((step) => step.arrow);
    expect(closePaths(arrow1![1] + 0.05) - closePaths(arrow1![1] - 0.1)).toBe(1);
    expect(closePaths(arrow2![1] - 0.05)).toBe(closePaths(arrow1![1] - 0.1));
    expect(closePaths(arrow2![1] + 0.05) - closePaths(arrow2![1] - 0.05)).toBe(1);
  });

  it("ends every arrow on free bezel edge with its head outside the device and every card", () => {
    const inside = ([x, y]: number[], r: { x: number; y: number; w: number; h: number }) =>
      // Include each card's drop shadow (+5, +6) and a 2 px margin.
      x! > r.x - 2 && x! < r.x + r.w + 7 && y! > r.y - 2 && y! < r.y + r.h + 8;
    const check = (arrow: (typeof STEP_ARROWS)[number], times: number[]) => {
      const head = arrowHead(arrow);
      expect(arrow.to[0]).toBe(DEVICE.x);
      expect(arrow.to[1]).toBeGreaterThan(DEVICE.y);
      expect(arrow.to[1]).toBeLessThan(DEVICE.y + DEVICE.h);
      for (const point of head) expect(point[0]!).toBeLessThanOrEqual(DEVICE.x + 1e-9);
      for (const time of times)
        for (let j = 0; j < STEPS.length; j++) {
          const rect = cardRect(j, time);
          if (!rect) continue;
          for (const point of [...head, arrow.to])
            expect(inside(point, rect), `card ${j} covers head at ${time}s`).toBe(false);
        }
    };
    const span = (from: number, to: number) =>
      Array.from({ length: 9 }, (_, i) => from + ((to - from) * i) / 8);
    // Step heads are fully visible from shaft completion until absorption starts.
    STEPS.forEach((step, i) => check(STEP_ARROWS[i]!, span(step.arrow[1], step.absorb[0])));
    // Docked chips never cover any step endpoint, at any time they exist.
    STEPS.forEach((_, i) =>
      check(STEP_ARROWS[i]!, span(STEPS[1]!.absorb[1], PIPELINE.pullBack.start)),
    );
    FEED_ARROWS.forEach((arrow) => check(arrow, span(PIPELINE.feeds.end, 6)));
    // The specific failure: the step-2 head is not under the docked step-1 chip.
    const docked = cardRect(0, STEPS[1]!.arrow[1] + 0.05)!;
    expect(docked).toEqual(STEPS[0]!.dock);
    for (const point of arrowHead(STEP_ARROWS[1]!)) expect(inside(point, docked)).toBe(false);
    // A light keyline under every dark shaft keeps contrast on teal and over the screen.
    const commands = drawCommands("motion-046", 4.2);
    expect(commands).toContainEqual(["strokeStyle", ARROW_HALO]);
    expect(commands).toContainEqual(["lineWidth", 10]);
  });

  it("keeps earlier chips visible through processing and output", () => {
    for (const time of [2, 3, 4, 5, 6]) expect(cardRect(0, time), `${time}`).not.toBeNull();
    const fan = STEPS[0]!.fan;
    for (const time of [4, 5, 6])
      expect(drawCommands("motion-046", time)).toContainEqual([
        "fillRect",
        fan.x,
        fan.y,
        fan.w,
        fan.h,
      ]);
    expect(texts("motion-046", 6)).toEqual(expect.arrayContaining(["1  ASSETS", "2  PROMPT"]));
  });

  it("grows nodes before connectors and reveals output contents after the window settles", () => {
    const [link0, link1] = PIPELINE.connectors;
    const nodeDone = (i: number) => PIPELINE.nodes[i]! + PIPELINE.nodePop;
    // Each connector starts only after both of its endpoint nodes have fully popped.
    expect(link0!.start).toBeGreaterThanOrEqual(Math.max(nodeDone(0), nodeDone(1)));
    expect(link1!.start).toBeGreaterThanOrEqual(Math.max(nodeDone(1), nodeDone(2)));
    expect(drawCommands("motion-046", link0!.start - 0.005)).not.toContainEqual([
      "moveTo",
      446,
      132,
    ]);
    expect(drawCommands("motion-046", link0!.start + 0.05)).toContainEqual(["moveTo", 446, 132]);
    expect(drawCommands("motion-046", link1!.start - 0.005)).not.toContainEqual([
      "moveTo",
      490,
      156,
    ]);
    expect(drawCommands("motion-046", link1!.start + 0.05)).toContainEqual(["moveTo", 490, 156]);
    expect(texts("motion-046", PIPELINE.burst.end - 0.01)).not.toContain("3  OUTPUT");
    expect(texts("motion-046", 5.2)).toContain("3  OUTPUT");
    expect(drawCommands("motion-046", PIPELINE.output.end)).toEqual(drawCommands("motion-046", 6));
    seekStable("motion-046", [0, 0.5, 1.45, 2.3, 3.4, 3.98, 4.5, 6]);
  });

  it("holds the completed processing diagram about half a second before the burst", () => {
    const hold = PIPELINE.burst.start - PROCESSING_COMPLETE;
    expect(hold).toBeGreaterThanOrEqual(0.4);
    expect(hold).toBeLessThanOrEqual(0.55);
    const complete = drawCommands("motion-046", PROCESSING_COMPLETE);
    // Both connectors are drawn in full and every node is at full size.
    expect(complete).toContainEqual(["lineTo", 490, 156]);
    expect(complete).toContainEqual(["lineTo", 446, 182]);
    // The whole frame is still during the hold, and no output window covers the screen yet.
    for (const time of [PROCESSING_COMPLETE + 0.1, PROCESSING_COMPLETE + 0.3, PIPELINE.burst.start])
      expect(drawCommands("motion-046", time), `${time}s`).toEqual(complete);
    expect(drawCommands("motion-046", PIPELINE.burst.start + 0.05)).not.toEqual(complete);
    // At least 0.8 s remains to read the output after it fills in.
    expect(6 - PIPELINE.output.end).toBeGreaterThanOrEqual(0.8);
    expect(texts("motion-046", 5.5)).toContain("illustrative output");
  });
});

describe("existing motion improvements", () => {
  it("motion-036 builds a ghost-smear subtitle in place without moving glyphs", () => {
    expect(ghostState(0, 2.29)).toBeNull();
    expect(ghostState(0, 2.35)).toBe("ghost");
    expect(ghostState(0, 2.45)).toBe("solid");
    const ghost = drawCommands("motion-036", 2.35);
    expect(ghost).toContainEqual(["fillText", "T", 184, 284]);
    expect(ghost).toContainEqual(["fillText", "T", 184, 269]);
    expect(drawCommands("motion-036", 2.5)).not.toContainEqual(["fillText", "T", 184, 269]);
    for (const time of [2.35, 2.6, 3.0])
      expect(named(drawCommands("motion-036", time), "translate")).toHaveLength(6);
  });

  it("motion-038 morphs the key glyph, emits a de-rotating card and captions it after landing", () => {
    expect(drawCommands("motion-038", 3.7)).toContainEqual([
      "arc",
      -4,
      -8,
      9,
      Math.PI / 2,
      (Math.PI * 3) / 2,
    ]);
    expect(named(drawCommands("motion-038", 4.2), "arc").some((c) => c[3] === 9)).toBe(false);
    const rotation = (time: number) =>
      Number(named(drawCommands("motion-038", time), "rotate").at(-1)![1]);
    expect(rotation(4.4)).toBeLessThan(0);
    expect(rotation(5.1)).toBe(0);
    expect(texts("motion-038", 4.7)).not.toContain("the text became a picture");
    expect(texts("motion-038", 5.1)).toContain("the text became a picture");
    seekStable("motion-038", [2.4, 3.9, 4.3, 4.6, 5.1]);
  });

  it("motion-038 sets an ≈85 px key glyph in the headline line and hands the bowl into the patch", () => {
    const hold = drawCommands("motion-038", 3.5);
    expect(hold).toContainEqual(["scale", GLYPH_PORTAL.scale, GLYPH_PORTAL.scale]);
    const tileSize = 46 * GLYPH_PORTAL.scale;
    expect(tileSize).toBeGreaterThanOrEqual(80);
    // Same line as "NEXT CHAPTER" (38 px caps on baseline 190), just left of the centred word.
    expect(hold).toContainEqual(["fillText", "NEXT CHAPTER", 320, 190]);
    expect(Math.abs(GLYPH_PORTAL.tile.y - (190 - 38 * 0.36))).toBeLessThan(12);
    expect(GLYPH_PORTAL.tile.x + tileSize / 2).toBeLessThan(320 - 120);
    expect(GLYPH_PORTAL.tile.x - tileSize / 2).toBeGreaterThan(40);
    // The higher-contrast chapter label: dark 20 px.
    expect(hold).toContainEqual(["font", "600 20px sans-serif"]);
    expect(hold).toContainEqual(["fillText", "CHAPTER 2", 320, 146]);
    // The bowl travels continuously from the pilcrow bowl to the patch centre.
    expect(bowlCenter(0)).toEqual([-4, -8]);
    expect(bowlCenter(1)).toEqual([0, -54 / 2 + 13]);
    for (let step = 1; step <= 20; step++) {
      const [x0, y0] = bowlCenter((step - 1) / 20),
        [x1, y1] = bowlCenter(step / 20);
      expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(1);
    }
    // Mid-morph, the shrinking bowl and the growing patch share the same centre.
    const mid = (GLYPH_PORTAL.morph.start + GLYPH_PORTAL.morph.end) / 2;
    const m = motionProgress(mid, GLYPH_PORTAL.morph.start, GLYPH_PORTAL.morph.end);
    expect(m).toBeCloseTo(0.5);
    const lerp = (a: number, b: number) => a + (b - a) * m;
    const [bx, by] = bowlCenter(m);
    const frame = drawCommands("motion-038", mid);
    expect(frame).toContainEqual(["arc", bx, by, lerp(9, 0), Math.PI / 2, (Math.PI * 3) / 2]);
    const patchWidth = (lerp(46, 40) - 12) * m,
      patchHeight = 14 * m;
    expect(frame).toContainEqual([
      "fillRect",
      bx - patchWidth / 2,
      by - patchHeight / 2,
      patchWidth,
      patchHeight,
    ]);
  });

  it("motion-040 swaps at the burst peak and at minimum squash height, one copy per frame", () => {
    expect(texts("motion-040", BURST.peak - 0.001)).toEqual(["AND"]);
    const slam = drawCommands("motion-040", BURST.peak);
    expect(named(slam, "fillText").map((c) => c[1])).toEqual(["GO BIG"]);
    expect(Number(named(slam, "scale")[0]![1])).toBeGreaterThan(1);
    expect(named(drawCommands("motion-040", 4.1), "scale")).toHaveLength(0);
    expect(squashScale(SQUASH.start)).toBe(1);
    expect(squashScale(SQUASH.swap)).toBeCloseTo(SQUASH.min);
    expect(texts("motion-040", SQUASH.swap - 0.001)).toEqual(["GO BIG"]);
    expect(texts("motion-040", SQUASH.swap)).toEqual(["MAKE IT REAL"]);
    // Two-tone corner ornaments (8 bracket strokes) arrive with the 3.8 s emphasis cut and
    // then stay identical through the slam, the settled hold, the squash and the final card.
    const ornaments = (time: number) => named(drawCommands("motion-040", time), "moveTo").slice(-8);
    const cornerMoves = ornaments(6);
    expect(cornerMoves).toHaveLength(8);
    for (const time of [ORNAMENTS_FROM, 3.9, 4.2, SQUASH.start + 0.1, SQUASH.swap, 5.5])
      expect(ornaments(time), `${time}s`).toEqual(cornerMoves);
    for (const time of [3.2, 3.6, ORNAMENTS_FROM - 0.001])
      expect(drawCommands("motion-040", time)).not.toContainEqual(cornerMoves[0]);
    for (let frame = 0; frame <= 20; frame++)
      expect(texts("motion-040", SQUASH.start + frame * 0.03)).toHaveLength(1);
    seekStable("motion-040", [3.5, 3.7, 3.8, 3.9, 4.45, 4.6, 4.7, 6]);
  });

  it("motion-040 separates the burst from the incoming word and holds it before the squash", () => {
    // Spikes are cream, not the lime of the incoming word, and the word gets a dark keyline.
    expect(SPIKE_COLOR).not.toBe("#9BFF46");
    const peak = drawCommands("motion-040", BURST.peak + 0.01);
    expect(peak).toContainEqual(["fillStyle", SPIKE_COLOR]);
    const outline = named(peak, "strokeText");
    expect(outline.map((c) => c[1])).toEqual(["GO BIG"]);
    const strokeIndex = peak.findIndex((c) => c[0] === "strokeText");
    const fillIndex = peak.findIndex((c) => c[0] === "fillText");
    expect(strokeIndex).toBeLessThan(fillIndex);
    // No keyline on ordinary clean cuts or once the burst has cleared.
    expect(named(drawCommands("motion-040", 3.4), "strokeText")).toHaveLength(0);
    expect(named(drawCommands("motion-040", 4.2), "strokeText")).toHaveLength(0);
    // GO BIG reads at rest scale for at least 0.45 s before the squash starts.
    expect(SQUASH.start - BURST.slamEnd).toBeGreaterThanOrEqual(0.45);
    expect(drawCommands("motion-040", BURST.clear)).toEqual(
      drawCommands("motion-040", SQUASH.start - 0.001),
    );
    // The final message still holds unchanged for the last second.
    expect(6 - SQUASH.end).toBeGreaterThanOrEqual(1);
  });

  it("motion-008 fans hidden siblings about one pivot, then restacks them", () => {
    expect(texts("motion-008", 4.0)).toContain("REF 1");
    expect(texts("motion-008", 4.0)).not.toContain("REF 2");
    // Just before and at the fan start every card is collapsed at exactly 0; just after,
    // each card has begun rotating toward its own slot (signs match the authored fan).
    for (let k = 0; k < 4; k++) {
      expect(deckPose(k, DECK.fan.start - 0.01).angle).toBe(0);
      expect(deckPose(k, DECK.fan.start).angle).toBe(0);
      const after = deckPose(k, DECK.fan.start + 0.05).angle;
      expect(Math.sign(after)).toBe(Math.sign(DECK.angles[DECK.angles.length - 1 - k]!));
    }
    const fanned = [0, 1, 2, 3].map((k) => deckPose(k, DECK.fan.end).angle);
    expect(new Set(fanned).size).toBe(4);
    const pivot = named(drawCommands("motion-008", DECK.fan.end), "translate").filter(
      (c) => c[1] === DECK.pivot.x && c[2] === DECK.pivot.y,
    );
    expect(pivot).toHaveLength(4);
    const stacked = [0, 1, 2, 3].map((k) => deckPose(k, 6));
    expect(stacked.every((pose) => pose.angle === 0)).toBe(true);
    expect(new Set(stacked.map((pose) => pose.dx)).size).toBe(4);
    expect(drawCommands("motion-008", 5.4)).toEqual(drawCommands("motion-008", 6));
  });

  it("motion-025 draws spokes only after landing and zooms the same tile into the next hero", () => {
    expect(drawCommands("motion-025", 0.65)).not.toContainEqual(["strokeStyle", "#4C6172"]);
    expect(drawCommands("motion-025", 0.85)).toContainEqual(["strokeStyle", "#4C6172"]);
    expect(selectedRect(ZOOM_THROUGH.peak).w).toBeGreaterThan(640);
    expect(selectedRect(6)).toEqual(ZOOM_THROUGH.hero);
    for (const time of [2, 4.2, 5.5])
      expect(drawCommands("motion-025", time)).toContainEqual(["fillStyle", "#F4F7F2"]);
    expect(texts("motion-025", ZOOM_THROUGH.land - 0.05)).not.toContain("02  COASTLINE");
    expect(texts("motion-025", 5.3)).toContain("02  COASTLINE");
    expect(texts("motion-025", 3)).toContain("Coastline — Study 02");
    expect(texts("motion-025", 4.2)).not.toContain("Coastline — Study 02");
  });

  it("motion-025 labels tiles after the last landing, holds the complete hub and keeps hero copy inside", () => {
    // Labels never appear while any tile is still in flight.
    for (const time of [0.56, 0.6, LAST_TILE_LANDS - 0.01])
      expect(texts("motion-025", time)).not.toContain("Summit");
    expect(texts("motion-025", LAST_TILE_LANDS)).toContain("Summit");
    // Complete hub: spokes fully drawn and supporting copy at full opacity, held ≥ 0.4 s.
    const hub = (time: number) => drawCommands("motion-025", time);
    const fullHubStart = 0.92;
    const holdEnd = 1.38;
    expect(holdEnd - fullHubStart).toBeGreaterThanOrEqual(0.4);
    for (const time of [fullHubStart + 0.01, 1.1, holdEnd - 0.01]) {
      const frame = hub(time);
      expect(frame).toContainEqual(["strokeStyle", "#4C6172"]);
      expect(frame).toContainEqual(["fillText", "SIX FIELD STUDIES", 320, 48]);
      expect(frame.find((c) => c[0] === "globalAlpha")).toEqual(["globalAlpha", 1]);
    }
    // Hero copy starts right of the hero card and stays well inside the right edge.
    const hero = drawCommands("motion-025", 5.5);
    expect(HERO_COPY_X).toBeGreaterThan(ZOOM_THROUGH.hero.x + ZOOM_THROUGH.hero.w + 12);
    HERO_SUBTITLE.forEach((line, i) =>
      expect(hero).toContainEqual(["fillText", line, HERO_COPY_X, 186 + i * 22]),
    );
    // Generous width budget (0.62 em per glyph at 17 px) still ends inside a 16 px margin.
    for (const line of HERO_SUBTITLE)
      expect(HERO_COPY_X + line.length * 17 * 0.62).toBeLessThan(640 - 16);
    expect(HERO_COPY_X + "02  COASTLINE".length * 30 * 0.62).toBeLessThan(640 - 16);
  });

  it("motion-026 steps through held connector symbols and frames both cards exactly", () => {
    expect(connectorStage(2.69)).toBeNull();
    expect(CONNECTOR_STAGES.map((entry) => connectorStage(entry.start + 0.05))).toEqual([
      "zigzag",
      "tilde",
      "cross",
      "parens",
      "brackets",
    ]);
    for (let i = 1; i < CONNECTOR_STAGES.length; i++)
      expect(CONNECTOR_STAGES[i]!.start - CONNECTOR_STAGES[i - 1]!.start).toBeGreaterThanOrEqual(
        2 / 30,
      );
    const corners = bracketCorners(5).map(({ x, y }) => [x, y]);
    expect(corners).toEqual([
      [40, 92],
      [300, 92],
      [40, 154],
      [300, 154],
      [320, 92],
      [620, 92],
      [320, 336],
      [620, 336],
    ]);
    expect(drawCommands("motion-026", 4.2)).toEqual(drawCommands("motion-026", 6));
  });

  it("motion-026 draws connector symbols at 1.5× but keeps the brackets at the exact corners", () => {
    expect(CONNECTOR_SCALE).toBe(1.5);
    for (const entry of CONNECTOR_STAGES.slice(0, 4))
      expect(drawCommands("motion-026", entry.start + 0.05), entry.stage).toContainEqual([
        "scale",
        CONNECTOR_SCALE,
        CONNECTOR_SCALE,
      ]);
    // Bracket stage: no symbol scaling, so the corner bracket geometry stays exact.
    const brackets = drawCommands("motion-026", 5);
    expect(brackets).not.toContainEqual(["scale", CONNECTOR_SCALE, CONNECTOR_SCALE]);
    expect(brackets).toContainEqual(["lineTo", 620, 336]);
  });

  it("motion-026 hops the avatar over the title and keeps both layout endpoints", () => {
    // Endpoints are the original hero and row layouts (lift exactly 0).
    expect(layoutAt(0).avatarY).toBe(108);
    expect(layoutAt(6).avatarY).toBe(123);
    expect(layoutAt(0).avatarX).toBe(520);
    expect(layoutAt(6).avatarX).toBe(72);
    let peak = 0;
    for (let frame = 1; frame < 150; frame++) {
      const t = 1 + frame * 0.01;
      const L = layoutAt(t);
      const p = motionProgress(t, 1, 2.5);
      const straight = 108 + (123 - 108) * p;
      peak = Math.max(peak, straight - L.avatarY);
      // Conservative "hello" box: 2.5 em wide, cap top at 0.75 em above the baseline.
      const textLeft = L.textX,
        textRight = L.textX + 2.5 * L.size,
        textTop = L.textY - 0.75 * L.size,
        textBottom = L.textY + 2;
      const overlapsX = L.avatarX + L.avatarR > textLeft && L.avatarX - L.avatarR < textRight;
      const overlapsY = L.avatarY + L.avatarR > textTop && L.avatarY - L.avatarR < textBottom;
      expect(overlapsX && overlapsY, `avatar crosses the title at ${t.toFixed(2)}s`).toBe(false);
    }
    expect(peak).toBeGreaterThan(AVATAR_HOP * 0.95);
    expect(peak).toBeLessThanOrEqual(AVATAR_HOP);
  });

  it("motion-029 keeps the drawing and gives the annotation a draw-hold-straighten-retract life", () => {
    // Draw: head hidden until the shaft is complete, shown from that instant.
    expect(annotationState(ANNOTATION.draw.end - 0.02).head).toBe(false);
    expect(annotationState(ANNOTATION.draw.end).head).toBe(true);
    expect(annotationState(ANNOTATION.hold.start + 0.05).head).toBe(true);
    // Straighten ends at the same instant the retract starts.
    expect(ANNOTATION.straighten.end).toBe(ANNOTATION.retract.start);
    const before = annotationState(ANNOTATION.straighten.end - 0.01);
    expect(before.head).toBe(true);
    expect(before.hook).toBeGreaterThan(0);
    expect(before.from).toBe(0);
    // At the boundary the stroke is fully straight and the head is already hidden
    // (endpoint rule: hidden from the first retract frame), but nothing has retracted yet.
    const at = annotationState(ANNOTATION.retract.start);
    expect(at).toEqual({ from: 0, to: 1, hook: 0, head: false });
    const after = annotationState(ANNOTATION.retract.start + 0.05);
    expect(after.head).toBe(false);
    expect(after.hook).toBe(0);
    expect(after.from).toBeGreaterThan(0);
    expect(annotationState(6).from).toBe(1);
    const final = drawCommands("motion-029", 6);
    expect(final).toContainEqual(["fillText", "— morning ridge", 556, 296]);
    expect(final).toContainEqual(["lineTo", 550, 262]);
    seekStable("motion-029", [4.3, 4.6, 4.9, 5.25, 5.5, 6]);
  });
});
