import vm from "node:vm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gsap } from "gsap";
import sharp from "sharp";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { MotionPatternSchema } from "../src/shared/contracts";
import { technologyPool } from "../src/shared/technology-pool";
import { loadCatalog } from "../src/server/catalog/catalog";
import { catalogRoot } from "../src/server/runtime/config";
import { validateExamplePalette, validateExampleSvg } from "../src/server/catalog/style-examples";
import { drawMotionPreview, supportedMotionIds } from "../src/client/motion-drawing";
import {
  SONAR,
  beamContains,
  beamStrength,
  dotMatrixMix,
  outsideBrightness,
  sweepAngle,
  sweepBearing,
} from "../src/client/motion-previews/motion-047";
import {
  ASSEMBLY,
  BINARY_LAYOUT,
  DELETE,
  FRAGMENT,
  GRID,
  IMAGE,
  TARGETS,
  TARGET_CELLS,
  TILE_COUNT,
  cellState,
  deleteDuration,
  deletedCount,
  deletionEnd,
  drawIllustration,
  fragmentPose,
  loosePieces,
  selectionCell,
  tileArrival,
  tileHome,
  tilePose,
  tileSourceRect,
} from "../src/client/motion-previews/motion-048";
import {
  TERMINAL_COMPOSITION_ID,
  TERMINAL_FPS,
  TERMINAL_FRAMES,
  decodeLine,
  terminalColors,
  terminalCopy,
  terminalCues,
  terminalLyricPatch,
  terminalLyricPreviewHtml,
  terminalLyricPreviewSvg,
  terminalLyricState,
} from "../scripts/generate-terminal-lyric-anime-preview";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewFile = "assets/catalog/reviews/terminal-lyric-anime.json";
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
function recordIllustration() {
  const commands: Command[] = [];
  drawIllustration(
    new Proxy(
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
    ) as CanvasRenderingContext2D,
  );
  return commands;
}
const named = (commands: Command[], name: string) => commands.filter((c) => c[0] === name);
const frames = Array.from({ length: 73 }, (_, i) => i / 12);
// Withheld source identifiers: never copied into reusable catalog artifacts.
const forbiddenSourceText = [
  "world.execute",
  "DeepSeek",
  "鲸鱼",
  "病娇",
  "bilibili",
  "/Users/",
  "Downloads",
  "whale_chan",
];

