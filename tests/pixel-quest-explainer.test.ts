import vm from "node:vm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chroma from "chroma-js";
import { gsap } from "gsap";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { MotionPatternSchema } from "../src/shared/contracts";
import { technologyPool } from "../src/shared/technology-pool";
import { loadCatalog } from "../src/server/catalog/catalog";
import { catalogRoot } from "../src/server/runtime/config";
import { validateExamplePalette, validateExampleSvg } from "../src/server/catalog/style-examples";
import { drawMotionPreview, supportedMotionIds } from "../src/client/motion-drawing";
import {
  ARRIVALS,
  C as laneColors,
  EXIT_DURATION,
  EXIT_STEP_PX,
  INITIAL,
  LANE_COUNT,
  LAYOUT,
  TICKS,
  refillState,
  snapshot,
  stepAt,
  tickTime,
  visibleCells,
} from "../src/client/motion-previews/motion-049";
import {
  GLYPH_CHARACTERS,
  INVENTORY_SLOTS,
  PIXEL_QUEST_COMPOSITION_ID,
  PIXEL_QUEST_FPS,
  PIXEL_QUEST_FRAMES,
  PX,
  pixelQuestFrame,
  arrowDotCounts,
  bitmapPath,
  pixelQuestColors,
  pixelQuestCopy,
  pixelQuestCues,
  pixelQuestPatch,
  pixelQuestPreviewHtml,
  pixelQuestPreviewSvg,
  pixelQuestState,
  pixelQuestSummary,
  questConcepts,
  resolvedConcepts,
  sprites,
  textWidth,
  wipePath,
} from "../scripts/generate-pixel-quest-preview";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewFile = "assets/catalog/reviews/pixel-quest-explainer.json";
const STYLE_ID = "style-141";
const MOTION_ID = "motion-049";
// Generic checks: no CJK script characters or CJK/full-width punctuation, and no private paths.
const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303F\uFF00-\uFFEF]/u;
const PRIVATE_PATH = /\/Users\/|\/home\/[a-z]|[A-Za-z]:\\Users\\|\bDownloads\b|file:\/\//;
const frameTimes = Array.from(
  { length: PIXEL_QUEST_FRAMES },
  (_, frame) => frame / PIXEL_QUEST_FPS,
);

type Command = [string, ...unknown[]];
function drawCommands(id: string, time: number) {
  const commands: Command[] = [];
  const context = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args: unknown[]) =>
          commands.push([String(name), ...args]),
      set: (_, name, value) => {
        commands.push([String(name), value]);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  drawMotionPreview(context, id, time);
  return commands;
}
const named = (commands: Command[], name: string) => commands.filter((c) => c[0] === name);

