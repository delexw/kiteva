import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/server/catalog/catalog";
import { seeded } from "../src/shared/seeded-random";
import {
  examplesFolder,
  publishExample,
  readExampleRecords,
  validateExamplePalette,
  writeExampleRecords,
} from "../src/server/catalog/style-examples";

/**
 * Pixel RPG Quest Explainer (style-141) catalog sample. Original code-drawn pixel artwork
 * on one 4 px logical grid. A three-second slice of an imagined explainer: a cream quest-map
 * chapter card (stage 3 of an invented course) cuts through a diamond-lattice pixel wipe to a
 * dark-grid mechanism scene. One concept resolves (a key is hashed straight to its bucket),
 * and only then does progression move: the collectible counter goes from x02 to x03 and the
 * third skill slot unlocks in the inventory, while the guide reacts. Tying the counter step
 * to the resolved concept is an authored preview choice; the source counter was never seen
 * changing on a visible event. The static SVG and the
 * HyperFrames composition share one builder; every changing attribute comes from a pure
 * per-frame time state. The topic and layout are sample content, not requirements.
 */
export const PIXEL_QUEST_STYLE_ID = "style-141";
export const PIXEL_QUEST_COMPOSITION_ID = "pixel-rpg-quest-explainer";
export const PIXEL_QUEST_DURATION = 3;
export const PIXEL_QUEST_FPS = 30;
export const PIXEL_QUEST_FRAMES = PIXEL_QUEST_DURATION * PIXEL_QUEST_FPS;
export const PIXEL_QUEST_AUTHOR_MODEL = "claude-opus-5-5";
/** One logical pixel in output pixels: every coordinate and size is a multiple of this. */
export const PX = 4;
const W = 1280;
const H = 720;

export const pixelQuestColors = {
  night_grid: "#1C1F2E",
  grid_line: "#272B3F",
  plate_ink: "#11121B",
  cream: "#F4EEDC",
  paper_cream: "#F2EAD3",
  paper_speck: "#DCCFAD",
  quest_orange: "#F28A2E",
  coin_yellow: "#F7C948",
  heart_red: "#E5484D",
  xp_green: "#5DC26A",
  slot_teal: "#3DB3A6",
  path_grey: "#8D90A6",
  tree_green: "#3A8F52",
} as const;
const C = pixelQuestColors;

/**
 * The ordered concept list is the single source of truth for every progress value.
 * Two concepts were resolved before this slice; the third resolves on screen.
 */
export const questConcepts = [
  { skill: "ARRAY", resolvedAt: -Infinity },
  { skill: "LOOP", resolvedAt: -Infinity },
  { skill: "HASH", resolvedAt: 2.1 },
] as const;
export const INVENTORY_SLOTS = 4;

export const pixelQuestCopy = {
  stageTag: "STAGE 3",
  stageTitle: "HASH LOOKUP",
  captionMap: { text: "NEXT UP: FIND ANY KEY IN ONE HOP", keyword: "ONE HOP" },
  captionLookup: { text: "HASH THE KEY, JUMP RIGHT TO ITS BUCKET", keyword: "BUCKET" },
  keyLabel: "KEY",
  keyValue: '"CAT"',
  hashLabel: "HASH()",
  hashOutput: "= 3",
  inventoryHeader: "SKILLS",
  found: "FOUND: MEOW",
  plusOne: "+1",
  guideBubble: "ONE HOP!",
  bucketIndexes: ["0", "1", "2", "3", "4", "5"],
} as const;

export const pixelQuestCues = {
  stageCard: 0.1,
  captionMap: { start: 0.14, end: 0.5 },
  wipe: { start: 1.15, mid: 1.25, end: 1.35 },
  captionLookup: { start: 1.3, end: 1.8 },
  arrow1: { start: 1.36, end: 1.52 },
  hashOutput: 1.54,
  arrow2: { start: 1.58, end: 1.84 },
  bucketOutline: 1.86,
  bucketFill: 1.94,
  found: 1.98,
  resolve: questConcepts[2].resolvedAt,
  unlockFlash: 0.1,
  hop: { start: 2.1, end: 2.3 },
  plusOne: { start: 2.1, end: 2.5 },
} as const;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const progress = (time: number, start: number, end: number) =>
  clamp((time - start) / (end - start));
/** Snap to the logical grid (down). */
export const snap = (value: number) => Math.floor(value / PX + 1e-9) * PX;

/** Collectible counter, inventory and map progress all come from the concept list. */
export function resolvedConcepts(time: number) {
  return questConcepts.filter((concept) => time >= concept.resolvedAt).length;
}

/** Characters typed into a pre-sized dialogue plate (Terminal Typing). */
export function typedCount(text: string, time: number, window: { start: number; end: number }) {
  return Math.round(progress(time, window.start, window.end) * text.length);
}