describe("Terminal Lyric Duotone Anime catalog entry", () => {
  it("adds a complete authored style-138 with separate renderer, motion and pipeline roles", async () => {
    const catalog = await loadCatalog();
    expect(catalog.styles).toHaveLength(141);
    const style = catalog.styles.find((s) => s.id === "style-138")!;
    expect(style.name_en).toBe("Terminal Lyric Duotone Anime");
    expect(style.provenance).toBe("authored");
    expect(style.tech.style_renderer.recommended_stack_refs).toEqual([
      "HTML/CSS",
      "SVG",
      "Canvas 2D",
    ]);
    expect(style.tech.motion_engine.recommended_stack_refs).toEqual([
      "GSAP",
      "Scrambled Text Reveal",
    ]);
    const tools = style.tech.recommended_stack.map((tool) => tool.name);
    for (const ref of [
      ...style.tech.style_renderer.recommended_stack_refs,
      ...style.tech.motion_engine.recommended_stack_refs,
    ])
      expect(tools).toContain(ref);
    expect(tools).toContain("Layered Illustration PNG Assets");
    expect(tools).not.toContain("HyperFrames");
    expect(style.tech.render_pipeline).toContain("project's renderer setting");
    const original = catalog.originalStyles.find((s) => s.id === "style-138")!;
    const pipeline = (
      original.tech as { recommended_stack: { name: string; production_roles: string[] }[] }
    ).recommended_stack
      .filter((tool) => tool.production_roles.includes("render_pipeline"))
      .map((tool) => tool.name);
    expect(pipeline).toEqual(["HyperFrames", "Remotion"]);
    expect(style.executable_prompt_template).toContain("{{render_pipeline}}");
    expect(style.executable_prompt_template).toContain(style.visual_cues);
    expect(
      style.suggested_combinations!.suggestions.map((s) => s.supporting_styles[0].style_id),
    ).toEqual(["style-066", "style-098", "style-067"]);
  });

  it("states the tritone, reserved red, caption grammar and asset honesty", async () => {
    const style = (await loadCatalog()).styles.find((s) => s.id === "style-138")!;
    for (const phrase of [
      "three-ink tritone",
      "Red is a reserved accent",
      "seeded scrambled glyphs",
      "progress bar",
      "thin elliptical ring",
      "§NN section header",
    ])
      expect(style.visual_cues).toContain(phrase);
    expect(style.tech.implementation).toContain("Never claim AI-generated or reference footage");
    expect(style.tech.implementation).toContain("Do not generate character animation in code");
    expect(style.note).toContain("claude-opus-5-5");
    expect(style.note).toContain("not reproduced");
  });

  it("keeps a scene-dependent tritone palette with readable caption pairs", async () => {
    const style = (await loadCatalog()).styles.find((s) => s.id === "style-138")!;
    expect(style.palette.background_policy).toBe("scene_dependent");
    expect(style.palette.tokens).toEqual(terminalColors);
    const pairs = (
      style.palette.contrast_checks as {
        suggested_text_pairs: { contrast_ratio: number; meets_normal_text_target: boolean }[];
      }
    ).suggested_text_pairs;
    expect(pairs.length).toBeGreaterThanOrEqual(5);
    for (const pair of pairs) {
      expect(pair.contrast_ratio).toBeGreaterThanOrEqual(4.5);
      expect(pair.meets_normal_text_target).toBe(true);
    }
    expect(style.palette.constraints.join(" ")).toContain("not an additional fill ink");
  });

  it("reuses existing motions and links the new ones only from reviewed, compatible styles", async () => {
    const catalog = await loadCatalog();
    const style = catalog.styles.find((s) => s.id === "style-138")!;
    expect(style.motion_references.candidates.map((c) => c.motion_id)).toEqual([
      "motion-036",
      "motion-030",
      "motion-020",
      "motion-022",
      "motion-047",
      "motion-048",
    ]);
    const names = Object.fromEntries(catalog.motions.map((m) => [m.id, m.name]));
    expect(names["motion-036"]).toBe("Glitch Type Build");
    expect(names["motion-022"]).toBe("Terminal Typing");
    expect(names["motion-030"]).toBe("Data Build");
    const attached = (id: string) =>
      catalog.styles
        .filter((s) => s.motion_references.candidates.some((c) => c.motion_id === id))
        .map((s) => s.id);
    expect(attached("motion-047")).toEqual(["style-112", "style-138"]);
    expect(attached("motion-048")).toEqual(["style-056", "style-067", "style-138"]);
    const review = JSON.parse(await readFile(path.join(root, reviewFile), "utf8"));
    const links = review.motion_graphic_links as { style_id: string; motion_id: string }[];
    for (const motionId of ["motion-047", "motion-048"])
      expect(
        links
          .filter((l) => l.motion_id === motionId)
          .map((l) => l.style_id)
          .sort(),
      ).toEqual(attached(motionId));
    for (const link of links) {
      const candidate = catalog.styles
        .find((s) => s.id === link.style_id)!
        .motion_references.candidates.find((c) => c.motion_id === link.motion_id)!;
      expect(candidate.review_evidence, `${link.style_id}/${link.motion_id}`).toBe(reviewFile);
      expect(candidate.usage_guidance.length).toBeGreaterThan(60);
    }
  });

  it("adds two complete motion entries with honest provenance and existing technologies", async () => {
    const catalog = await loadCatalog();
    const raw = JSON.parse(
      await readFile(path.join(catalogRoot, "motion-pattern-catalog.json"), "utf8"),
    );
    expect(raw.metadata.pattern_count).toBe(49);
    // motion-049 (pixel-quest-explainer) is a later, separately reviewed addition.
    expect(
      catalog.motions
        .map((m) => m.id)
        .filter((id) => id !== "motion-049")
        .slice(-2),
    ).toEqual(["motion-047", "motion-048"]);
    const template = Object.keys(raw.patterns.find((p: { id: string }) => p.id === "motion-046"));
    const poolNames = new Set(Object.values(technologyPool).map((entry) => entry.name));
    for (const id of ["motion-047", "motion-048"]) {
      const entry = raw.patterns.find((p: { id: string }) => p.id === id);
      for (const key of template.filter((k) => k !== "variants"))
        expect(entry, `${id}.${key}`).toHaveProperty(key);
      const motion = MotionPatternSchema.parse(entry);
      expect(motion.executable_prompt_template).toContain("{{render_pipeline}}");
      expect(motion.compatibility.good_fit).toContain("Terminal Lyric Duotone Anime");
      for (const library of motion.tech.suggested_libraries)
        expect(poolNames).toContain(library.name);
      expect(entry.source_evidence).toMatchObject({
        source_kind: "frame_analysis",
        exact_hex_from_source: false,
        review_model: "claude-opus-5-5",
        review_session_id: "1a123899-b189-4855-a8af-24cc095da54b",
      });
      expect(supportedMotionIds).toContain(id);
    }
  });

  it("never copies the source title, characters, channel marks or local paths", async () => {
    const catalog = JSON.parse(
      await readFile(path.join(catalogRoot, "video-style-catalog.json"), "utf8"),
    );
    const motions = JSON.parse(
      await readFile(path.join(catalogRoot, "motion-pattern-catalog.json"), "utf8"),
    );
    const texts = [
      JSON.stringify(catalog.styles.find((s: { id: string }) => s.id === "style-138")),
      JSON.stringify(motions.patterns.slice(-2)),
      await readFile(path.join(root, reviewFile), "utf8"),
      terminalLyricPreviewSvg(),
    ];
    for (const text of texts)
      for (const forbidden of forbiddenSourceText) expect(text).not.toContain(forbidden);
  });
});