describe("Pixel RPG Quest Explainer catalog entry", () => {
  it("adds one complete authored style-141 with separate renderer, motion and pipeline roles", async () => {
    const catalog = await loadCatalog();
    expect(catalog.styles).toHaveLength(141);
    expect(catalog.styles.at(-1)!.id).toBe(STYLE_ID);
    const style = catalog.styles.find((s) => s.id === STYLE_ID)!;
    expect(style.name_en).toBe("Pixel RPG Quest Explainer");
    expect(style.provenance).toBe("authored");
    expect(style.tech.style_renderer.recommended_stack_refs).toEqual([
      "SVG",
      "HTML/CSS",
      "Canvas 2D",
    ]);
    expect(style.tech.motion_engine.recommended_stack_refs).toEqual(["GSAP"]);
    const tools = style.tech.recommended_stack.map((tool) => tool.name);
    for (const ref of [
      ...style.tech.style_renderer.recommended_stack_refs,
      ...style.tech.motion_engine.recommended_stack_refs,
    ])
      expect(tools).toContain(ref);
    expect(tools).not.toContain("HyperFrames");
    expect(style.tech.render_pipeline).toContain("project's renderer setting");
    const original = catalog.originalStyles.find((s) => s.id === STYLE_ID)!;
    const stack = (
      original.tech as { recommended_stack: { name: string; production_roles: string[] }[] }
    ).recommended_stack;
    expect(
      stack.filter((tool) => tool.production_roles.includes("render_pipeline")).map((t) => t.name),
    ).toEqual(["HyperFrames", "Remotion"]);
    // Only existing technology keys; no new packages.
    const raw = JSON.parse(
      await readFile(path.join(catalogRoot, "video-style-catalog.json"), "utf8"),
    );
    const entry = raw.styles.find((s: { id: string }) => s.id === STYLE_ID);
    for (const key of entry.tech.recommended_stack_keys) expect(technologyPool).toHaveProperty(key);
    expect(style.executable_prompt_template).toContain("{{render_pipeline}}");
    expect(style.executable_prompt_template).toContain(style.visual_cues);
    expect(style.executable_prompt_template).toContain(style.tech.implementation);
    expect(
      style.suggested_combinations!.suggestions.map((s) => s.supporting_styles[0].style_id),
    ).toEqual(["style-057", "style-097"]);
    expect(Object.keys(entry)).toEqual(
      Object.keys(raw.styles.find((s: { id: string }) => s.id === "style-140")),
    );
  });

  it("defines the progression grammar separately from optional motifs and states its novelty", async () => {
    const style = (await loadCatalog()).styles.find((s) => s.id === STYLE_ID)!;
    for (const phrase of [
      "game-progression UI is the narrative scaffold",
      "collectible counter that only ever rises across the film",
      "never changed on a visible event",
      "map cards arrive with cleared segments already drawn",
      "runtime progress bar",
      "quest-map card",
      "cumulative skill-inventory recap",
      "unfinished slots left visibly empty",
      "pixel dialogue plates",
      "original pixel guide",
      "dark charcoal-navy surface with a faint pixel grid",
      "warm cream paper surface",
      "Optional motifs",
      "Topic, layout, chapter count and colours adapt to each production",
    ])
      expect(style.visual_cues).toContain(phrase);
    expect(style.tech.implementation).toContain("derive every progress value from that list");
    expect(style.tech.implementation).toContain("never animate HUD numbers decoratively");
    expect(style.tech.implementation).toContain("Arrowheads stay hidden until their shafts arrive");
    expect(style.note).toContain("claude-opus-5-5");
    expect(style.note).toContain("Pixel Art (style-057), which covers pixel rendering only");
    expect(style.note).toContain("not measured source hex");
    expect(style.note).toContain(reviewFile);
  });

  it("keeps a scene-dependent palette whose recorded contrast ratios are true", async () => {
    const style = (await loadCatalog()).styles.find((s) => s.id === STYLE_ID)!;
    const palette = style.palette as typeof style.palette & {
      contrast_checks: {
        suggested_text_pairs: {
          background_token: string;
          foreground_token: string;
          contrast_ratio: number;
          meets_normal_text_target: boolean;
          use: string;
        }[];
      };
      gradient: { enabled: boolean };
    };
    expect(palette.background_policy).toBe("scene_dependent");
    expect(palette.gradient.enabled).toBe(false);
    for (const [role, hex] of Object.entries(pixelQuestColors))
      if (role !== "cream") expect(palette.tokens[role], role).toBe(hex);
    expect(palette.tokens.foreground).toBe(pixelQuestColors.cream);
    const pairs = palette.contrast_checks.suggested_text_pairs;
    expect(pairs.length).toBeGreaterThanOrEqual(6);
    for (const pair of pairs) {
      const actual = chroma.contrast(
        palette.tokens[pair.background_token],
        palette.tokens[pair.foreground_token],
      );
      expect(pair.contrast_ratio).toBeCloseTo(actual, 1);
      expect(pair.meets_normal_text_target).toBe(actual >= 4.5);
      if (!pair.meets_normal_text_target) expect(pair.use).toContain("not for text");
    }
    expect(palette.constraints.join(" ")).toContain("not for text");
  });

  it("links only existing motions, and the new motion only from reviewed compatible styles", async () => {
    const catalog = await loadCatalog();
    const ids = new Set(catalog.motions.map((m) => m.id));
    const style = catalog.styles.find((s) => s.id === STYLE_ID)!;
    expect(style.motion_references.candidates.map((c) => c.motion_id)).toEqual([
      "motion-030",
      "motion-022",
      MOTION_ID,
      "motion-027",
    ]);
    for (const candidate of style.motion_references.candidates) {
      expect(ids.has(candidate.motion_id)).toBe(true);
      expect(candidate.review_evidence).toBe(reviewFile);
      expect(candidate.usage_guidance.length).toBeGreaterThan(80);
    }
    const names = Object.fromEntries(catalog.motions.map((m) => [m.id, m.name]));
    expect(names["motion-030"]).toBe("Data Build");
    expect(names["motion-022"]).toBe("Terminal Typing");
    expect(names["motion-027"]).toBe("Elastic Arrival");
    const attached = catalog.styles
      .filter((s) => s.motion_references.candidates.some((c) => c.motion_id === MOTION_ID))
      .map((s) => s.id);
    expect(attached).toEqual(["style-097", STYLE_ID]);
    const review = JSON.parse(await readFile(path.join(root, reviewFile), "utf8"));
    const links = review.motion_graphic_links as { style_id: string; motion_id: string }[];
    expect(
      links
        .filter((l) => l.motion_id === MOTION_ID)
        .map((l) => l.style_id)
        .sort(),
    ).toEqual(attached);
    for (const link of links) {
      const candidate = catalog.styles
        .find((s) => s.id === link.style_id)!
        .motion_references.candidates.find((c) => c.motion_id === link.motion_id)!;
      expect(candidate.review_evidence, `${link.style_id}/${link.motion_id}`).toBe(reviewFile);
    }
  });

  it("adds one complete motion entry with honest frame-analysis provenance", async () => {
    const catalog = await loadCatalog();
    const raw = JSON.parse(
      await readFile(path.join(catalogRoot, "motion-pattern-catalog.json"), "utf8"),
    );
    expect(raw.metadata.pattern_count).toBe(49);
    expect(raw.patterns).toHaveLength(49);
    expect(catalog.motions.at(-1)!.id).toBe(MOTION_ID);
    const entry = raw.patterns.find((p: { id: string }) => p.id === MOTION_ID);
    const template = Object.keys(raw.patterns.find((p: { id: string }) => p.id === "motion-048"));
    // The source file hash is unknown to this analysis, so it is omitted rather than invented.
    expect(Object.keys(entry)).toEqual(template);
    const motion = MotionPatternSchema.parse(entry);
    expect(motion.name).toBe("Step-Tick Slot Refill");
    expect(motion.executable_prompt_template).toContain("{{render_pipeline}}");
    expect(motion.compatibility.good_fit).toContain("Pixel RPG Quest Explainer");
    const poolNames = new Set(Object.values(technologyPool).map((t) => t.name));
    for (const library of motion.tech.suggested_libraries)
      expect(poolNames).toContain(library.name);
    expect(entry.source_evidence).toMatchObject({
      source_kind: "frame_analysis",
      time_window_seconds: [412, 418],
      exact_hex_from_source: false,
      review_model: "claude-opus-5-5",
    });
    expect(entry.source_evidence.source_sha256).toBeUndefined();
    expect(entry.source_evidence.review_session_id ?? "").toBe("");
    for (const second of entry.source_evidence.evidence_seconds) {
      expect(second).toBeGreaterThanOrEqual(412);
      expect(second).toBeLessThanOrEqual(418);
    }
    expect(supportedMotionIds).toContain(MOTION_ID);
  });

  it("records rejected candidates and verified SDK session provenance", async () => {
    const review = JSON.parse(await readFile(path.join(root, reviewFile), "utf8"));
    expect(review.kind).toBe("frame_analysis_additions");
    expect(review.additions.map((a: { id: string }) => a.id)).toEqual([STYLE_ID, MOTION_ID]);
    expect(review.analysis_provenance.model).toBe("claude-opus-5-5");
    expect(review.analysis_provenance.session_id).toEqual(
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
    expect(review.implementation_provenance.session_id).toEqual(
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
    const rejected = review.rejected_candidates.map((c: { name: string }) => c.name);
    for (const name of [
      "World-Map Stage Advance",
      "Skill Slot Unlock Recap",
      "Table-Indirection Lookup",
    ])
      expect(rejected).toContain(name);
    expect(
      review.rejected_candidates.find((c: { name: string }) => c.name === "World-Map Stage Advance")
        .reason,
    ).toContain("no path fill or travelling marker");
    expect(review.visual_review.status).toBe("host_verified");
  });

  it("states observed source facts truthfully and keeps authored choices labelled", async () => {
    const review = JSON.parse(await readFile(path.join(root, reviewFile), "utf8"));
    const motions = JSON.parse(
      await readFile(path.join(catalogRoot, "motion-pattern-catalog.json"), "utf8"),
    );
    const styles = JSON.parse(
      await readFile(path.join(catalogRoot, "video-style-catalog.json"), "utf8"),
    );
    const motion = motions.patterns.find((p: { id: string }) => p.id === MOTION_ID);
    const style = styles.styles.find((s: { id: string }) => s.id === STYLE_ID);
    // 35 overview timestamps and six dense windows, everywhere the counts appear.
    for (const text of [
      review.analysis_provenance.sampling,
      motion.source_evidence.sampling,
      style.note,
    ]) {
      expect(text).toMatch(/35 overview timestamps/);
      expect(text).not.toMatch(/\b34\b/);
    }
    expect(review.dense_findings).toHaveLength(6);
    // The right-edge icons are finished requests exiting; the source shows no waiting queue.
    const motionText = JSON.stringify(motion);
    expect(motionText).not.toMatch(
      /park|waiting icon|queue head|head of (a|the) (waiting )?queue/i,
    );
    expect(motionText).toMatch(/exits? (to the )?right/);
    expect(motion.source_evidence.limitations.join(" ")).toMatch(/no waiting queue/i);
    const lanes = review.dense_findings.find(
      (w: { window_seconds: number[] }) => w.window_seconds[0] === 412,
    ).observation;
    expect(lanes).toMatch(/exiting, not waiting arrivals/);
    expect(lanes).not.toMatch(/park/);
    // The counter rise is never claimed as synced to on-screen events.
    const styleText = JSON.stringify(style);
    expect(styleText).not.toMatch(/increments only when a concept/);
    expect(styleText).not.toMatch(/counter equals the number of concepts/);
    expect(styleText).toMatch(/never changed on a visible event/);
    expect(review.analysis_provenance.limitations.join(" ")).toMatch(/x09.*x04/);
    expect(review.previews.motion_graphic.sequence).toMatch(/authored preview choice/);
    // Concrete rejection rationale for the candidates not added as motions.
    const reason = (name: string) =>
      review.rejected_candidates.find((c: { name: string }) => c.name === name)?.reason ?? "";
    expect(reason("Table-Indirection Lookup")).toMatch(/motion-030[\s\S]*motion-026/);
    expect(reason("Diamond-Lattice Pixel Wipe")).toMatch(/motion-012[\s\S]*motion-048/);
    expect(reason("Slot refill with a visible waiting queue")).toMatch(/finished requests exiting/);
    expect(reason("HUD counter synchronised to concept unlocks")).toMatch(/x09/);
    expect(review.additions.map((a: { id: string }) => a.id)).toEqual([STYLE_ID, MOTION_ID]);
    expect(review.implementation_provenance.author).toMatch(/Claude Opus 5\.5 \(claude-opus-5-5\)/);
  });

  it("never copies source branding, local paths or CJK text into the new artifacts", async () => {
    const styles = JSON.parse(
      await readFile(path.join(catalogRoot, "video-style-catalog.json"), "utf8"),
    );
    const motions = JSON.parse(
      await readFile(path.join(catalogRoot, "motion-pattern-catalog.json"), "utf8"),
    );
    const artifacts = [
      JSON.stringify(styles.styles.find((s: { id: string }) => s.id === STYLE_ID)),
      JSON.stringify(motions.patterns.find((p: { id: string }) => p.id === MOTION_ID)),
      await readFile(path.join(root, reviewFile), "utf8"),
      pixelQuestPreviewSvg(),
      pixelQuestPreviewHtml(),
      JSON.stringify(pixelQuestSummary),
    ];
    for (const text of artifacts) {
      expect(text).not.toMatch(CJK);
      expect(text).not.toMatch(PRIVATE_PATH);
    }
  });
});

describe("Pixel quest preview state and progression semantics", () => {
  it("drives counter and inventory from the ordered concept list, changing together only on resolve", () => {
    const resolveFrame = Math.ceil(pixelQuestCues.resolve * PIXEL_QUEST_FPS - 1e-6);
    let previous = pixelQuestState(0);
    expect(previous.counter).toBe(2);
    const changes: number[] = [];
    for (let frame = 0; frame < PIXEL_QUEST_FRAMES; frame++) {
      const state = pixelQuestState(frame / PIXEL_QUEST_FPS);
      expect(state.counter).toBe(resolvedConcepts(state.time));
      expect(state.skillsUnlocked).toBe(state.counter);
      expect(state.counter).toBeGreaterThanOrEqual(previous.counter);
      expect(state.skillsUnlocked).toBeLessThanOrEqual(INVENTORY_SLOTS);
      if (state.counter !== previous.counter) changes.push(frame);
      // The concept resolves only after its result is visible on screen.
      if (state.counter === 3) expect(state.found && state.bucket === "filled").toBe(true);
      previous = state;
    }
    expect(changes).toEqual([resolveFrame]);
    expect(pixelQuestState(3).counter).toBe(questConcepts.length);
    // The patch shows the matching counter digits, slot and slot count at every frame.
    for (const t of [0, 2.05, 2.1, 3]) {
      const state = pixelQuestState(t);
      const patch = pixelQuestPatch(state);
      expect(patch["pq-skill-3"].display).toBe(state.counter >= 3 ? "inline" : "none");
      expect(patch["pq-skill-3-empty"].display).toBe(state.counter >= 3 ? "none" : "inline");
      expect(patch["pq-counter"].d).toBe(
        bitmapPath(`x${String(state.counter).padStart(2, "0")}`, 1068, 32),
      );
    }
    // Unlock reactions are single brief events tied to the same resolve moment.
    const flashFrames = frameTimes.filter((t) => pixelQuestState(t).unlockFlash);
    expect(flashFrames[0]).toBeCloseTo(pixelQuestCues.resolve, 5);
    expect(flashFrames.length).toBeLessThanOrEqual(4);
    expect(frameTimes.find((t) => pixelQuestState(t).guideCheer)).toBeCloseTo(
      pixelQuestCues.resolve,
      5,
    );
  });

  it("builds nodes before connectors and hides arrowheads until each shaft arrives", () => {
    for (const t of frameTimes) {
      const state = pixelQuestState(t);
      expect(state.head1).toBe(state.arrow1 === arrowDotCounts.arrow1);
      expect(state.head2).toBe(state.arrow2 === arrowDotCounts.arrow2);
      if (state.hashOutput) expect(state.head1).toBe(true);
      if (state.arrow2 > 0) expect(state.hashOutput).toBe(true);
      if (state.bucket !== "idle") expect(state.head2).toBe(true);
      if (state.found) expect(state.bucket).toBe("filled");
    }
    const start = pixelQuestState(pixelQuestCues.wipe.mid);
    expect(start.scene).toBe("lookup");
    expect([start.arrow1, start.arrow2, start.head1, start.head2]).toEqual([0, 0, false, false]);
    const html = pixelQuestPreviewHtml();
    expect(html).toContain('data-arrowhead-for="pq-arrow1-shaft"');
    expect(html).toContain('data-arrowhead-for="pq-arrow2-shaft"');
  });

  it("types captions into pre-sized plates and holds them fully readable", () => {
    const { captionMap, captionLookup } = pixelQuestCopy;
    let lastMap = 0;
    let lastLookup = 0;
    for (const t of frameTimes) {
      const state = pixelQuestState(t);
      expect(state.captionMap).toBeGreaterThanOrEqual(lastMap);
      expect(state.captionLookup).toBeGreaterThanOrEqual(lastLookup);
      lastMap = state.captionMap;
      lastLookup = state.captionLookup;
      const patch = pixelQuestPatch(state);
      expect(Number(patch["pq-cap-lookup-reveal"].width)).toBeLessThanOrEqual(
        textWidth(captionLookup.text) + PX,
      );
    }
    // Settled reading holds after typing (seconds).
    expect(pixelQuestCues.wipe.start - pixelQuestCues.captionMap.end).toBeGreaterThanOrEqual(0.6);
    expect(3 - pixelQuestCues.captionLookup.end).toBeGreaterThanOrEqual(1);
    expect(pixelQuestState(1).captionMap).toBe(captionMap.text.length);
    expect(pixelQuestState(3).captionLookup).toBe(captionLookup.text.length);
    expect(pixelQuestPatch(pixelQuestState(3))["pq-cap-lookup-cursor"].display).toBe("none");
  });

  it("uses English-only copy that the bitmap font can render", () => {
    const strings = JSON.stringify(pixelQuestCopy).match(/"[^"]*"/g)!;
    for (const value of [
      ...Object.values(pixelQuestCopy).flatMap((v) =>
        typeof v === "string" ? [v] : Array.isArray(v) ? v : Object.values(v),
      ),
      ...questConcepts.map((c) => c.skill),
    ]) {
      expect(value).toMatch(/^[\x20-\x7E]+$/);
      for (const character of value) expect(GLYPH_CHARACTERS).toContain(character);
    }
    expect(strings.length).toBeGreaterThan(10);
  });
});

describe("Pixel quest preview SVG", () => {
  it("is a valid, script-free, raster-free 1280×720 SVG accepted by the publishing helpers", async () => {
    const style = (await loadCatalog()).styles.find((s) => s.id === STYLE_ID)!;
    for (const t of [0, 0.6, 1.2, 1.3, 2.15, 3]) {
      const svg = pixelQuestPreviewSvg(t);
      expect(() => validateExampleSvg(svg)).not.toThrow();
      expect(svg.length).toBeLessThan(150000);
      expect(svg).not.toMatch(/<(script|image|foreignObject|text)\b/);
      expect(svg).toContain('shape-rendering="crispEdges"');
    }
    await validateExamplePalette(pixelQuestPreviewSvg(), style);
  });

  it("places every rectangle and path vertex on the 4 px logical grid", () => {
    for (const t of [0.6, 1.2, 1.25, 1.3, 2.15, 3]) {
      const document = new DOMParser().parseFromString(pixelQuestPreviewSvg(t), "image/svg+xml");
      const off: string[] = [];
      for (const rect of Array.from(document.getElementsByTagName("rect")))
        for (const key of ["x", "y", "width", "height"]) {
          const value = rect.getAttribute(key);
          if (value && Number(value) % PX !== 0) off.push(`rect ${key}=${value}`);
        }
      for (const pathElement of Array.from(document.getElementsByTagName("path")))
        for (const number of (pathElement.getAttribute("d") || "").match(/-?\d+(\.\d+)?/g) || [])
          if (Number(number) % PX !== 0) off.push(`path ${number}`);
      expect(off, `t=${t}`).toEqual([]);
    }
    expect(wipePath(pixelQuestCues.wipe.mid - 0.01).length).toBeGreaterThan(1000);
    expect(wipePath(0.5)).toBe("M0 0");
  });

  it("builds every sprite as rectangular rows and draws the guide in two consistent poses", () => {
    for (const [name, map] of Object.entries(sprites)) {
      expect(new Set(map.map((row) => row.length)).size, name).toBe(1);
      expect(map.join("")).toMatch(/^[.kcoyrgtsG]+$/);
    }
    expect(sprites.guideIdle[0].length).toBe(sprites.guideCheer[0].length);
    expect(sprites.guideIdle.length).toBe(sprites.guideCheer.length);
  });

  it("keeps the map and lookup scenes exclusive so hidden-scene parts never leak", () => {
    for (const t of frameTimes) {
      const patch = pixelQuestPatch(pixelQuestState(t));
      expect([patch["pq-scene-map"].display, patch["pq-scene-lookup"].display].sort()).toEqual([
        "inline",
        "none",
      ]);
      for (const values of Object.values(patch)) expect(values).not.toHaveProperty("visibility");
    }
  });
});

/** Run the composition script against a real XML DOM of its actual SVG markup. */
function runComposition(html: string) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const markup = html.slice(html.indexOf("<svg"), html.indexOf("</svg>") + 6);
  const document = new DOMParser().parseFromString(markup, "image/svg+xml");
  const listeners: { target: string; type: string; fn: (event: unknown) => void }[] = [];
  const window = {
    __timelines: undefined as Record<string, gsap.core.Timeline> | undefined,
    addEventListener: (type: string, fn: (event: unknown) => void) =>
      listeners.push({ target: "window", type, fn }),
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      const index = listeners.findIndex((entry) => entry.type === type && entry.fn === fn);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  vm.runInNewContext(script, { gsap, document, window, Math });
  const timeline = window.__timelines![PIXEL_QUEST_COMPOSITION_ID];
  const serialize = () => new XMLSerializer().serializeToString(document);
  return {
    document,
    timeline,
    listeners,
    snapshot: (time: number) => {
      timeline.seek(time, false);
      return serialize();
    },
    hfSeek: (time: number) => {
      for (const entry of listeners.filter((e) => e.type === "hf-seek"))
        entry.fn({ detail: { time } });
      return serialize();
    },
  };
}

describe("Pixel quest HyperFrames composition", () => {
  it("follows the HyperFrames contract with one paused timeline and no clocks or network", () => {
    const html = pixelQuestPreviewHtml();
    expect(html).toContain(`data-composition-id="${PIXEL_QUEST_COMPOSITION_ID}"`);
    expect(html).toContain('data-duration="3"');
    expect(html).toContain('<script src="gsap.min.js"></script>');
    expect(html.match(/gsap\.timeline\(/g)).toHaveLength(1);
    expect(html).toContain("paused:true");
    expect(html).toContain(`window.__timelines={'${PIXEL_QUEST_COMPOSITION_ID}':tl}`);
    expect(html.match(/addEventListener\('hf-seek'/g)).toHaveLength(1);
    expect(html).toContain(pixelQuestPreviewSvg(0));
    expect(html).not.toContain("@font-face");
    for (const banned of [
      "Math.random",
      "Date.now",
      "performance.now",
      "requestAnimationFrame",
      "setInterval",
      "setTimeout",
      "http",
      "<img",
    ])
      expect(html.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toContain(banned);
  });

  it("reproduces identical DOM states for forward, backward, hf-seek and fresh direct seeks", () => {
    const html = pixelQuestPreviewHtml();
    const times = Array.from({ length: 91 }, (_, frame) => frame / 30);
    const live = runComposition(html);
    const forward = times.map(live.snapshot);
    const backward = [...times].reverse().map(live.snapshot).reverse();
    expect(backward).toEqual(forward);
    for (const index of [0, 3, 15, 36, 38, 45, 57, 63, 64, 75, 90]) {
      const fresh = runComposition(html);
      expect(fresh.snapshot(times[index]), `t=${times[index]}`).toBe(forward[index]);
      const evented = runComposition(html);
      expect(evented.hfSeek(times[index])).toBe(forward[index]);
      // The composition holds its last encoded frame (89) at t = 3.
      const expected = pixelQuestPatch(
        pixelQuestState(pixelQuestFrame(times[index]) / PIXEL_QUEST_FPS),
      );
      for (const [id, values] of Object.entries(expected)) {
        const element = fresh.document.getElementById(id)!;
        expect(element, id).toBeTruthy();
        for (const [key, value] of Object.entries(values))
          expect(element.getAttribute(key), `${id}.${key}`).toBe(value);
      }
    }
    expect(new Set(forward).size).toBeGreaterThan(35);
  });

  it("gives every element a unique ID and removes its hf-seek listener on page exit", () => {
    const html = pixelQuestPreviewHtml();
    const markup = html.slice(html.indexOf("<svg"), html.indexOf("</svg>") + 6);
    const ids = Array.from(
      new DOMParser().parseFromString(markup, "image/svg+xml").getElementsByTagName("*"),
    )
      .map((element) => element.getAttribute("id"))
      .filter(Boolean);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    const live = runComposition(html);
    live.listeners.find((entry) => entry.type === "pagehide")!.fn({});
    expect(live.listeners.filter((entry) => entry.type === "hf-seek")).toHaveLength(0);
  });
});

describe("motion-049 step-tick slot refill", () => {
  const texts = (t: number) => named(drawCommands(MOTION_ID, t), "fillText").map((c) => c[1]);

  it("advances active lanes one token per tick, then clears and replaces finished lanes in place", () => {
    expect(ARRIVALS.every((item) => item.length >= 2)).toBe(true);
    let finishes = 0;
    let replacements = 0;
    for (let step = 1; step <= TICKS.count; step++) {
      const before = snapshot(step - 1);
      const after = snapshot(step);
      expect(after.lanes).toHaveLength(LANE_COUNT);
      let taken = before.arrived;
      after.lanes.forEach((lane, index) => {
        const prior = before.lanes[index];
        if (prior.phase === "running" || prior.phase === "entered") {
          // Same request, one more token; it finishes on the tick it reaches its length.
          expect(lane.item).toBe(prior.item);
          expect(lane.progress).toBe(prior.progress + 1);
          expect(lane.phase).toBe(lane.progress === lane.item!.length ? "done" : "running");
          if (lane.phase === "done") finishes++;
        }
        if (prior.phase === "done") {
          // The next authored request takes the cleared lane on the next tick, with one token.
          expect(lane.item).toBe(ARRIVALS[taken] ?? null);
          if (ARRIVALS[taken]) expect([lane.progress, lane.phase]).toEqual([1, "entered"]);
          taken++;
          replacements++;
        }
      });
      expect(after.arrived).toBe(Math.min(taken, ARRIVALS.length));
      expect(after.served - before.served).toBe(
        after.lanes.filter((lane) => lane.phase === "done").length,
      );
    }
    expect(snapshot(0).lanes.map((lane) => lane.item!.id)).toEqual(INITIAL.map((i) => i.item.id));
    expect(finishes).toBeGreaterThanOrEqual(8);
    expect(replacements).toBeGreaterThanOrEqual(8);
    // Several lanes can finish on the same step, as observed.
    const together = Array.from({ length: TICKS.count }, (_, s) => snapshot(s + 1)).some(
      (snap) => snap.lanes.filter((lane) => lane.phase === "done").length >= 2,
    );
    expect(together).toBe(true);
    expect(snapshot(TICKS.count).lanes.every((lane) => lane.phase !== "done")).toBe(true);
  });

  it("clears the finished strip and moves its icon right out of frame before the next tick", () => {
    let checked = 0;
    for (let step = 1; step <= TICKS.count; step++) {
      const tick = tickTime(step);
      const at = refillState(tick);
      at.lanes.forEach((lane, index) => {
        if (lane.phase !== "done") {
          expect(at.exiting[index]).toBeNull();
          return;
        }
        checked++;
        expect(visibleCells(at, index)).toBe(0);
        const xs = Array.from(
          { length: 16 },
          (_, k) => refillState(tick + (k / 16) * EXIT_DURATION).exiting[index],
        );
        expect(xs[0]).toBe(LAYOUT.tokenX);
        for (let k = 1; k < xs.length; k++) expect(xs[k]!).toBeGreaterThanOrEqual(xs[k - 1]!);
        for (const x of xs) expect(x! % EXIT_STEP_PX).toBe(0);
        expect(xs.at(-1)!).toBeGreaterThan(LAYOUT.laneX + LAYOUT.laneW);
        // Gone (out of frame) well before the next tick; the lane still reads as cleared.
        const after = refillState(tick + EXIT_DURATION + 1e-6);
        expect(after.exiting[index]).toBeNull();
        expect(visibleCells(after, index)).toBe(0);
        expect(EXIT_DURATION).toBeLessThan(TICKS.interval);
        // Next tick: a new request sits in the same lane with its first token, no travel.
        if (step < TICKS.count) {
          const next = refillState(tickTime(step + 1));
          expect(next.lanes[index].item).not.toBe(lane.item);
          expect(visibleCells(next, index)).toBe(1);
          expect(next.exiting[index]).toBeNull();
        }
      });
    }
    expect(checked).toBeGreaterThanOrEqual(8);
    // The exit reaches beyond the 640 px frame, so the icon visibly leaves.
    expect(LAYOUT.exitEndX).toBeGreaterThan(640);
  });

  it("changes STEP and tokens only on ticks and never draws a waiting queue", () => {
    expect(stepAt(TICKS.first - 0.001)).toBe(0);
    expect(stepAt(TICKS.first)).toBe(1);
    expect(stepAt(6)).toBe(TICKS.count);
    const step3 = tickTime(3);
    expect(texts(step3 - 0.01)).toContain("STEP 02");
    expect(texts(step3)).toContain("STEP 03");
    const cells = (t: number) =>
      refillState(t).lanes.map((_, lane) => visibleCells(refillState(t), lane));
    expect(cells(step3 + 0.01)).toEqual(cells(step3 + TICKS.interval - 0.01));
    const frames = Array.from({ length: 73 }, (_, i) => i / 12);
    for (const t of frames) {
      const state = refillState(t);
      const drawnIds = new Set(state.lanes.map((lane) => lane.item?.id));
      // Every drawn request letter belongs to a lane: nothing waits off to the side.
      for (const text of texts(t))
        if (/^[A-Z]$/.test(String(text))) expect(drawnIds.has(String(text))).toBe(true);
      expect(texts(t).join(" ")).not.toMatch(/QUEUE|WAIT/);
      // Upcoming requests are never visible before they take a lane.
      for (const item of ARRIVALS.slice(state.arrived)) expect(texts(t)).not.toContain(item.id);
    }
  });

  it("sets one explicit light colour for every lane label with readable contrast", () => {
    for (const t of [0.3, 1.45, 2.25, 2.5, 2.65, 5]) {
      const commands = drawCommands(MOTION_ID, t);
      for (let lane = 1; lane <= LANE_COUNT; lane++) {
        const at = commands.findIndex((c) => c[0] === "fillText" && c[1] === `SLOT ${lane}`);
        expect(at).toBeGreaterThan(0);
        const style = commands
          .slice(0, at)
          .reverse()
          .find((c) => c[0] === "fillStyle")!;
        expect(style[1], `t=${t} SLOT ${lane}`).toBe(laneColors.label);
      }
    }
    expect(chroma.contrast(laneColors.label, laneColors.ground)).toBeGreaterThanOrEqual(7);
    expect(chroma.contrast(laneColors.cream, laneColors.doneLane)).toBeGreaterThanOrEqual(4.5);
    expect(chroma.contrast(laneColors.label, laneColors.ground)).toBeGreaterThan(
      chroma.contrast(laneColors.muted, laneColors.ground),
    );
  });

  it("uses English-only drawn copy and reproduces frames for any seek order", () => {
    const frames = Array.from({ length: 73 }, (_, i) => i / 12);
    for (const t of frames)
      for (const text of texts(t)) {
        expect(String(text)).toMatch(/^[\x20-\x7E]+$/);
        expect(String(text)).not.toMatch(CJK);
      }
    const forward = frames.map((t) => JSON.stringify(drawCommands(MOTION_ID, t)));
    const backward = [...frames]
      .reverse()
      .map((t) => JSON.stringify(drawCommands(MOTION_ID, t)))
      .reverse();
    expect(backward).toEqual(forward);
    expect(JSON.stringify(drawCommands(MOTION_ID, 2.5))).toBe(forward[30]);
    // A settled reading hold after the last tick.
    expect(drawCommands(MOTION_ID, 5.2)).toEqual(drawCommands(MOTION_ID, 6));
  });
});
