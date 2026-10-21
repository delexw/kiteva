import vm from "node:vm";
import { gsap } from "gsap";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import { validateExamplePalette, validateExampleSvg } from "../src/server/catalog/style-examples";
import { summarizeStyle, styleSummarySource } from "../src/server/catalog/style-summaries";
import { StyleSummarySchema } from "../src/shared/agents/schemas/style-summary";
import chinese from "../src/client/i18n/catalog.zh-CN.json";
import {
  DRAWING_RATE,
  FILM_RATE,
  LEADER_CENTER,
  RUBBER_HOSE_COMPOSITION_ID,
  RUBBER_HOSE_DRAWINGS,
  RUBBER_HOSE_FILM_FRAMES,
  drawingIndex,
  filmFrameIndex,
  leaderState,
  openerPoses,
  rubberHoseColors,
  rubberHoseDrawingPatches,
  rubberHoseDrawingState,
  rubberHoseFilmPatches,
  rubberHoseFilmState,
  rubberHosePreviewHtml,
  rubberHosePreviewSvg,
  rubberHoseSummary,
  sampleCues,
  settlePoses,
  wipePath,
} from "../scripts/generate-rubber-hose-countdown-preview";

const STYLE_ID = "style-140";
const styleOf = async (id = STYLE_ID) => (await loadCatalog()).styles.find((s) => s.id === id)!;
const zh = chinese as Record<string, string>;
// Sample content and removed effects that must never become reusable guidance.
const sampleOrRemoved =
  /rabbit|software|engineer|documents|YOUR APP|haunted|house|clarity|confusion|app launch|3-2-1|mosaic|tessellat|tile|delaunator|pixel reveal/i;
const generationText = (style: Awaited<ReturnType<typeof styleOf>>) => [
  style.visual_cues,
  style.tech.implementation,
  style.executable_prompt_template,
  style.audio_direction.prompt,
  ...style.palette.constraints,
  String(style.palette.direction),
  ...style.motion_references.candidates.map((c) => c.usage_guidance),
  JSON.stringify(style.suggested_combinations),
  JSON.stringify(style.tech.recommended_stack),
];