// ---------------------------------------------------------------------------
// Bitmap font: 5 × 7 uppercase glyphs, one logical pixel per cell, 6-cell advance
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ":": [".....", "..#..", "..#..", ".....", "..#..", "..#..", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", "..#..", "..#.."],
  ",": [".....", ".....", ".....", ".....", "..#..", "..#..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  '"': [".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."],
};
export const GLYPH_CHARACTERS = Object.keys(GLYPHS).join("");
const ADVANCE = 6;
const GLYPH_HEIGHT = 7;

/** Width in output pixels of a bitmap string at `scale` output pixels per glyph cell. */
export function textWidth(text: string, scale = PX) {
  return text.length === 0 ? 0 : (text.length * ADVANCE - 1) * scale;
}

/** Run-length path of lit glyph cells; `keep(i)` selects which characters to draw. */
export function bitmapPath(
  text: string,
  x: number,
  y: number,
  scale = PX,
  keep: (index: number) => boolean = () => true,
) {
  let d = "";
  [...text].forEach((character, index) => {
    if (!keep(index)) return;
    const glyph = GLYPHS[character];
    if (!glyph) throw Error(`No pixel glyph for ${JSON.stringify(character)}`);
    glyph.forEach((row, rowIndex) => {
      let run = -1;
      for (let col = 0; col <= row.length; col++) {
        const lit = row[col] === "#";
        if (lit && run < 0) run = col;
        if (!lit && run >= 0) {
          const left = x + (index * ADVANCE + run) * scale;
          d += `M${left} ${y + rowIndex * scale}h${(col - run) * scale}v${scale}h-${(col - run) * scale}z`;
          run = -1;
        }
      }
    });
  });
  return d;
}

// ---------------------------------------------------------------------------
// Sprites: string maps on the logical grid
// ---------------------------------------------------------------------------

const SPRITE_COLORS: Record<string, string> = {
  k: C.plate_ink,
  c: C.cream,
  o: C.quest_orange,
  y: C.coin_yellow,
  r: C.heart_red,
  g: C.xp_green,
  t: C.slot_teal,
  s: C.path_grey,
  G: C.tree_green,
};
export const sprites = {
  guideIdle: [
    ".......yy.......",
    ".......yy.......",
    "........k.......",
    "...kkkkkkkkkk...",
    "..kcccccccccck..",
    "..kckkkkkkkkck..",
    "..kckykkkkykck..",
    "..kckkkkkkkkck..",
    "..kcccccccccck..",
    "...kkkkkkkkkk...",
    "....kttttttk....",
    "...kttcccctk....",
    "..kkttcoocttkk..",
    ".k.kttcccctk.k..",
    ".k..kttttttk.k..",
    "....kttttttk....",
    "....kk....kk....",
    "...kkk....kkk...",
  ],
  guideCheer: [
    ".......yy.......",
    ".......yy.......",
    "........k.......",
    "...kkkkkkkkkk...",
    "..kcccccccccck..",
    "..kckykkkkykck..",
    "..kcykykkykyck..",
    "..kckkkkkkkkck..",
    "..kcccccccccck..",
    ".k.kkkkkkkkkk.k.",
    ".k..kttttttk..k.",
    "..kkttcccctkkk..",
    "...kttcoocttk...",
    "...kttcccctk....",
    "....kttttttk....",
    "....kttttttk....",
    "....kk....kk....",
    "...kkk....kkk...",
  ],
  heart: [".rr.rr.", "rcrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."],
  coin: [".yyyy.", "yyyyyy", "yykkyy", "yykkyy", "yyyyyy", ".yyyy."],
  key: [".yyy........", "yk.ky.......", "y...yyyyyyyy", "yk.ky...y.yy", ".yyy....y.y."],
  gem: ["..yy..", ".ycyy.", "yyyyyy", ".yyyy.", "..yy.."],
  skillArray: [
    "............",
    "............",
    "ttt.ttt.ttt.",
    "ttt.ttt.ttt.",
    "ttt.ttt.ttt.",
    "............",
    "ttt.ooo.ttt.",
    "ttt.ooo.ttt.",
    "ttt.ooo.ttt.",
    "............",
  ],
  skillLoop: [
    "............",
    "...gggggg...",
    "..gg....gg..",
    ".gg......gg.",
    ".g......gggg",
    ".g.......gg.",
    ".g..........",
    ".gg......g..",
    "..gg....gg..",
    "...gggggg...",
  ],
  skillHash: [
    "...o...o....",
    "...o...o....",
    ".ooooooooo..",
    "...o...o....",
    "..o...o.....",
    "..o...o.....",
    ".ooooooooo..",
    "..o...o.....",
    "..o...o.....",
    "............",
  ],
  tree: [
    "...G...",
    "..GGG..",
    ".GGgGG.",
    "..GGG..",
    ".GGGGG.",
    "GGgGGGG",
    ".GGGGG.",
    "...k...",
    "...k...",
  ],
  castle: [
    "..o.........o...",
    "..oo........oo..",
    "..k.........k...",
    ".sss.......sss..",
    ".sss.s.s.s.sss..",
    ".sssssssssssss..",
    ".sksssssssssks..",
    ".sssssssssssss..",
    ".sssssskssssss..",
    ".ssssskkksssss..",
    ".ssssskkksssss..",
    ".ssssskkksssss..",
  ],
  check: ["......g", ".....gg", "g...gg.", "gg.gg..", ".ggg...", "..g...."],
  arrowRight: ["o...", "oo..", "ooo.", "oooo", "ooo.", "oo..", "o..."],
  arrowDown: ["ooooooo", ".ooooo.", "..ooo..", "...o..."],
} as const;

/** One run-length path per colour; x, y and scale are output pixels on the grid. */
export function spritePaths(map: readonly string[], x: number, y: number, scale = PX) {
  const byColor: Record<string, string> = {};
  map.forEach((row, rowIndex) => {
    let run = -1;
    for (let col = 0; col <= row.length; col++) {
      const key = row[col];
      const startKey = run >= 0 ? row[run] : undefined;
      if (run >= 0 && key !== startKey) {
        const color = SPRITE_COLORS[startKey!];
        byColor[color] =
          (byColor[color] || "") +
          `M${x + run * scale} ${y + rowIndex * scale}h${(col - run) * scale}v${scale}h-${(col - run) * scale}z`;
        run = -1;
      }
      if (run < 0 && key && key !== ".") run = col;
    }
  });
  return Object.entries(byColor)
    .map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Layout (output pixels, all multiples of PX)
// ---------------------------------------------------------------------------

export const layout = {
  hud: { x: 904, y: 24, w: 296, h: 48 },
  counter: { x: 1068, y: 32 },
  plusOne: { x: 1068, y: 96 },
  keyCard: { x: 64, y: 196, w: 224, h: 128 },
  hashBox: { x: 400, y: 196, w: 208, h: 128 },
  buckets: { x: 720, y: 184, w: 72, h: 112, pitch: 80, target: 3 },
  found: { y: 360, h: 44 },
  inventory: { x: 48, y: 436, w: 552, h: 176, slotY: 484, slotX: 80, slot: 72, pitch: 136 },
  // The guide stands on the current node (3); the map itself is a held, completed card.
  guideMap: { x: 412, y: 420 },
  guideLookup: { x: 1112, y: 492 },
  plateY: 628,
  plateH: 52,
  arrow1: { y: 256, x0: 296, x1: 376 },
  arrow2: [
    [500, 184],
    [500, 140],
    [996, 140],
    [996, 160],
  ] as const,
} as const;

const plateFor = (text: string) => {
  const width = textWidth(text) + 64;
  const x = snap(W / 2 - width / 2);
  return { x, w: width, textX: x + 32, textY: layout.plateY + 12 };
};

/** Dots of an orthogonal pixel connector: 8 px squares every 16 px along the polyline. */
export function connectorDots(points: readonly (readonly [number, number])[]) {
  const dots: [number, number][] = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const length = Math.abs(bx - ax) + Math.abs(by - ay);
    for (let d = i === 1 ? 0 : 16; d <= length; d += 16)
      dots.push([ax + Math.sign(bx - ax) * d - 4, ay + Math.sign(by - ay) * d - 4]);
  }
  return dots;
}
const ARROW1_DOTS = connectorDots([
  [layout.arrow1.x0, layout.arrow1.y + 4],
  [layout.arrow1.x1, layout.arrow1.y + 4],
]);
const ARROW2_DOTS = connectorDots(layout.arrow2);
export const arrowDotCounts = { arrow1: ARROW1_DOTS.length, arrow2: ARROW2_DOTS.length };
const dotsPath = (dots: [number, number][]) =>
  dots.map(([x, y]) => `M${x} ${y}h8v8h-8z`).join("") || "M0 0";

/** Diamond-lattice pixel wipe: half-diagonal grows left to right, then shrinks, in 4 px steps. */
export function wipeRadius(time: number, column: number) {
  const { start, mid, end } = pixelQuestCues.wipe;
  const delay = (column / 20) * 0.04;
  if (time < start || time >= end) return 0;
  const cover = progress(time, start + delay, mid);
  const reveal = progress(time, mid + delay, end);
  const r = time < mid + delay ? 36 * cover : 36 * (1 - reveal);
  return snap(r);
}
export function wipePath(time: number) {
  let d = "";
  for (let row = 0; row <= 23; row++)
    for (let col = -1; col <= 20; col++) {
      const cx = col * 64 + (row % 2 ? 32 : 0);
      const cy = row * 32;
      const r = wipeRadius(time, Math.max(0, col));
      if (r > 0) d += `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}z`;
    }
  return d || "M0 0";
}

// ---------------------------------------------------------------------------
// Time state (pure; no DOM, no clocks)
// ---------------------------------------------------------------------------

export function pixelQuestFrame(time: number) {
  return Math.max(0, Math.min(PIXEL_QUEST_FRAMES - 1, Math.floor(time * PIXEL_QUEST_FPS + 1e-4)));
}

export function pixelQuestState(time: number) {
  const t = Math.max(0, Math.min(PIXEL_QUEST_DURATION, time));
  const cue = pixelQuestCues;
  const resolved = resolvedConcepts(t);
  const arrow1 = Math.round(progress(t, cue.arrow1.start, cue.arrow1.end) * ARROW1_DOTS.length);
  const arrow2 = Math.round(progress(t, cue.arrow2.start, cue.arrow2.end) * ARROW2_DOTS.length);
  const hop = progress(t, cue.hop.start, cue.hop.end);
  // Two-step whole-pixel hop: up 8 px, up 16 px, then back down.
  const hopOffset = hop <= 0 || hop >= 1 ? 0 : hop < 0.25 ? -8 : hop < 0.75 ? -16 : -8;
  const plus = progress(t, cue.plusOne.start, cue.plusOne.end);
  return {
    time: t,
    scene: t < cue.wipe.mid ? ("map" as const) : ("lookup" as const),
    stageCard: t >= cue.stageCard,
    captionMap: typedCount(pixelQuestCopy.captionMap.text, t, cue.captionMap),
    captionLookup: typedCount(pixelQuestCopy.captionLookup.text, t, cue.captionLookup),
    wipe: t >= cue.wipe.start && t < cue.wipe.end,
    arrow1,
    head1: arrow1 === ARROW1_DOTS.length,
    hashOutput: t >= cue.hashOutput,
    arrow2,
    head2: arrow2 === ARROW2_DOTS.length,
    bucket:
      t >= cue.bucketFill
        ? ("filled" as const)
        : t >= cue.bucketOutline
          ? ("outline" as const)
          : ("idle" as const),
    found: t >= cue.found,
    resolved,
    counter: resolved,
    skillsUnlocked: resolved,
    unlockFlash: t >= cue.resolve && t < cue.resolve + cue.unlockFlash,
    plusOne: plus > 0 && plus < 1 ? { dy: plus < 0.3 ? 0 : plus < 0.6 ? -8 : -16 } : null,
    guideCheer: t >= cue.resolve,
    guideOffset: hopOffset,
    runtimePx: snap((t / PIXEL_QUEST_DURATION) * W),
  };
}
export type PixelQuestState = ReturnType<typeof pixelQuestState>;

// ---------------------------------------------------------------------------
// Attribute patches: the single bridge between state and drawing
// ---------------------------------------------------------------------------

type Patch = Record<string, Record<string, string>>;
const shown = (visible: boolean) => (visible ? "inline" : "none");
const counterText = (count: number) => `x${String(count).padStart(2, "0")}`;

export function pixelQuestPatch(state: PixelQuestState): Patch {
  const mapPlate = plateFor(pixelQuestCopy.captionMap.text);
  const lookupPlate = plateFor(pixelQuestCopy.captionLookup.text);
  const typed = (count: number, total: number) => ({
    width: String(count * ADVANCE * PX),
    cursor: count > 0 && count < total,
  });
  const capA = typed(state.captionMap, pixelQuestCopy.captionMap.text.length);
  const capB = typed(state.captionLookup, pixelQuestCopy.captionLookup.text.length);
  const plusX = layout.plusOne.x;
  return {
    "pq-runtime-fill": { width: String(state.runtimePx) },
    "pq-scene-map": { display: shown(state.scene === "map") },
    "pq-scene-lookup": { display: shown(state.scene === "lookup") },
    "pq-stage-card": { display: shown(state.stageCard) },
    "pq-cap-map-reveal": { width: capA.width },
    "pq-cap-map-cursor": {
      x: String(mapPlate.textX + state.captionMap * ADVANCE * PX),
      display: shown(capA.cursor),
    },
    "pq-cap-lookup-reveal": { width: capB.width },
    "pq-cap-lookup-cursor": {
      x: String(lookupPlate.textX + state.captionLookup * ADVANCE * PX),
      display: shown(capB.cursor),
    },
    "pq-wipe": { d: state.wipe ? wipePath(state.time) : "M0 0", display: shown(state.wipe) },
    "pq-arrow1-shaft": { d: dotsPath(ARROW1_DOTS.slice(0, state.arrow1)) },
    "pq-arrow1-head": { display: shown(state.head1) },
    "pq-hash-output": { display: shown(state.hashOutput) },
    "pq-arrow2-shaft": { d: dotsPath(ARROW2_DOTS.slice(0, state.arrow2)) },
    "pq-arrow2-head": { display: shown(state.head2) },
    "pq-bucket-outline": { display: shown(state.bucket !== "idle") },
    "pq-bucket-fill": { display: shown(state.bucket === "filled") },
    "pq-found": { display: shown(state.found) },
    "pq-counter": { d: bitmapPath(counterText(state.counter), layout.counter.x, layout.counter.y) },
    "pq-skill-count": {
      d: bitmapPath(
        `${state.skillsUnlocked}/${INVENTORY_SLOTS}`,
        layout.inventory.x + 16 + textWidth(pixelQuestCopy.inventoryHeader) + 24,
        layout.inventory.y + 12,
      ),
    },
    "pq-skill-3": { display: shown(state.skillsUnlocked >= 3) },
    "pq-skill-3-empty": { display: shown(state.skillsUnlocked < 3) },
    "pq-skill-3-flash": { display: shown(state.unlockFlash) },
    "pq-plus-one": {
      display: shown(state.plusOne !== null),
      transform: `translate(0 ${state.plusOne?.dy ?? 0})`,
    },
    "pq-guide-lookup": { transform: `translate(0 ${state.guideOffset})` },
    "pq-bubble": { display: shown(state.guideCheer) },
    "pq-guide-idle": { display: shown(!state.guideCheer) },
    "pq-guide-cheer": { display: shown(state.guideCheer) },
    "pq-plus-one-text": { d: bitmapPath(pixelQuestCopy.plusOne, plusX, layout.plusOne.y) },
  };
}

/** Complete (not incremental) patches for every 30 fps frame, so any seek is independent. */
export function pixelQuestPatches() {
  return Array.from({ length: PIXEL_QUEST_FRAMES }, (_, frame) =>
    pixelQuestPatch(pixelQuestState(frame / PIXEL_QUEST_FPS)),
  );
}

// ---------------------------------------------------------------------------
// SVG drawing
// ---------------------------------------------------------------------------

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
type Attrs = Record<string, string | number | undefined>;
const attrs = (values: Attrs) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${escapeXml(String(value))}"`)
    .join(" ");

function drawing(patch: Patch) {
  return (tag: string, values: Attrs, children = "") => {
    const id = values.id === undefined ? undefined : String(values.id);
    const merged: Attrs = { ...values };
    for (const [key, value] of Object.entries((id && patch[id]) || {})) merged[key] = value;
    return children || tag === "g"
      ? `<${tag} ${attrs(merged)}>${children}</${tag}>`
      : `<${tag} ${attrs(merged)}/>`;
  };
}
type El = ReturnType<typeof drawing>;
const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

/** Stepped pixel frame: a 4 px border with notched corners, like a dialogue box. */
function pixelFrame(x: number, y: number, w: number, h: number, fill: string, border: string) {
  return (
    rect(x + PX, y, w - 2 * PX, h, border) +
    rect(x, y + PX, w, h - 2 * PX, border) +
    rect(x + PX, y + PX, w - 2 * PX, h - 2 * PX, fill)
  );
}

function hud(el: El) {
  const { x, y, w, h } = layout.hud;
  const hearts = [0, 1, 2].map((i) => spritePaths(sprites.heart, x + 20 + i * 32, y + 12)).join("");
  return (
    `<g id="pq-hud">` +
    rect(0, 0, W, 8, C.plate_ink) +
    el("rect", { id: "pq-runtime-fill", x: 0, y: 0, width: 0, height: 8, fill: C.xp_green }) +
    pixelFrame(x, y, w, h, C.plate_ink, C.cream) +
    hearts +
    rect(x + 124, y + 12, PX, 24, C.path_grey) +
    spritePaths(sprites.coin, x + 140, y + 12) +
    el("path", { id: "pq-counter", fill: C.coin_yellow, d: "M0 0" }) +
    el(
      "g",
      { id: "pq-plus-one", display: "none" },
      el("path", { id: "pq-plus-one-text", fill: C.coin_yellow, d: "M0 0" }),
    ) +
    `</g>`
  );
}

function brackets() {
  const inset = 24;
  const arm = 40;
  const color = C.path_grey;
  const corner = (cx: number, cy: number, sx: number, sy: number) =>
    rect(sx > 0 ? cx : cx - arm, cy - (sy > 0 ? 0 : PX), arm, PX, color) +
    rect(cx - (sx > 0 ? 0 : PX), sy > 0 ? cy : cy - arm, PX, arm, color);
  return (
    `<g id="pq-brackets">` +
    corner(inset, inset + 16, 1, 1) +
    corner(W - inset, inset + 16, -1, 1) +
    corner(inset, H - inset, 1, -1) +
    corner(W - inset, H - inset, -1, -1) +
    `</g>`
  );
}

function dialoguePlate(
  el: El,
  id: string,
  caption: { text: string; keyword: string },
  defsOut: string[],
) {
  const plate = plateFor(caption.text);
  const start = caption.text.indexOf(caption.keyword);
  const isKeyword = (i: number) => i >= start && i < start + caption.keyword.length;
  defsOut.push(
    `<clipPath id="${id}-clip">${el("rect", {
      id: `${id}-reveal`,
      x: plate.textX,
      y: plate.textY - PX,
      width: 0,
      height: GLYPH_HEIGHT * PX + 2 * PX,
    })}</clipPath>`,
  );
  return (
    pixelFrame(plate.x, layout.plateY, plate.w, layout.plateH, C.plate_ink, C.cream) +
    rect(plate.x - 2 * PX, layout.plateY + 12, 2 * PX, 28, C.quest_orange) +
    rect(plate.x + plate.w, layout.plateY + 12, 2 * PX, 28, C.quest_orange) +
    `<g clip-path="url(#${id}-clip)">` +
    `<path fill="${C.cream}" d="${bitmapPath(caption.text, plate.textX, plate.textY, PX, (i) => !isKeyword(i))}"/>` +
    `<path fill="${C.quest_orange}" d="${bitmapPath(caption.text, plate.textX, plate.textY, PX, isKeyword)}"/>` +
    `</g>` +
    el("rect", {
      id: `${id}-cursor`,
      x: plate.textX,
      y: plate.textY,
      width: 4 * PX,
      height: GLYPH_HEIGHT * PX,
      fill: C.quest_orange,
      display: "none",
    })
  );
}

const MAP_NODES: [number, number][] = [
  [124, 516],
  [284, 436],
  [444, 516],
  [636, 436],
  [812, 516],
  [988, 436],
];
const CASTLE = { x: 1072, y: 296, scale: 8 };
const MAP_CLEARED = 2;

function mapScene(el: El, defsOut: string[]) {
  const random = seeded(14101);
  const blocked = (x: number, y: number) =>
    (y > 112 && y < 284 && x > 316 && x < 964) || y > 600 || y < 88 || (x > 920 && y < 90);
  let specks = "";
  for (let i = 0; i < 140; i++) {
    const x = snap(32 + random() * 1216);
    const y = snap(96 + random() * 512);
    if (!blocked(x, y)) specks += `M${x} ${y}h4v4h-4z`;
  }
  const nearPath = (x: number, y: number) =>
    MAP_NODES.some(([nx, ny]) => Math.abs(nx - x) < 96 && Math.abs(ny - y) < 96) ||
    (x > CASTLE.x - 48 && y > CASTLE.y - 48 && y < CASTLE.y + 160);
  let trees = "";
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 10; col++) {
      const x = snap(64 + col * 120 + random() * 56);
      const y = snap(312 + row * 72 + random() * 24);
      if (y > 560 || nearPath(x + 14, y + 18) || blocked(x, y) || random() < 0.35) continue;
      trees += spritePaths(sprites.tree, x, y);
    }
  for (const [x, y] of [
    [72, 136],
    [208, 104],
    [1004, 184],
    [168, 216],
    [1180, 476],
    [1028, 560],
  ])
    trees += spritePaths(sprites.tree, x, y);
  // Path: cleared segments in the completion colour, the rest muted. The map is a held card.
  let path = "";
  const points: [number, number][] = [...MAP_NODES, [CASTLE.x + 52, CASTLE.y + 96]];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const steps = Math.floor(Math.hypot(bx - ax, by - ay) / 20);
    let d = "";
    for (let s = 2; s < steps - 1; s++) {
      const x = snap(ax + ((bx - ax) * s) / steps);
      const y = snap(ay + ((by - ay) * s) / steps);
      d += `M${x - 4} ${y - 4}h8v8h-8z`;
    }
    path += `<path fill="${i <= MAP_CLEARED ? C.quest_orange : C.path_grey}" d="${d}"/>`;
  }
  const nodes = MAP_NODES.map(([x, y], index) => {
    const number = String(index + 1);
    const fill =
      index < MAP_CLEARED ? C.quest_orange : index === MAP_CLEARED ? C.coin_yellow : C.cream;
    return (
      pixelFrame(x - 24, y - 24, 48, 48, fill, C.plate_ink) +
      `<path fill="${C.plate_ink}" d="${bitmapPath(number, x - 8, y - 12)}"/>`
    );
  }).join("");
  const card = { x: 344, y: 128, w: 592, h: 140 };
  const stageCard = el(
    "g",
    { id: "pq-stage-card", display: "none" },
    pixelFrame(card.x, card.y, card.w, card.h, C.plate_ink, C.cream) +
      rect(card.x - 2 * PX, card.y + 52, 2 * PX, 36, C.quest_orange) +
      rect(card.x + card.w, card.y + 52, 2 * PX, 36, C.quest_orange) +
      `<path fill="${C.quest_orange}" d="${bitmapPath(pixelQuestCopy.stageTag, snap(W / 2 - textWidth(pixelQuestCopy.stageTag) / 2), card.y + 20)}"/>` +
      `<path fill="${C.cream}" d="${bitmapPath(pixelQuestCopy.stageTitle, snap(W / 2 - textWidth(pixelQuestCopy.stageTitle, 8) / 2), card.y + 68, 8)}"/>`,
  );
  return el(
    "g",
    { id: "pq-scene-map" },
    rect(0, 0, W, H, C.paper_cream) +
      `<path fill="${C.paper_speck}" d="${specks}"/>` +
      trees +
      path +
      spritePaths(sprites.castle, CASTLE.x, CASTLE.y, CASTLE.scale) +
      nodes +
      spritePaths(sprites.guideIdle, layout.guideMap.x, layout.guideMap.y) +
      stageCard +
      dialoguePlate(el, "pq-cap-map", pixelQuestCopy.captionMap, defsOut),
  );
}