describe("Terminal Lyric Duotone Anime preview", () => {
  it("draws a safe, code-only illustrative frame that passes the palette validator", async () => {
    const style = (await loadCatalog()).styles.find((s) => s.id === "style-138")!;
    const svg = terminalLyricPreviewSvg();
    expect(() => validateExampleSvg(svg)).not.toThrow();
    await expect(validateExamplePalette(svg, style)).resolves.toBeUndefined();
    for (const forbidden of ["<image", "<img", "data:", "http", "@font-face", "@import", "<script"])
      expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toContain(forbidden);
    for (const part of [
      "tl-bust",
      "tl-ring",
      "tl-title",
      "tl-header",
      "tl-underline",
      "tl-grain",
      "tl-scan",
      "tl-vignette",
      "tl-aperture",
    ])
      expect(svg).toContain(`id="${part}"`);
    expect(svg).toContain('data-role="illustrative-subject"');
    expect(svg).toContain("ILLUSTRATIVE");
  });

  it("uses only the three inks plus signal blue, screen black and reserved red", () => {
    const allowed = new Set(Object.values(terminalColors));
    for (let frame = 0; frame < TERMINAL_FRAMES; frame += 3)
      for (const color of terminalLyricPreviewSvg(frame / TERMINAL_FPS).match(
        /#[0-9A-Fa-f]{6}\b/g,
      )!)
        expect(allowed, color).toContain(color.toUpperCase());
    const svg = terminalLyricPreviewSvg();
    const redOwners = [...svg.matchAll(/<[^>]*#F0473A[^>]*>/g)].map((m) => m[0]);
    for (const owner of redOwners)
      expect(
        owner.includes("tl-title-red") ||
          owner.includes("tl-warning") ||
          /<(rect|text) /.test(owner),
      ).toBe(true);
    // Red text appears only inside the warning group or as the transient RGB-offset copy.
    const warning = svg.slice(svg.indexOf('id="tl-warning"'));
    expect(warning.slice(0, warning.indexOf("</g>"))).toContain(terminalCopy.warning);
  });

  it("decodes captions in order into the exact copy, then holds a readable final state", () => {
    const states = Array.from({ length: TERMINAL_FRAMES }, (_, f) =>
      terminalLyricState(f / TERMINAL_FPS),
    );
    const revealed = states.map((s) => s.english.revealed);
    expect(revealed.every((count, i) => !i || count >= revealed[i - 1])).toBe(true);
    const english = terminalCopy.english.before + terminalCopy.english.keyword;
    const chinese = terminalCopy.chinese.before + terminalCopy.chinese.keyword;
    const mid = terminalLyricState(0.7).english;
    expect(mid.complete).toBe(false);
    expect(mid.text.slice(0, mid.revealed)).toBe(english.slice(0, mid.revealed));
    expect([...mid.text]).toHaveLength([...english].length);
    const final = states.filter((s) => s.english.text === english && s.chinese.text === chinese);
    expect(final.length / TERMINAL_FPS).toBeGreaterThanOrEqual(1.5);
    expect(terminalLyricState(0.7).underline).toBeGreaterThan(0);
    expect(terminalLyricState(0.7).underline).toBeLessThan(1);
    expect(terminalLyricState(2.5).underline).toBe(1);
    // Scramble glyphs are seeded: the same time always yields the same text.
    expect(decodeLine(english, 0.5, terminalCues.english, "#$%", " ", 1)).toEqual(
      decodeLine(english, 0.5, terminalCues.english, "#$%", " ", 1),
    );
  });

  it("settles the keyword title from an RGB offset into a ring before the reading hold", () => {
    const entering = terminalLyricState(1.05).title;
    expect(entering.offset).toBeGreaterThan(5);
    expect(terminalLyricState(0.5).title.visible).toBe(false);
    const settled = terminalLyricState(terminalCues.title.end + 0.05).title;
    expect(settled).toMatchObject({ offset: 0, jitter: 0, scale: 1, settled: true });
    expect(terminalLyricState(terminalCues.ring.start - 0.05).ring).toBe(0);
    expect(terminalLyricState(terminalCues.ring.end + 0.05).ring).toBe(1);
    const hold = terminalLyricPatch(terminalLyricState(2.3));
    expect(hold["tl-title-red"].opacity).toBe("0");
    expect(hold["tl-ring"]["stroke-dashoffset"]).toBe("0");
    expect(terminalLyricState(2.2).warning).toBe(false);
    expect(terminalLyricState(2.3).warning).toBe(true);
  });

  it("rasterises real frames: power-on line, opening aperture and the settled title", async () => {
    const luminance = async (time: number, x: number, y: number) => {
      const { data } = await sharp(Buffer.from(terminalLyricPreviewSvg(time)))
        .extract({ left: x, top: y, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      return (data[0] + data[1] + data[2]) / 3;
    };
    // At t=0 only the bright power line is lit across the middle; the top is black.
    expect(await luminance(0, 640, 360)).toBeGreaterThan(180);
    expect(await luminance(0, 640, 120)).toBeLessThan(20);
    // The aperture hides the face at t=0; once open, the flat cream face reads clearly.
    expect(await luminance(0, 440, 418)).toBeLessThan(20);
    expect(await luminance(2.5, 440, 418)).toBeGreaterThan(150);
  });
});

/** Run the composition script against a real XML DOM of its actual SVG markup. */
function runComposition(html: string) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const markup = html.slice(html.indexOf("<svg"), html.indexOf("</svg>") + 6);
  const document = new DOMParser().parseFromString(markup, "image/svg+xml");
  const listeners: { target: string; type: string; fn: (event: unknown) => void }[] = [];
  const listen = (target: string) => ({
    addEventListener: (type: string, fn: (event: unknown) => void) =>
      listeners.push({ target, type, fn }),
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      const index = listeners.findIndex((entry) => entry.type === type && entry.fn === fn);
      if (index >= 0) listeners.splice(index, 1);
    },
  });
  // Only event registration is stubbed; element lookup and mutation use the real DOM.
  const documentProxy = new Proxy(document, {
    get: (target, key) =>
      key === "addEventListener" || key === "removeEventListener"
        ? listen("document")[key]
        : Reflect.get(target, key),
  });
  const window: { __timelines?: Record<string, gsap.core.Timeline> } & ReturnType<typeof listen> =
    listen("window");
  vm.runInNewContext(script, { gsap, document: documentProxy, window, Math });
  const timeline = window.__timelines![TERMINAL_COMPOSITION_ID];
  const snapshot = () => new XMLSerializer().serializeToString(document);
  return {
    document,
    timeline,
    listeners,
    snapshot: (time: number) => {
      timeline.seek(time, false);
      return snapshot();
    },
    hfSeek: (time: number) => {
      for (const entry of listeners.filter((e) => e.target === "window" && e.type === "hf-seek"))
        entry.fn({ detail: { time } });
      return snapshot();
    },
  };
}
const allIds = (markup: string) =>
  Array.from(new DOMParser().parseFromString(markup, "image/svg+xml").getElementsByTagName("*"))
    .map((element) => element.getAttribute("id"))
    .filter((id): id is string => Boolean(id));

describe("Terminal Lyric Duotone Anime composition", () => {
  it("follows the HyperFrames contract with one paused timeline, hf-seek and local fonts", () => {
    const html = terminalLyricPreviewHtml();
    expect(html).toContain(`data-composition-id="${TERMINAL_COMPOSITION_ID}"`);
    expect(html).toContain('data-duration="3"');
    expect(html).toContain('<script src="gsap.min.js"></script>');
    expect(html.match(/gsap\.timeline\(/g)).toHaveLength(1);
    expect(html).toContain("paused:true");
    expect(html).toContain(`window.__timelines={'${TERMINAL_COMPOSITION_ID}':tl}`);
    expect(html).toContain("addEventListener('hf-seek'");
    expect(html).toContain(terminalLyricPreviewSvg(0));
    // Fonts come from local() system faces only.
    for (const face of html.match(/@font-face\{[^}]*\}/g)!)
      expect(face.replace(/local\("[^"]+"\),?/g, "")).not.toContain("url(");
    const svgStart = html.indexOf("<svg");
    const svgEnd = html.indexOf("</svg>");
    expect(html.slice(svgStart, svgEnd)).not.toContain("<script");
    for (const banned of [
      "Math.random",
      "Date.now",
      "performance.now",
      "requestAnimationFrame",
      "setInterval",
      "setTimeout",
      "http",
    ])
      expect(html.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toContain(banned);
  });

  it("reproduces identical states for forward, backward, hf-seek and fresh direct seeks", () => {
    const html = terminalLyricPreviewHtml();
    const times = Array.from({ length: 91 }, (_, frame) => frame / 30);
    const live = runComposition(html);
    const forward = times.map(live.snapshot);
    const backward = [...times].reverse().map(live.snapshot).reverse();
    expect(backward).toEqual(forward);
    for (const index of [0, 5, 18, 33, 42, 50, 61, 70, 89]) {
      const fresh = runComposition(html);
      expect(fresh.snapshot(times[index]), `t=${times[index]}`).toBe(forward[index]);
      const evented = runComposition(html);
      expect(evented.hfSeek(times[index])).toBe(forward[index]);
      const expected = terminalLyricPatch(terminalLyricState(times[index]));
      for (const [id, values] of Object.entries(expected)) {
        const element = fresh.document.getElementById(id)!;
        expect(element, id).toBeTruthy();
        for (const [key, value] of Object.entries(values))
          if (key === "#text") expect(element.textContent, id).toBe(value);
          else expect(element.getAttribute(key), `${id}.${key}`).toBe(value);
      }
    }
    expect(new Set(forward).size).toBeGreaterThan(40);
  });

  it("gives every actual SVG element a unique ID and patches only matching element types", () => {
    const html = terminalLyricPreviewHtml();
    const markups = [
      html.slice(html.indexOf("<svg"), html.indexOf("</svg>") + 6),
      ...[0, 1.1, 2.4, 3].map((time) => terminalLyricPreviewSvg(time)),
    ];
    for (const markup of markups) {
      const ids = allIds(markup);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      expect(duplicates).toEqual([]);
      expect(ids.length).toBeGreaterThan(30);
    }
    const { document } = runComposition(html);
    for (const [id, values] of Object.entries(terminalLyricPatch(terminalLyricState(2)))) {
      const element = document.getElementById(id);
      expect(element, id).toBeTruthy();
      if ("#text" in values) expect(["text", "tspan"], id).toContain(element!.tagName);
    }
  });

  it("counts the real DOM SCAN text to 100% while the scanline pattern keeps its rectangle", () => {
    const live = runComposition(terminalLyricPreviewHtml());
    const scanText = () => live.document.getElementById("tl-scan")!.textContent;
    const pattern = () => live.document.getElementById("tl-scanlines")!;
    expect(pattern().tagName).toBe("pattern");
    live.snapshot(0.5);
    expect(scanText()).toBe("SCAN 000%");
    const readings = [1.2, 1.5, 1.8, 2.0, 2.9].map((time) => {
      live.snapshot(time);
      expect(pattern().getElementsByTagName("rect")).toHaveLength(1);
      return Number(scanText()!.match(/\d+/)![0]);
    });
    expect(readings.every((value, i) => !i || value >= readings[i - 1])).toBe(true);
    expect(readings[1]).toBeGreaterThan(50);
    expect(readings.slice(-2)).toEqual([100, 100]);
    // The scanline fill still references the pattern.
    expect(live.snapshot(2.9)).toContain('fill="url(#tl-scanlines)"');
  });

  it("registers exactly one hf-seek listener, on window, with page-exit cleanup", () => {
    const live = runComposition(terminalLyricPreviewHtml());
    const seeks = live.listeners.filter((entry) => entry.type === "hf-seek");
    expect(seeks.map((entry) => entry.target)).toEqual(["window"]);
    const exit = live.listeners.find((entry) => entry.type === "pagehide")!;
    exit.fn({});
    expect(live.listeners.filter((entry) => entry.type === "hf-seek")).toHaveLength(0);
  });
});

describe("motion-047 rotating sonar sweep", () => {
  it("rotates clockwise at a constant period from absolute time", () => {
    for (const t of [0.5, 1.3, 2.7, 4.1])
      expect(sweepAngle(t + SONAR.period) - sweepAngle(t)).toBeCloseTo(Math.PI * 2, 10);
    const rate = (sweepAngle(3) - sweepAngle(2)) / 1;
    expect(rate).toBeCloseTo((Math.PI * 2) / SONAR.period, 10);
    expect(rate).toBeGreaterThan(0); // canvas y-down: increasing angle is clockwise on screen
    // Top → right → bottom → left one second apart.
    [2, 3, 4, 5, 6].forEach((t, i) => {
      const difference = Math.abs(sweepBearing(t) - i * 90) % 360;
      expect(Math.min(difference, 360 - difference)).toBeLessThan(1e-6);
    });
    const { x, y } = SONAR.pivot;
    expect(beamContains(x, y - 100, 2)).toBe(true);
    expect(beamContains(x + 100, y, 2)).toBe(false);
    expect(beamContains(x + 100, y, 3)).toBe(true);
    expect(beamContains(x, y - 100, 3)).toBe(false);
    expect(beamContains(x, y - 100, 0.3)).toBe(false);
  });

  it("masks one sector from a fixed pivot with a clear inside and a dot-matrix outside", () => {
    const pivotArcs = (commands: Command[]) =>
      named(commands, "arc").filter((c) => c[3] === SONAR.reach);
    expect(pivotArcs(drawCommands("motion-047", 0.3))).toHaveLength(0);
    for (const t of [1, 2.2, 3.7, 5.9]) {
      const commands = drawCommands("motion-047", t);
      const arcs = pivotArcs(commands);
      // One sector for the outside clip and the same sector for the inside clip: no history.
      expect(arcs).toHaveLength(2);
      for (const arc of arcs) expect([arc[1], arc[2]]).toEqual([SONAR.pivot.x, SONAR.pivot.y]);
      expect(arcs[0]).toEqual(arcs[1]);
      expect(commands).toContainEqual(["clip", "evenodd"]);
      expect(commands).toContainEqual(["globalCompositeOperation", "lighter"]);
    }
    const gap = SONAR.dots.pitch - SONAR.dots.aperture;
    const bars = (t: number) =>
      named(drawCommands("motion-047", t), "rect").filter((c) => c[3] === gap || c[4] === gap)
        .length;
    expect(bars(1.2)).toBe(0);
    // A fixed screen grid: one bar per row and column boundary, independent of the beam angle.
    expect(bars(3)).toBe(360 / SONAR.dots.pitch + 1 + 640 / SONAR.dots.pitch + 1);
    expect(bars(5.5)).toBe(bars(3));
    expect(dotMatrixMix(1.2)).toBe(0);
    expect(dotMatrixMix(3)).toBe(1);
    const brightness = frames.map(outsideBrightness);
    expect(brightness.every((b, i) => !i || b <= brightness[i - 1] + 1e-12)).toBe(true);
    expect(Math.min(...brightness)).toBeGreaterThanOrEqual(0.4);
    expect(beamStrength(6)).toBe(1);
  });

  it("reproduces frames on direct and backward seeks regardless of history", () => {
    const direct = drawCommands("motion-047", 3.3);
    drawCommands("motion-047", 5.9);
    drawCommands("motion-047", 0.2);
    expect(drawCommands("motion-047", 3.3)).toEqual(direct);
    const forward = frames.map((t) => JSON.stringify(drawCommands("motion-047", t)));
    const backward = [...frames]
      .reverse()
      .map((t) => JSON.stringify(drawCommands("motion-047", t)));
    expect(backward.reverse()).toEqual(forward);
  });
});

describe("motion-048 pixel-tile materialize and targeted delete", () => {
  it("slices one image into a complete, non-overlapping set of crops", () => {
    expect(TILE_COUNT).toBe(GRID.cols * GRID.rows);
    const covered = new Set<string>();
    for (let i = 0; i < TILE_COUNT; i++) {
      const rect = tileSourceRect(i);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(IMAGE.w);
      expect(rect.y + rect.h).toBeLessThanOrEqual(IMAGE.h);
      const key = `${rect.x},${rect.y}`;
      expect(covered.has(key)).toBe(false);
      covered.add(key);
    }
    expect(covered.size * GRID.size * GRID.size).toBe(IMAGE.w * IMAGE.h);
  });

  it("draws every tile as a clipped crop of the same illustration, not a coloured rectangle", () => {
    const image = JSON.stringify(recordIllustration());
    const commands = drawCommands("motion-048", 2.5);
    const clips = commands.flatMap((c, i) => (c[0] === "clip" ? [i] : []));
    expect(clips).toHaveLength(TILE_COUNT);
    for (const index of clips) {
      const [, x, y] = commands[index + 1] as [string, number, number];
      expect(commands[index + 1][0]).toBe("translate");
      const rest = commands.slice(index + 2);
      const crop = rest.slice(
        0,
        rest.findIndex((c) => c[0] === "restore"),
      );
      expect(JSON.stringify(crop)).toBe(image);
      // The offset maps the tile's home cell centre onto the illustration.
      const home = Array.from({ length: TILE_COUNT }, (_, i) => tileHome(i)).find(
        (h) => h.x + GRID.size / 2 === -x && h.y + GRID.size / 2 === -y,
      );
      expect(home).toBeDefined();
    }
  });

  it("assembles from seeded scatter into the full image and holds it readably", () => {
    const early = Array.from({ length: TILE_COUNT }, (_, i) => tilePose(i, 0.4));
    expect(early.filter((pose) => pose.home)).toHaveLength(0);
    expect(new Set(early.map((pose) => pose.scale.toFixed(2))).size).toBeGreaterThan(10);
    expect(
      Math.max(...Array.from({ length: TILE_COUNT }, (_, i) => tileArrival(i))),
    ).toBeLessThanOrEqual(ASSEMBLY.complete);
    // Centre tiles arrive before the corners (a silhouette cluster forms first).
    const centre = 2 * GRID.cols + 3;
    expect(tileArrival(centre)).toBeLessThan(tileArrival(0));
    for (let i = 0; i < TILE_COUNT; i++) {
      const pose = tilePose(i, ASSEMBLY.complete);
      const home = tileHome(i);
      expect(pose).toMatchObject({
        x: home.x + GRID.size / 2,
        y: home.y + GRID.size / 2,
        scale: 1,
        rotation: 0,
        alpha: 1,
        home: true,
      });
    }
    expect(TARGETS[0].hop - ASSEMBLY.complete).toBeGreaterThanOrEqual(0.8);
    expect(tilePose(5, 0.3)).toEqual(tilePose(5, 0.3));
  });

  it("hops a selection box among fixed cells and leaves deleted cells empty without reflow", () => {
    const selections = frames.map(selectionCell).filter((cell) => cell !== null);
    expect(new Set(selections)).toEqual(new Set(TARGET_CELLS));
    // A step function: constant between hops.
    expect(selectionCell(TARGETS[1].hop + 0.01)).toBe(selectionCell(TARGETS[2].hop - 0.01));
    expect(selectionCell(TARGETS[0].hop - 0.01)).toBeNull();
    TARGET_CELLS.forEach((cell, k) => {
      const start = TARGETS[k].hop + DELETE.dwell;
      expect(cellState(cell, TARGETS[k].hop)).toBe("selected");
      expect(cellState(cell, start + 0.1)).toBe(
        TARGETS[k].mode === "fragment" ? "fragmenting" : "binary",
      );
      expect(deletionEnd(k)).toBeCloseTo(start + deleteDuration(TARGETS[k].mode), 10);
      for (let t = deletionEnd(k); t <= 6; t += 0.1) expect(cellState(cell, t)).toBe("empty");
    });
    expect(new Set(TARGETS.map((t) => t.mode))).toEqual(new Set(["fragment", "binary"]));
    const lastDone = Math.max(...TARGETS.map((_, k) => deletionEnd(k)));
    expect(6 - lastDone).toBeGreaterThanOrEqual(0.6);
    for (let i = 0; i < TILE_COUNT; i++) {
      if (TARGET_CELLS.includes(i)) continue;
      const home = tileHome(i);
      for (const t of [2.5, 4, 6]) {
        expect(cellState(i, t)).toBe("present");
        expect(tilePose(i, t)).toMatchObject({
          x: home.x + GRID.size / 2,
          y: home.y + GRID.size / 2,
        });
      }
    }
    expect(named(drawCommands("motion-048", 6), "clip")).toHaveLength(TILE_COUNT - TARGETS.length);
    const counts = frames.map(deletedCount);
    expect(counts.every((n, i) => !i || n >= counts[i - 1])).toBe(true);
    expect(deletedCount(6)).toBe(TARGETS.length);
  });

  it("moves fragments on closed-form gravity paths and repeats seeks exactly", () => {
    const start = TARGETS[0].hop + DELETE.dwell;
    const a = fragmentPose(0, 3, start + 0.2);
    const b = fragmentPose(0, 3, start + 0.3);
    expect(b.y - b.homeY).not.toBe(a.y - a.homeY);
    expect(fragmentPose(0, 3, start + 0.2)).toEqual(a);
    const direct = drawCommands("motion-048", start + 0.2);
    drawCommands("motion-048", 5.5);
    drawCommands("motion-048", 0.1);
    expect(drawCommands("motion-048", start + 0.2)).toEqual(direct);
    const forward = frames.map((t) => JSON.stringify(drawCommands("motion-048", t)));
    const backward = [...frames]
      .reverse()
      .map((t) => JSON.stringify(drawCommands("motion-048", t)));
    expect(backward.reverse()).toEqual(forward);
  });
});

describe("motion-048 regression: readable deletion and clean assembly", () => {
  const fragmentTargets = TARGETS.flatMap((target, k) => (target.mode === "fragment" ? [k] : []));
  const pieces = Array.from({ length: 16 }, (_, piece) => piece);
  it("keeps fragments opaque red squares for most of a 0.7-0.8 s life that fall over a cell", () => {
    expect(deleteDuration("fragment")).toBeGreaterThanOrEqual(0.7);
    expect(deleteDuration("fragment")).toBeLessThanOrEqual(0.8);
    for (const k of fragmentTargets) {
      const start = TARGETS[k].hop + DELETE.dwell;
      const drifts = new Set<number>();
      for (const piece of pieces) {
        const samples = Array.from({ length: 31 }, (_, i) =>
          fragmentPose(k, piece, start + (i / 30) * deleteDuration("fragment")),
        );
        const opaque = samples.filter((pose) => pose.alpha >= 0.99).length / samples.length;
        expect(opaque, `target ${k} piece ${piece}`).toBeGreaterThanOrEqual(0.55);
        expect(samples.at(-1)!.alpha).toBe(0);
        // While still at least half opaque, every piece has fallen a full cell height.
        const lastVisible = samples.filter((pose) => pose.alpha >= 0.5).at(-1)!;
        expect(lastVisible.y - lastVisible.homeY).toBeGreaterThanOrEqual(GRID.size);
        expect(lastVisible.scale).toBeGreaterThan(0.7);
        drifts.add(Math.sign(samples.at(-1)!.x - samples.at(-1)!.homeX));
        expect(fragmentPose(k, piece, start + 0.3).redness).toBe(1);
      }
      expect(drifts).toEqual(new Set([-1, 1]));
    }
    // Drawn red overlays are fully opaque mid-fall (not a faint fade).
    const mid = TARGETS[fragmentTargets[0]].hop + DELETE.dwell + 0.3;
    const alphas = drawCommands("motion-048", mid)
      .map((command, i, all) =>
        command[0] === "fillRect" && all[i - 1]?.[0] === "globalAlpha" ? all[i - 1][1] : null,
      )
      .filter((value): value is number => typeof value === "number");
    expect(alphas.filter((alpha) => alpha === 1).length).toBeGreaterThanOrEqual(12);
    // The phase may overlap the next selector hop while the deleted slot stays fixed.
    expect(deletionEnd(fragmentTargets[0])).toBeGreaterThan(TARGETS[fragmentTargets[0] + 1].hop);
    expect(FRAGMENT.gravity).toBeGreaterThan(0);
  });

  it("clips binary digits inside their cell on a fixed column grid", () => {
    for (const [k, target] of TARGETS.entries()) {
      if (target.mode !== "binary") continue;
      const home = tileHome(TARGET_CELLS[k]);
      const commands = drawCommands("motion-048", target.hop + DELETE.dwell + DELETE.binary * 0.5);
      const clip = commands.findIndex(
        (command, i) =>
          command[0] === "clip" &&
          JSON.stringify(commands[i - 1]) ===
            JSON.stringify(["rect", home.x, home.y, GRID.size, GRID.size]),
      );
      expect(clip).toBeGreaterThan(0);
      const digits = commands
        .slice(clip, clip + commands.slice(clip).findIndex((c) => c[0] === "restore"))
        .filter((command) => command[0] === "fillText" && /^[01]$/.test(String(command[1])));
      expect(digits.length).toBeGreaterThanOrEqual(15);
      for (const [, , x, y] of digits as [string, string, number, number][]) {
        expect(x).toBeGreaterThanOrEqual(home.x + BINARY_LAYOUT.columnX);
        expect(x + 5).toBeLessThanOrEqual(home.x + GRID.size);
        expect(y).toBeLessThanOrEqual(home.y + GRID.size);
      }
    }
  });

  it("keeps straggler specks off the image and gone before the assembled hold", () => {
    for (let frame = 0; frame <= 72; frame++) {
      const time = frame / 12;
      for (const piece of loosePieces(time)) {
        const overlaps =
          piece.x < IMAGE.x + IMAGE.w &&
          piece.x + piece.size > IMAGE.x &&
          piece.y < IMAGE.y + IMAGE.h &&
          piece.y + piece.size > IMAGE.y;
        expect(overlaps, `t=${time}`).toBe(false);
        if (time >= ASSEMBLY.complete) expect(piece.alpha).toBe(0);
      }
    }
    expect(loosePieces(1.2).every((piece) => piece.alpha === 1)).toBe(true);
    expect(loosePieces(1.0)[0].x).not.toBe(loosePieces(1.3)[0].x);
  });

  it("keeps every scattered tile fully inside the frame", () => {
    for (const time of [0.3, 0.6, 0.9]) {
      for (let i = 0; i < TILE_COUNT; i++) {
        const pose = tilePose(i, time);
        const half = (GRID.size * pose.scale) / Math.SQRT2;
        expect(pose.x - half).toBeGreaterThanOrEqual(-1e-9);
        expect(pose.x + half).toBeLessThanOrEqual(640 + 1e-9);
        expect(pose.y - half).toBeGreaterThanOrEqual(-1e-9);
        expect(pose.y + half).toBeLessThanOrEqual(360 + 1e-9);
      }
    }
  });
});

it("shares one seeded generator and TAU from drawing.ts instead of local copies", async () => {
  const drawing = await import("../src/client/motion-previews/drawing");
  expect(drawing.TAU).toBe(Math.PI * 2);
  const a = drawing.seeded(4801);
  const b = drawing.seeded(4801);
  const values = Array.from({ length: 5 }, () => a());
  expect(Array.from({ length: 5 }, () => b())).toEqual(values);
  expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  for (const id of ["motion-047", "motion-048"]) {
    const source = await readFile(
      path.join(root, "src/client/motion-previews", `${id}.ts`),
      "utf8",
    );
    expect(source).toMatch(/import \{[^}]*\bseeded\b[^}]*\} from "\.\/drawing"/);
    expect(source).not.toMatch(/function seeded|const TAU =/);
  }
});

it("keeps both previews free of clocks and unseeded randomness", async () => {
  for (const id of ["motion-047", "motion-048"]) {
    const source = await readFile(
      path.join(root, "src/client/motion-previews", `${id}.ts`),
      "utf8",
    );
    for (const banned of [
      "Math.random",
      "Date.now",
      "performance.now",
      "requestAnimationFrame",
      "setTimeout",
      "setInterval",
    ])
      expect(source, `${id} ${banned}`).not.toContain(banned);
  }
});

// Real raster frames, when the optional native canvas package is present in this install.
const nativeCanvas = await import("@napi-rs/canvas").catch(() => null);
describe.skipIf(!nativeCanvas)("actual canvas frames", () => {
  const render = (id: string, time: number) => {
    const canvas = nativeCanvas!.createCanvas(640, 360);
    const context = canvas.getContext("2d");
    drawMotionPreview(context as unknown as CanvasRenderingContext2D, id, time);
    return (x: number, y: number) => {
      const [r, g, b] = context.getImageData(x, y, 1, 1).data;
      return (r + g + b) / 3;
    };
  };
  it("shows the sonar image bright inside the beam and as dark dots outside it", () => {
    const right = { x: SONAR.pivot.x + 192, y: SONAR.pivot.y }; // a dot centre on the 8px grid
    const inside = render("motion-047", 3)(right.x, right.y);
    const outside = render("motion-047", 5);
    expect(beamContains(right.x, right.y, 3)).toBe(true);
    expect(beamContains(right.x, right.y, 5)).toBe(false);
    expect(inside).toBeGreaterThan(outside(right.x, right.y) * 1.5);
    // Outside: apertures show the image, the grid between them is darker.
    expect(outside(right.x, right.y)).toBeGreaterThan(outside(right.x + 4, right.y + 4) + 8);
  });
  it("leaves deleted tile cells empty while kept cells keep their pixels", () => {
    const assembled = render("motion-048", 2.5);
    const final = render("motion-048", 6);
    const stage = render("motion-048", 0.05)(
      tileHome(TARGET_CELLS[0]).x + 22,
      tileHome(TARGET_CELLS[0]).y + 22,
    );
    for (const cell of TARGET_CELLS) {
      const home = tileHome(cell);
      expect(Math.abs(final(home.x + 22, home.y + 22) - stage)).toBeLessThan(3);
    }
    for (const cell of [0, 11, 27, 44]) {
      const home = tileHome(cell);
      expect(final(home.x + 12, home.y + 30)).toBeCloseTo(assembled(home.x + 12, home.y + 30), 0);
    }
  });
});