describe("Vintage Rubber Hose Animation metadata contract", () => {
  it("adds one authored style-140 with a name distinct from style-034 and the prior styles intact", async () => {
    const catalog = await loadCatalog();
    expect(catalog.styles).toHaveLength(140);
    const style = await styleOf();
    expect(style.name_en).toBe("Vintage Rubber Hose Animation");
    expect(style.category).toBe("Animation Techniques");
    expect(style.provenance).toBe("authored");
    expect(style.note).toContain("claude-opus-5-5");
    expect(style.note).toContain("Not application-authored");
    expect((await styleOf("style-034")).name_en).toBe("Rubber Hose Animation");
    expect((await styleOf("style-056")).name_en).toBe("Mosaic");
    expect(new Set(catalog.styles.map((s) => s.name_en)).size).toBe(catalog.styles.length);
  });

  it("keeps generation guidance free of sample narratives, removed effects and mandatory subjects", async () => {
    const style = await styleOf();
    for (const text of generationText(style)) expect(text).not.toMatch(sampleOrRemoved);
    expect(style.note).toContain("demonstration only");
    expect(style.note).toContain("neither its subject nor its sequence is a requirement");
  });

  it("describes the hand-inked drawing language for any subject, with characters only when present", async () => {
    const style = await styleOf();
    for (const phrase of [
      "hand-inked cel cartoons",
      "Strong, irregular ink silhouettes",
      "organic, slightly imperfect contours vary in line weight",
      "bold painterly or cel shadow masses",
      "expressive, warped and asymmetric",
      "layered atmosphere and environments that subtly react",
      "any original human, animal, robot, object or environmental subject",
      "curved, jointless rubber-hose limbs",
      "never resemble an existing cartoon character or mascot",
      "Shots without characters, such as landscapes or buildings, are equally valid, and architecture need not become round",
      "Avoid clean corporate vector icons with grain pasted on top",
    ])
      expect(style.visual_cues).toContain(phrase);
    const implementation = style.tech.implementation;
    expect(implementation).toContain("Characters (only when present):");
    expect(implementation).toContain("Shots without characters are valid.");
    expect(implementation.indexOf("Core drawing (always)")).toBeLessThan(
      implementation.indexOf("Characters (only when present)"),
    );
  });

  it("allows only film wear and a vintage film-leader countdown as optional effects", async () => {
    const style = await styleOf();
    expect(style.visual_cues).toContain(
      "The only optional effects, used only where a project needs them, are film wear and a vintage film-leader countdown",
    );
    const [core, optional] = style.tech.implementation.split(
      "Optional effects (only when a project needs them):",
    );
    expect(optional).toBeDefined();
    for (const effect of [/countdown|leader numeral/i, /grain|scratch|gate weave/i])
      expect(core.replace("this does not apply to optional film-leader numerals", "")).not.toMatch(
        effect,
      );
    expect(optional).toContain(
      "Film wear: treat it as photographic film material separate from the cartoon artwork",
    );
    expect(style.executable_prompt_template).toContain(
      "Add the only optional effects, film wear and a vintage film-leader countdown, only where the project needs them",
    );
  });

  it("specifies the optional leader as a precise photographic plate, not cartoon artwork", async () => {
    const { implementation } = (await styleOf()).tech;
    for (const phrase of [
      "mechanically precise, centred concentric registration circles and thin crosshair lines fixed relative to each other",
      "large, pale, bold sans-serif numerals with clear breathing room over a darker coordinated ground",
      "a broad, darker, translucent clock-wipe sector rotating behind the numeral and rings",
      "Gate weave moves the whole plate, never individual rings",
      "Do not give the leader cartoon ink outlines, line boil, serif numerals, decorative paper borders or wobbly circles",
      "not a strict historical reconstruction",
      "this does not apply to optional film-leader numerals",
    ])
      expect(implementation).toContain(phrase);
    expect(implementation).not.toMatch(/serif or period-like/);
  });

  it("keeps project colours, delivery, renderer and audio settings authoritative", async () => {
    const catalog = await loadCatalog();
    const style = await styleOf();
    expect(style.palette.background_policy).toBe("scene_dependent");
    expect(style.palette.tokens).toEqual(rubberHoseColors);
    expect(style.palette.constraints[0]).toContain(
      "A task-provided or approved project palette takes precedence",
    );
    expect(style.palette.constraints.join(" ")).toContain("one optional storytelling device");
    expect(String(style.palette.direction)).toContain("not a required grayscale palette");
    expect(style.visual_cues).toContain(
      "typically 12 unique drawings per second against a 24 fps film reference, adapted to the project's delivery settings",
    );
    expect(style.tech.implementation).toContain("a project may choose another drawing rate");
    expect(style.tech.implementation).toContain("Never derive state from a frame counter");
    expect(style.visual_cues).toContain("no mandatory perpetual bounce");
    expect(style.tech.render_pipeline).toContain("project's renderer setting");
    const original = catalog.originalStyles.find((s) => s.id === STYLE_ID)!;
    const tools = (
      original.tech as { recommended_stack: { name: string }[] }
    ).recommended_stack.map((tool) => tool.name);
    for (const excluded of ["HyperFrames", "Remotion", "Multiplane", "Delaunator"])
      expect(tools).not.toContain(excluded);
    expect(style.tech.style_renderer.recommended_stack_refs).toEqual([
      "SVG",
      "HTML/CSS",
      "Canvas 2D",
    ]);
    expect(style.tech.motion_engine.recommended_stack_refs).toEqual(["GSAP"]);
    expect(style.audio_direction.prompt).toContain("governed by the project's audio settings");
    expect(style.audio_direction.prompt).toContain(
      "do not invent narration or music when audio is disabled",
    );
  });

  it("references only the core landing motion and no mosaic-related style or motion", async () => {
    const style = await styleOf();
    expect(style.motion_references.candidates.map((c) => c.motion_id)).toEqual(["motion-027"]);
    const supporting = style.suggested_combinations!.suggestions.flatMap((s) =>
      s.supporting_styles.map((entry) => entry.style_id),
    );
    expect(supporting).toEqual(["style-081", "style-097"]);
    expect(supporting).not.toContain("style-056");
  });

  it("ships Chinese translations of the reusable guidance with the leader and character rules", async () => {
    const style = await styleOf();
    expect(zh[style.name_en]).toBe("复古橡皮管动画");
    const cues = zh[style.visual_cues];
    const implementation = zh[style.tech.implementation];
    expect(cues).toContain("仅有的可选效果是胶片磨损和复古胶片片头倒计时");
    expect(cues).toContain("没有角色的镜头");
    expect(implementation).toContain("角色（仅在出现时）");
    expect(implementation).toContain("粗体无衬线数字");
    expect(implementation).toContain("时钟式擦除扇形");
    for (const text of [cues, implementation]) expect(text).not.toMatch(/马赛克|兔子|软件|文件/);
  });

  it("serves a cached summary that exactly matches the current metadata source", async () => {
    expect(() => StyleSummarySchema.parse(rubberHoseSummary)).not.toThrow();
    const catalog = await loadCatalog();
    const cached = await summarizeStyle(
      styleSummarySource(catalog, STYLE_ID),
      "claude",
      new AbortController().signal,
      undefined,
      async () => {
        throw Error("summary cache miss: regenerate after metadata changes");
      },
    );
    expect(cached).toEqual(StyleSummarySchema.parse(rubberHoseSummary));
    for (const value of Object.values(rubberHoseSummary))
      expect(String(value)).not.toMatch(sampleOrRemoved);
    expect(rubberHoseSummary.name).toContain(
      "only optional effects are film wear and a vintage film-leader countdown",
    );
  });
});