function lookupScene(el: El, defsOut: string[]) {
  const { keyCard, hashBox, buckets, inventory } = layout;
  const label = (text: string, x: number, y: number, fill: string = C.cream, scale = PX) =>
    `<path fill="${fill}" d="${bitmapPath(text, x, y, scale)}"/>`;
  const stagePlate =
    pixelFrame(80, 28, 504, 44, C.plate_ink, C.path_grey) +
    label(pixelQuestCopy.stageTag, 96, 36, C.quest_orange) +
    label(pixelQuestCopy.stageTitle, 96 + textWidth(pixelQuestCopy.stageTag) + 28, 36);
  const keyCardSvg =
    pixelFrame(keyCard.x, keyCard.y, keyCard.w, keyCard.h, C.plate_ink, C.slot_teal) +
    label(pixelQuestCopy.keyLabel, keyCard.x + 20, keyCard.y + 16, C.slot_teal) +
    spritePaths(sprites.key, keyCard.x + 20, keyCard.y + 68) +
    label(pixelQuestCopy.keyValue, keyCard.x + 84, keyCard.y + 68);
  const hashSvg =
    pixelFrame(hashBox.x, hashBox.y, hashBox.w, hashBox.h, C.plate_ink, C.quest_orange) +
    label(pixelQuestCopy.hashLabel, hashBox.x + 20, hashBox.y + 16, C.quest_orange) +
    el(
      "g",
      { id: "pq-hash-output", display: "none" },
      label(pixelQuestCopy.hashOutput, hashBox.x + 36, hashBox.y + 56, C.cream, 8),
    );
  const stored: Record<number, string[]> = {
    0: [C.slot_teal],
    2: [C.heart_red, C.slot_teal],
    4: [C.xp_green],
    5: [C.heart_red, C.xp_green, C.slot_teal],
  };
  // Solid strip under the index digits keeps grid lines out of the letterforms.
  let bucketSvg = rect(buckets.x, buckets.y + buckets.h + 4, 6 * buckets.pitch, 44, C.night_grid);
  for (let i = 0; i < 6; i++) {
    const bx = buckets.x + i * buckets.pitch;
    bucketSvg +=
      pixelFrame(bx, buckets.y, buckets.w, buckets.h, C.plate_ink, C.path_grey) +
      (stored[i] || [])
        .map((fill, k) =>
          rect(bx + 16 + (k % 2) * 24, buckets.y + 72 - Math.floor(k / 2) * 24, 16, 16, fill),
        )
        .join("") +
      label(
        pixelQuestCopy.bucketIndexes[i],
        bx + buckets.w / 2 - 8,
        buckets.y + buckets.h + 12,
        C.path_grey,
      );
  }
  const tx = buckets.x + buckets.target * buckets.pitch;
  const bucketTarget =
    el(
      "g",
      { id: "pq-bucket-outline", display: "none" },
      pixelFrame(
        tx - PX,
        buckets.y - PX,
        buckets.w + 2 * PX,
        buckets.h + 2 * PX,
        C.plate_ink,
        C.cream,
      ),
    ) +
    el(
      "g",
      { id: "pq-bucket-fill", display: "none" },
      rect(tx + 8, buckets.y + 8, buckets.w - 16, buckets.h - 16, C.quest_orange) +
        spritePaths(sprites.gem, tx + 24, buckets.y + 36),
    );
  const foundText = pixelQuestCopy.found;
  const foundW = textWidth(foundText) + 72;
  const foundX = snap(tx + buckets.w / 2 - foundW / 2);
  const found = el(
    "g",
    { id: "pq-found", display: "none" },
    pixelFrame(foundX, layout.found.y, foundW, layout.found.h, C.plate_ink, C.xp_green) +
      spritePaths(sprites.check, foundX + 16, layout.found.y + 8) +
      label(foundText, foundX + 52, layout.found.y + 8, C.xp_green),
  );
  const arrows =
    el("path", { id: "pq-arrow1-shaft", fill: C.quest_orange, d: "M0 0" }) +
    el(
      "g",
      { id: "pq-arrow1-head", display: "none", "data-arrowhead-for": "pq-arrow1-shaft" },
      spritePaths(sprites.arrowRight, layout.arrow1.x1 + 8, layout.arrow1.y - 8),
    ) +
    el("path", { id: "pq-arrow2-shaft", fill: C.quest_orange, d: "M0 0" }) +
    el(
      "g",
      { id: "pq-arrow2-head", display: "none", "data-arrowhead-for": "pq-arrow2-shaft" },
      spritePaths(sprites.arrowDown, layout.arrow2[3][0] - 12, layout.arrow2[3][1] + 8),
    );
  // Skill inventory: filled slots for resolved concepts, the next slot locked, the last empty.
  const icons = [sprites.skillArray, sprites.skillLoop, sprites.skillHash];
  let slots = "";
  for (let i = 0; i < INVENTORY_SLOTS; i++) {
    const sx = inventory.slotX + i * inventory.pitch;
    const filled = i < 2;
    const border = filled ? C.coin_yellow : C.path_grey;
    const slotFrame = pixelFrame(
      sx,
      inventory.slotY,
      inventory.slot,
      inventory.slot,
      C.plate_ink,
      border,
    );
    const skill = questConcepts[i]?.skill;
    const labelSvg = skill
      ? label(
          skill,
          snap(sx + inventory.slot / 2 - textWidth(skill) / 2),
          inventory.slotY + inventory.slot + 12,
        )
      : "";
    const icon = icons[i] ? spritePaths(icons[i], sx + 12, inventory.slotY + 16) : "";
    const empty = label("?", sx + 24, inventory.slotY + 20, C.path_grey);
    if (filled) slots += slotFrame + icon + labelSvg;
    else if (i === 2)
      slots +=
        el("g", { id: "pq-skill-3-empty" }, slotFrame + empty) +
        el(
          "g",
          { id: "pq-skill-3", display: "none" },
          pixelFrame(
            sx,
            inventory.slotY,
            inventory.slot,
            inventory.slot,
            C.plate_ink,
            C.coin_yellow,
          ) +
            icon +
            labelSvg,
        ) +
        el(
          "g",
          { id: "pq-skill-3-flash", display: "none" },
          // One brief cream ring two logical pixels outside the slot: a single unlock event.
          rect(sx - 3 * PX, inventory.slotY - 3 * PX, inventory.slot + 6 * PX, PX, C.cream) +
            rect(
              sx - 3 * PX,
              inventory.slotY + inventory.slot + 2 * PX,
              inventory.slot + 6 * PX,
              PX,
              C.cream,
            ) +
            rect(sx - 3 * PX, inventory.slotY - 2 * PX, PX, inventory.slot + 4 * PX, C.cream) +
            rect(
              sx + inventory.slot + 2 * PX,
              inventory.slotY - 2 * PX,
              PX,
              inventory.slot + 4 * PX,
              C.cream,
            ),
        );
    else slots += slotFrame + empty;
  }
  const inventorySvg =
    pixelFrame(inventory.x, inventory.y, inventory.w, inventory.h, C.night_grid, C.path_grey) +
    rect(inventory.x + PX, inventory.y + PX, inventory.w - 2 * PX, 40, C.plate_ink) +
    label(pixelQuestCopy.inventoryHeader, inventory.x + 16, inventory.y + 12, C.coin_yellow) +
    el("path", { id: "pq-skill-count", fill: C.cream, d: "M0 0" }) +
    slots;
  // The ground line stays put while the guide hops; the bubble and its words appear together.
  const bubbleText = pixelQuestCopy.guideBubble;
  const bubbleW = textWidth(bubbleText) + 32;
  const bubbleX = layout.guideLookup.x - 16 - bubbleW;
  const bubbleY = layout.guideLookup.y - 24;
  const guide =
    rect(layout.guideLookup.x - 8, layout.guideLookup.y + 72, 80, PX, C.path_grey) +
    el(
      "g",
      { id: "pq-bubble", display: "none" },
      pixelFrame(bubbleX, bubbleY, bubbleW, 44, C.cream, C.cream) +
        rect(bubbleX + bubbleW, bubbleY + 20, 8, 8, C.cream) +
        rect(bubbleX + bubbleW + 8, bubbleY + 24, 4, 4, C.cream) +
        label(bubbleText, bubbleX + 16, bubbleY + 8, C.plate_ink),
    ) +
    el(
      "g",
      { id: "pq-guide-lookup" },
      el(
        "g",
        { id: "pq-guide-idle" },
        spritePaths(sprites.guideIdle, layout.guideLookup.x, layout.guideLookup.y),
      ) +
        el(
          "g",
          { id: "pq-guide-cheer", display: "none" },
          spritePaths(sprites.guideCheer, layout.guideLookup.x, layout.guideLookup.y),
        ),
    );
  return el(
    "g",
    { id: "pq-scene-lookup", display: "none" },
    rect(0, 0, W, H, C.night_grid) +
      `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#pq-grid)"/>` +
      stagePlate +
      keyCardSvg +
      hashSvg +
      bucketSvg +
      bucketTarget +
      arrows +
      found +
      inventorySvg +
      guide +
      dialoguePlate(el, "pq-cap-lookup", pixelQuestCopy.captionLookup, defsOut),
  );
}