describe("Vintage Rubber Hose Animation sample artwork", () => {
  it("draws a safe, code-only sample whose house is labelled as replaceable sample content", async () => {
    const svg = rubberHosePreviewSvg();
    expect(() => validateExampleSvg(svg)).not.toThrow();
    await expect(validateExamplePalette(svg, await styleOf())).resolves.toBeUndefined();
    const withoutNamespace = svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
    for (const forbidden of ["<image", "<img", "data:", "http", "@font-face", "@import", "<script"])
      expect(withoutNamespace).not.toContain(forbidden);
    expect(svg).toContain('data-role="replaceable-sample-subject"');
    expect(svg.match(/data-part="lit-window"/g)!.length).toBeGreaterThanOrEqual(6);
    expect(svg.match(/data-part="bare-tree"/g)).toHaveLength(3);
    expect(svg).not.toMatch(/rabbit|YOUR APP|mosaic|rh-tile|kiteva/i);
  });

  it("uses only the suggested palette colours", () => {
    const allowed = new Set(Object.values(rubberHoseColors).map((c) => c.toUpperCase()));
    for (let drawing = 0; drawing < RUBBER_HOSE_DRAWINGS; drawing += 2)
      for (const color of rubberHosePreviewSvg(drawing / DRAWING_RATE).match(/#[0-9A-Fa-f]{6}\b/g)!)
        expect(allowed, color).toContain(color.toUpperCase());
  });

  it("acts the house with anticipation, stretch, overshoot and settle rather than a uniform loop", () => {
    const heights = openerPoses.map((pose) => pose.sy);
    expect(heights.indexOf(Math.min(...heights))).toBeLessThan(
      heights.indexOf(Math.max(...heights)),
    );
    expect(Math.min(...heights)).toBeLessThan(0.96);
    expect(Math.max(...heights)).toBeGreaterThan(1.05);
    expect(settlePoses[0].sy).toBeLessThan(1);
    expect(settlePoses.at(-1)).toMatchObject({ sx: 1, sy: 1 });
    const { treeSway: _lastSway, ...houseHold } = openerPoses.at(-1)!;
    const { treeSway: _previousSway, ...previousHold } = openerPoses.at(-2)!;
    expect(houseHold).toEqual(previousHold);
    const sway = openerPoses.map((pose) => pose.treeSway);
    expect(new Set(sway).size).toBeGreaterThan(5);
  });

  it("keeps the leader plate outside the cartoon line-boil filter and its rings unpatched", () => {
    const svg = rubberHosePreviewSvg(1.2);
    const cartoon = svg.slice(svg.indexOf('id="rh-cartoon"'), svg.indexOf('id="rh-leader"'));
    expect(cartoon).toContain('filter="url(#rh-boil)"');
    const leader = svg.slice(svg.indexOf('id="rh-leader"'));
    expect(leader.slice(0, leader.indexOf(">"))).not.toContain("filter");
    const [cx, cy] = LEADER_CENTER;
    const rings = [
      ...leader.matchAll(/<circle cx="(\d+)" cy="(\d+)" r="(\d+)"[^>]*registration-circle/g),
    ];
    expect(rings.map((m) => [Number(m[1]), Number(m[2]), Number(m[3])])).toEqual([
      [cx, cy, 330],
      [cx, cy, 272],
    ]);
    expect(leader).toContain(`d="M0 ${cy}H1280M${cx} 0V720"`);
    expect(leader).toMatch(/font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"/);
    const patched = new Set([
      ...Object.keys(rubberHoseDrawingPatches()[0]),
      ...Object.keys(rubberHoseFilmPatches()[0]),
    ]);
    expect([...patched].filter((id) => /ring|circle|crosshair/.test(id))).toEqual([]);
    expect(patched).toContain("rh-leader-plate");
  });
});

describe("Vintage Rubber Hose Animation sample clocks", () => {
  it("steps cartoon drawings at 12 per second for any delivery rate", () => {
    expect(drawingIndex(-1)).toBe(0);
    expect(drawingIndex(Number.NaN)).toBe(0);
    expect(drawingIndex(99)).toBe(RUBBER_HOSE_DRAWINGS - 1);
    for (const fps of [24, 30, 60])
      for (let frame = 0; frame < 3 * fps; frame++) {
        const time = frame / fps;
        expect(rubberHoseDrawingState(time)).toEqual(
          rubberHoseDrawingState(drawingIndex(time) / DRAWING_RATE),
        );
      }
  });

  it("steps the film plate and film wear at 24 per second on separate property owners", () => {
    const seeds = Array.from(
      { length: RUBBER_HOSE_FILM_FRAMES },
      (_, f) => rubberHoseFilmState(f / FILM_RATE).grainSeed,
    );
    expect(new Set(seeds).size).toBe(RUBBER_HOSE_FILM_FRAMES);
    expect(filmFrameIndex(1 / 24)).toBe(1);
    const drawingIds = new Set(Object.keys(rubberHoseDrawingPatches()[0]));
    for (const id of Object.keys(rubberHoseFilmPatches()[0])) expect(drawingIds).not.toContain(id);
  });
});

describe("Vintage Rubber Hose Animation optional effects in the sample", () => {
  const frames = Array.from({ length: RUBBER_HOSE_FILM_FRAMES }, (_, f) =>
    leaderState(f / FILM_RATE),
  );

  it("cuts from the house to a 3, 2, 1 leader with a rotating wipe, then back", () => {
    const active = frames.filter((f) => f.active);
    expect(active[0].frame).toBe(sampleCues.leaderStartFrame);
    expect(active.map((f) => f.count).join("")).toBe(
      "3".repeat(14) + "2".repeat(14) + "1".repeat(14),
    );
    for (let count = 0; count < 3; count++) {
      const wipes = active.slice(count * 14, count * 14 + 14).map((f) => f.wipe);
      expect(wipes.every((w, i) => !i || w > wipes[i - 1])).toBe(true);
      expect(wipes.at(-1)).toBe(1);
    }
    expect(wipePath(0.25)).toMatch(/A900 900 0 0 1/);
    expect(wipePath(0.75)).toMatch(/A900 900 0 1 1/);
    const phases = Array.from(
      { length: RUBBER_HOSE_DRAWINGS },
      (_, d) => rubberHoseDrawingState(d / DRAWING_RATE).phase,
    );
    expect(phases.filter((p) => p === "house")).toHaveLength(11);
    expect(phases.filter((p) => p === "leader")).toHaveLength(21);
    expect(phases.slice(-4)).toEqual(["settle", "settle", "settle", "settle"]);
  });

  it("weaves the whole plate, adds film wear and keeps exposure flashes at three per second or fewer", () => {
    const film = Array.from({ length: RUBBER_HOSE_FILM_FRAMES }, (_, f) =>
      rubberHoseFilmState(f / FILM_RATE),
    );
    const flashes = film.filter((f) => f.leader.exposure > 0).map((f) => f.frame);
    expect(flashes).toEqual([22, 36, 50]);
    for (const frame of flashes)
      expect(flashes.filter((f) => f >= frame && f < frame + FILM_RATE).length).toBeLessThanOrEqual(
        3,
      );
    expect(new Set(film.map((f) => f.weave.join(","))).size).toBeGreaterThan(40);
    expect(film.some((f) => f.scratches.some((s) => s.visible))).toBe(true);
    expect(film.some((f) => f.dust.some((d) => d.visible))).toBe(true);
    const leaderGrain = film.filter((f) => f.leader.active).map((f) => f.grain);
    expect(Math.min(...leaderGrain)).toBeGreaterThan(film[0].grain);
  });
});

function runComposition(html: string) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const elements = new Map<string, Record<string, string>>();
  const document = {
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, {});
      const attrs = elements.get(id)!;
      return {
        setAttribute: (key: string, value: string) => (attrs[key] = value),
        set textContent(value: string) {
          attrs["#text"] = value;
        },
      };
    },
  };
  const window: { __timelines?: Record<string, gsap.core.Timeline> } = {};
  vm.runInNewContext(script, { gsap, document, window, Math });
  const timeline = window.__timelines![RUBBER_HOSE_COMPOSITION_ID];
  return (time: number) => {
    timeline.seek(time, false);
    return JSON.stringify([...elements.entries()].sort());
  };
}

describe("Vintage Rubber Hose Animation sample composition", () => {
  it("follows the HyperFrames contract with one paused timeline and no runtime clocks", () => {
    const html = rubberHosePreviewHtml();
    expect(RUBBER_HOSE_COMPOSITION_ID).toBe("vintage-rubber-hose-house-leader");
    expect(html).toContain(`data-composition-id="${RUBBER_HOSE_COMPOSITION_ID}"`);
    expect(html).toContain('data-duration="3"');
    expect(html.match(/gsap\.timeline\(/g)).toHaveLength(1);
    expect(html).toContain("paused:true");
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

  it("reproduces identical states for forward, backward and fresh direct seeks", () => {
    const html = rubberHosePreviewHtml();
    const times = Array.from({ length: 91 }, (_, frame) => frame / 30);
    const live = runComposition(html);
    const forward = times.map(live);
    const backward = [...times].reverse().map(live).reverse();
    expect(backward).toEqual(forward);
    for (const index of [0, 10, 28, 33, 45, 60, 75, 82, 90])
      expect(runComposition(html)(times[index]), `t=${times[index]}`).toBe(forward[index]);
    expect(new Set(forward).size).toBeGreaterThan(60);
  });
});