export function pixelQuestPreviewSvg(time = PIXEL_QUEST_DURATION) {
  const el = drawing(pixelQuestPatch(pixelQuestState(time)));
  const clipDefs: string[] = [];
  const map = mapScene(el, clipDefs);
  const lookup = lookupScene(el, clipDefs);
  const defs =
    `<defs>` +
    `<pattern id="pq-grid" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="4" fill="${C.grid_line}"/><rect width="4" height="32" fill="${C.grid_line}"/></pattern>` +
    clipDefs.join("") +
    `</defs>`;
  const wipe = el("path", { id: "pq-wipe", fill: C.plate_ink, d: "M0 0", display: "none" });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" role="img" aria-label="Pixel quest explainer: stage 3, hash lookup. Hash the key, jump right to its bucket; the third skill unlocks.">` +
    defs +
    rect(0, 0, W, H, C.night_grid) +
    map +
    lookup +
    wipe +
    brackets() +
    hud(el) +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// HyperFrames composition
// ---------------------------------------------------------------------------

export function pixelQuestPreviewHtml() {
  const patches = JSON.stringify(pixelQuestPatches()).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>html,body{margin:0;background:${C.night_grid}}svg{display:block;width:1280px;height:720px}</style></head><body><div data-composition-id="${PIXEL_QUEST_COMPOSITION_ID}" data-width="1280" data-height="720" data-duration="${PIXEL_QUEST_DURATION}" data-fps="${PIXEL_QUEST_FPS}" style="width:100%;height:100%">${pixelQuestPreviewSvg(0)}</div><script src="gsap.min.js"></script><script>
const FRAMES=${patches};
const nodes={};
const node=(id)=>nodes[id]||(nodes[id]=document.getElementById(id));
function applyFrame(frame){const patch=FRAMES[frame];for(const id in patch){const target=node(id);const values=patch[id];for(const key in values)target.setAttribute(key,values[key]);}}
const clock={time:0};
function render(time){applyFrame(Math.max(0,Math.min(${PIXEL_QUEST_FRAMES - 1},Math.floor(time*${PIXEL_QUEST_FPS}+1e-4))));}
const tl=gsap.timeline({paused:true});
tl.to(clock,{time:${PIXEL_QUEST_DURATION},duration:${PIXEL_QUEST_DURATION},ease:'none',onUpdate:()=>render(tl.time())},0);
render(0);
window.__timelines={'${PIXEL_QUEST_COMPOSITION_ID}':tl};
function onSeek(event){const time=event&&event.detail&&typeof event.detail.time==='number'?event.detail.time:tl.time();tl.seek(time,false);render(time);}
window.addEventListener('hf-seek',onSeek);
window.addEventListener('pagehide',()=>window.removeEventListener('hf-seek',onSeek),{once:true});
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

const designNotes =
  "Claude Opus 5.5 code-drawn Pixel RPG Quest Explainer sample on one 4 px logical grid with bitmap lettering. A cream quest-map chapter card (numbered nodes, two cleared orange path segments, pixel trees, a castle and an original lantern-bot guide standing on the current node 3) holds under a dark STAGE 3 plate while a caption types into a pre-sized dialogue plate. A diamond-lattice pixel wipe cuts to a dark-grid mechanism: a key card, a hash box and six buckets build first; pixel connectors draw before their heads, the hash output appears and bucket 3 is claimed. As an authored preview choice (not a source observation), progress moves only when that concept resolves: the collectible counter changes from x02 to x03, the third inventory slot unlocks with a single flash, and the guide hops with a ONE HOP! bubble. Hearts, counter, runtime bar and corner brackets stay fixed throughout. Topic, copy and layout are sample content, not requirements; not reference artwork or footage.";

export const pixelQuestWorkspace = () =>
  path.join(examplesFolder, "video-projects", PIXEL_QUEST_STYLE_ID);

export async function preparePixelQuestPreview() {
  const catalog = await loadCatalog();
  const style = catalog.styles.find((entry) => entry.id === PIXEL_QUEST_STYLE_ID);
  if (!style) throw Error("Pixel RPG Quest Explainer must be in the catalog first");
  const svg = pixelQuestPreviewSvg();
  await validateExamplePalette(svg, style);
  const record = await publishExample(
    { styleId: style.id, svg, designNotes },
    {
      styleId: style.id,
      catalogHash: catalog.hash,
      thumbnail: "",
      status: "ready",
      provider: "claude",
      model: PIXEL_QUEST_AUTHOR_MODEL,
    },
  );
  await writeExampleRecords([
    ...(await readExampleRecords()).filter((entry) => entry.styleId !== style.id),
    record,
  ]);
  const workspace = pixelQuestWorkspace();
  await mkdir(workspace, { recursive: true });
  await copyFile(
    path.resolve("node_modules/gsap/dist/gsap.min.js"),
    path.join(workspace, "gsap.min.js"),
  );
  await writeFile(path.join(workspace, "index.html"), pixelQuestPreviewHtml());
  await writeFile(path.join(workspace, "STYLE.json"), JSON.stringify(style, null, 2));
  return { workspace, record, svgHash: createHash("sha256").update(svg).digest("hex") };
}

/** Renders through the existing HyperFrames pipeline and records the clip only after it succeeds. */
export async function renderPixelQuestPreview() {
  const [{ renderJob }, { verifyVisibleMotion }, motion, assets, { illustrationMotionRevision }] =
    await Promise.all([
      import("../src/server/rendering/render"),
      import("../src/server/motion/motion-visibility"),
      import("../src/server/catalog/style-motion"),
      import("../src/server/catalog/style-preview-assets"),
      import("../src/server/motion/illustration-motion"),
    ]);
  const catalog = await loadCatalog();
  const workspace = pixelQuestWorkspace();
  const signal = new AbortController().signal;
  const started = Date.now();
  const output = await renderJob(
    {
      id: PIXEL_QUEST_STYLE_ID,
      runId: "style-examples",
      candidateId: PIXEL_QUEST_STYLE_ID,
      kind: "preview",
      phase: "rendering",
      workspace,
      model: PIXEL_QUEST_AUTHOR_MODEL,
      duration: PIXEL_QUEST_DURATION,
    },
    {
      pipeline: "HyperFrames",
      fallbackReason: null,
      styleRenderer: ["SVG"],
      motionEngine: ["GSAP"],
      sourceFile: "index.html",
      duration: PIXEL_QUEST_DURATION,
      width: 1280,
      height: 720,
      audioDescription: "Silent",
      limitations: [
        "Illustrative code-drawn pixel sample with an invented topic and copy; production topics, concepts and copy come from the project. Not reference footage.",
      ],
    },
    signal,
    (type, message) => console.log(`${type}: ${message}`),
  );
  const rendered = path.join(workspace, output.video);
  const visibleChangeRatio = await verifyVisibleMotion(rendered, signal);
  const video = PIXEL_QUEST_STYLE_ID + path.extname(output.video);
  await mkdir(assets.stylePreviewVideoFolder, { recursive: true });
  await copyFile(rendered, path.join(assets.stylePreviewVideoFolder, video));
  await assets.publishStylePreviewSource(workspace, PIXEL_QUEST_STYLE_ID);
  const svg = pixelQuestPreviewSvg();
  const records = (await motion.readStyleVideos()).filter(
    (r) => r.styleId !== PIXEL_QUEST_STYLE_ID,
  );
  await motion.writeStyleVideos([
    ...records,
    {
      styleId: PIXEL_QUEST_STYLE_ID,
      catalogHash: catalog.hash,
      sourceHash: createHash("sha256").update(svg).digest("hex"),
      video,
      duration: PIXEL_QUEST_DURATION,
      generatedAt: new Date().toISOString(),
      renderMs: Date.now() - started,
      reviewed: true,
      motionRevision: illustrationMotionRevision,
      visibleChangeRatio,
      model: PIXEL_QUEST_AUTHOR_MODEL,
    },
  ]);
  return { video, visibleChangeRatio };
}

/** Authored agent summary for this style only, keyed by the existing summary cache helper. */
export const pixelQuestSummary = {
  styleId: PIXEL_QUEST_STYLE_ID,
  name: "Pixel RPG Quest Explainer. An authored Motion Graphic in Motion Design and Cinematography: a technical or educational explainer staged as a game run, where game-progression UI structures the explanation; narrower than Pixel Art (style-057), which covers rendering only.",
  visualIdentity:
    "Explicit: a persistent HUD with hearts, a collectible counter that only ever rises (tying its steps to explained concepts is an authored option) and a runtime bar; quest-map chapter cards with cleared and uncleared path segments under a STAGE N plate; a cumulative skill inventory with visible empty slots; pixel dialogue plates with accent end caps; an original pixel guide; dark-grid and cream-paper surfaces with corner brackets, all on one logical pixel grid.",
  suitableUses:
    "Explicit: technical and educational explainers, onboarding courses and multi-chapter tutorials. Inferred: product walkthroughs or recap videos that benefit from a sense of progress. Not suited to photoreal, luxury or solemn briefs, or to single-idea clips with nothing to progress. Audience is unspecified.",
  limitations:
    "HUD values must reflect the real concept and chapter structure and only rise; never decorate with meaningless counters. Do not copy existing game sprites, HUDs, mascots or maps or any source branding. Keep text on solid plates, avoid gradients and anti-aliased glows, and keep unlock flashes brief.",
  palette:
    "Scene-dependent suggestion: dark grid #1C1F2E, plate ink #11121B, cream text #F4EEDC, cream paper #F2EAD3, highlight orange #F28A2E for keywords and cleared progress, coin yellow #F7C948, heart red #E5484D, success green #5DC26A, item teal #3DB3A6 and muted grey #8D90A6. Roles stay fixed; orange is not a text colour on cream paper.",
  motionAndInteraction:
    "Explicit: stepped whole-pixel motion; inventory slots unlock in one step on their narration cue and map cards arrive already cleared, while any authored counter step lands with the concept it marks; diagrams build nodes before connectors; captions type into pre-sized plates; chapter changes are hard cuts or a short pixel wipe; the guide reacts with small hops. Optional references: Data Build, Terminal Typing, Step-Tick Slot Refill and Elastic Arrival.",
  audio:
    "Optional light chiptune or lo-fi bed under narration, soft UI blips for unlocks, silence during dense reading. Governed by project audio settings; the catalog preview is silent.",
  assetRequirements:
    "Topic, ordered concepts, chapters and copy come from the project. Everything can be code-drawn on a pixel grid with bitmap or local monospace lettering; an original guide needs a recorded sprite sheet. Duration, aspect ratio and frame rate are unspecified unless supplied.",
  combinations:
    "Usually used alone. Pixel Art (style-057) for stricter sprite and palette-cycling scenes; Scientific Visualization / Data Storytelling (style-097) for dense diagram discipline.",
  productionApproach:
    "Derive all progress values from an ordered concept list; draw SVG or Canvas 2D on one logical grid with crisp edges and bitmap glyphs; keep HUD and captions on a fixed top layer; GSAP drives one paused timeline through a pure time-state function. Composition and export follow the project renderer.",
  decisionGuidance:
    "Identity: a technical explainer told as a pixel game run, with a persistent HUD, quest-map chapters, a filling skill inventory and dialogue plates. Advantages: progress is visible and earned, which helps long, multi-concept lessons feel structured and motivating for general or developer audiences. Disadvantages: needs a real ordered concept list and tends toward a playful tone; dense diagrams must be redrawn in pixel blocks. Combination fit: stands alone; Pixel Art can tighten sprite work and data storytelling can discipline dense diagrams. Visual constraints: one logical pixel grid, flat limited palette with fixed accent roles, text on solid plates, original characters and icons, HUD values that reflect the story.",
};

export async function cachePixelQuestSummary() {
  const { summarizeStyle, styleSummarySource, styleSummaryCacheFolder } =
    await import("../src/server/catalog/style-summaries");
  const catalog = await loadCatalog();
  const scratch = await mkdtemp(path.join(os.tmpdir(), "pixel-quest-summary-"));
  try {
    await summarizeStyle(
      styleSummarySource(catalog, PIXEL_QUEST_STYLE_ID),
      "claude",
      new AbortController().signal,
      scratch,
      async ({ schema }) => ({ value: schema.parse(pixelQuestSummary), sessionId: "" }),
    );
    const [name] = await readdir(path.join(scratch, "shared"));
    const entry = JSON.parse(await readFile(path.join(scratch, "shared", name), "utf8"));
    const target = path.join(styleSummaryCacheFolder, "shared", name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(
      target,
      JSON.stringify({ ...entry, model: PIXEL_QUEST_AUTHOR_MODEL, provider: "claude" }, null, 2),
    );
    return target;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  console.log(await preparePixelQuestPreview());
  if (args.includes("--summary")) console.log(await cachePixelQuestSummary());
  if (args.includes("--render")) console.log(await renderPixelQuestPreview());
}
