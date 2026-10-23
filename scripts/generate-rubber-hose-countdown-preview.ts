import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/server/catalog/catalog";
import {
  examplesFolder,
  publishExample,
  readExampleRecords,
  validateExamplePalette,
  writeExampleRecords,
} from "../src/server/catalog/style-examples";
import { seeded } from "../src/shared/seeded-random";

/**
 * Vintage Rubber Hose Animation (style-140) catalog sample. Original code-drawn
 * artwork: the static SVG and the HyperFrames composition share one builder.
 * The crooked house and the 3-2-1 leader are sample content demonstrating the
 * drawing style and the optional film wear and leader countdown, not requirements.
 */
export const RUBBER_HOSE_STYLE_ID = "style-140";
export const RUBBER_HOSE_COMPOSITION_ID = "vintage-rubber-hose-house-leader";
export const RUBBER_HOSE_DURATION = 3;
export const DRAWING_RATE = 12;
export const FILM_RATE = 24;
export const RUBBER_HOSE_DRAWINGS = RUBBER_HOSE_DURATION * DRAWING_RATE;
export const RUBBER_HOSE_FILM_FRAMES = RUBBER_HOSE_DURATION * FILM_RATE;
export const RUBBER_HOSE_DELIVERY_FPS = 30;
export const RUBBER_HOSE_AUTHOR_MODEL = "claude-opus-5-5";

export const rubberHoseColors = {
  background: "#F1E3C6",
  foreground: "#25221F",
  ink_black: "#25221F",
  aged_ivory: "#F1E3C6",
  sepia_brown: "#856548",
  dusty_grey: "#77736D",
  muted_rust: "#B5523A",
  vintage_gold: "#E8B65B",
  faded_teal: "#7EA9A3",
  pale_sky_blue: "#B9D8D2",
} as const;
const C = rubberHoseColors;

export const sampleCues = {
  leaderStartDrawing: 11,
  leaderStartFrame: 22,
  framesPerCount: 14,
  counts: ["3", "2", "1"],
  settleDrawing: 32,
} as const;
const LEADER_FRAMES = sampleCues.framesPerCount * sampleCues.counts.length;

// ---------------------------------------------------------------------------
// Clocks (pure; no DOM, no wall clock)
// ---------------------------------------------------------------------------

const quantize = (time: number, rate: number, count: number) =>
  Number.isFinite(time) ? Math.max(0, Math.min(count - 1, Math.floor(time * rate + 1e-6))) : 0;
export const drawingIndex = (time: number) => quantize(time, DRAWING_RATE, RUBBER_HOSE_DRAWINGS);
export const filmFrameIndex = (time: number) => quantize(time, FILM_RATE, RUBBER_HOSE_FILM_FRAMES);
const hash = (index: number, salt: number) => seeded(index * 7919 + salt * 104729)();

export type Phase = "house" | "leader" | "settle";
export function phaseOf(drawing: number): Phase {
  if (drawing < sampleCues.leaderStartDrawing) return "house";
  if (drawing < sampleCues.settleDrawing) return "leader";
  return "settle";
}

// ---------------------------------------------------------------------------
// Cartoon drawings: authored key poses, one per 1/12 s
// ---------------------------------------------------------------------------

export interface HousePose {
  lean: number;
  sx: number;
  sy: number;
  towerLeft: number;
  towerRight: number;
  treeSway: number;
}
const housePose = (
  lean: number,
  sx: number,
  sy: number,
  towerLeft: number,
  towerRight: number,
  treeSway: number,
): HousePose => ({ lean, sx, sy, towerLeft, towerRight, treeSway });

/** Opener: wind leans the house, an anticipation squash, a stretch and tower whip, overshoot, settle. */
export const openerPoses: HousePose[] = [
  housePose(2.5, 1, 1, 0, 0, -3),
  housePose(3, 1, 1, -1, 1, -5),
  housePose(3.5, 1, 1, -2, 2, -7),
  housePose(2, 1.03, 0.94, -3, 3, -4),
  housePose(6, 0.97, 1.07, 6, -7, 3),
  housePose(5, 0.99, 1.03, 3, -4, 5),
  housePose(4, 1.01, 0.98, -1, 1, 2),
  housePose(4.5, 1, 1, 0, 0, -1),
  housePose(3.5, 1, 1.01, 1, -1, -3),
  housePose(3, 1, 1, 0, 0, -4),
  housePose(3, 1, 1, 0, 0, -5),
];
/** Return after the leader: a landing squash, rebound, overshoot and hold. */
export const settlePoses: HousePose[] = [
  housePose(1.5, 1.04, 0.92, -4, 4, -2),
  housePose(4.5, 0.98, 1.05, 4, -5, 4),
  housePose(3.5, 1, 0.99, -1, 1, 1),
  housePose(3, 1, 1, 0, 0, -2),
];
export const WINDOW_COUNT = 8;

export function rubberHoseDrawingState(time: number) {
  const drawing = drawingIndex(time);
  const phase = phaseOf(drawing);
  const pose =
    phase === "settle"
      ? settlePoses[drawing - sampleCues.settleDrawing]
      : openerPoses[Math.min(drawing, openerPoses.length - 1)];
  const sceneDrawing = phase === "settle" ? drawing - sampleCues.settleDrawing + 11 : drawing;
  const wide = pose.sy > 1.04;
  return {
    drawing,
    phase,
    boilSeed: [3, 7, 11][drawing % 3],
    cartoon: phase !== "leader",
    pose,
    windows: Array.from({ length: WINDOW_COUNT }, (_, index) =>
      wide ? 1 : Math.round((0.78 + 0.22 * hash(drawing, 50 + index)) * 100) / 100,
    ),
    rain: [-((sceneDrawing * 13) % 220), (sceneDrawing * 37) % 220] as [number, number],
    clouds: { far: sceneDrawing * 2, near: -sceneDrawing * 4 },
    bats: [0, 1].map((index) => ({
      x: index ? 1010 - sceneDrawing * 11 : 900 + sceneDrawing * 13,
      y: (index ? 190 : 110) + Math.round(Math.sin(sceneDrawing * 1.3 + index) * 12),
      wingsUp: (sceneDrawing + index) % 2 === 0,
    })),
  };
}
export type DrawingState = ReturnType<typeof rubberHoseDrawingState>;

// ---------------------------------------------------------------------------
// Film plate: leader and film wear, which change every 1/24 s
// ---------------------------------------------------------------------------

export function leaderState(time: number) {
  const frame = filmFrameIndex(time);
  const local = frame - sampleCues.leaderStartFrame;
  const active = local >= 0 && local < LEADER_FRAMES;
  const countIndex = active ? Math.floor(local / sampleCues.framesPerCount) : 0;
  const step = active ? local % sampleCues.framesPerCount : 0;
  return {
    frame,
    active,
    count: active ? sampleCues.counts[countIndex] : "",
    wipe: active ? (step + 1) / sampleCues.framesPerCount : 0,
    slip: active && local === 0 ? 220 : active && local === 1 ? 70 : 0,
    exposure: active && step === 0 ? 0.16 : 0,
  };
}

export function rubberHoseFilmState(time: number) {
  const frame = filmFrameIndex(time);
  const leader = leaderState(time);
  const jitter = leader.active ? 2.2 : 1;
  const scratchRun = Math.floor(frame / 5);
  return {
    frame,
    leader,
    weave: [
      Math.round((hash(frame, 1) - 0.5) * 30 * jitter) / 10,
      Math.round((hash(frame, 2) - 0.5) * 20 * jitter) / 10,
    ] as [number, number],
    flicker: frame % 11 === 5 ? 0.1 : Math.round(hash(frame, 3) * 50) / 1000,
    grainSeed: frame + 1,
    grain: leader.active ? 0.42 : 0.22,
    dust: Array.from({ length: 9 }, (_, k) => ({
      x: Math.round(hash(frame, 10 + k) * 1280),
      y: Math.round(hash(frame, 20 + k) * 720),
      visible: hash(frame, 30 + k) > (leader.active ? 0.3 : 0.5),
    })),
    hair: hash(frame, 39) > 0.8,
    scratches: [0, 1, 2].map((k) => ({
      x: Math.round(120 + 1040 * hash(scratchRun, 41 + k) + (frame % 5) * 1.5),
      visible: hash(scratchRun, 44 + k) > (leader.active ? 0.3 : 0.55),
    })),
  };
}
export type FilmState = ReturnType<typeof rubberHoseFilmState>;

// ---------------------------------------------------------------------------
// Attribute patches: the single bridge between state and drawing
// ---------------------------------------------------------------------------

type Patch = Record<string, Record<string, string>>;
const fixed = (value: number) => String(Number(value.toFixed(2)));
const on = (value: boolean) => (value ? "1" : "0");
export const HOUSE_BASE = [700, 436] as const;
export const LEADER_CENTER = [640, 360] as const;
const BAT_WINGS = {
  up: "M-20 -8Q-11 -20 0 -3Q11 -20 20 -8Q11 -3 0 4Q-11 -3 -20 -8Z",
  down: "M-20 6Q-11 12 0 -3Q11 12 20 6Q11 3 0 4Q-11 3 -20 6Z",
};

export function rubberHoseDrawingPatch(state: DrawingState): Patch {
  const patch: Patch = {};
  const { pose } = state;
  const [bx, by] = HOUSE_BASE;
  patch["rh-boil-noise"] = { seed: String(state.boilSeed) };
  patch["rh-cartoon"] = { opacity: on(state.cartoon) };
  patch["rh-leader"] = { opacity: on(!state.cartoon) };
  patch["rh-house"] = {
    transform: `translate(${bx} ${by}) rotate(${pose.lean}) scale(${pose.sx} ${pose.sy}) translate(${-bx} ${-by})`,
  };
  patch["rh-tower-l"] = {
    transform: `translate(616 268) skewX(${pose.towerLeft}) translate(-616 -268)`,
  };
  patch["rh-tower-r"] = {
    transform: `translate(810 200) skewX(${pose.towerRight}) translate(-810 -200)`,
  };
  for (const [id, x, y, scale, sign] of TREES) {
    patch[id] = {
      transform: `translate(${x} ${y}) rotate(${fixed(pose.treeSway * sign)}) scale(${scale * sign} ${scale})`,
    };
    patch[`${id}-crown`] = { transform: `rotate(${fixed(pose.treeSway * 0.6)} 24 -300)` };
  }
  state.windows.forEach((glow, index) => {
    patch[`rh-window-${index}`] = { opacity: fixed(glow) };
  });
  patch["rh-rain-pattern"] = { patternTransform: `translate(${state.rain[0]} ${state.rain[1]})` };
  patch["rh-clouds-far"] = { transform: `translate(${state.clouds.far} 0)` };
  patch["rh-clouds-near"] = { transform: `translate(${state.clouds.near} 0)` };
  state.bats.forEach((bat, index) => {
    patch[`rh-bat-${index}`] = { transform: `translate(${bat.x} ${bat.y})` };
    patch[`rh-bat-${index}-wings`] = { d: bat.wingsUp ? BAT_WINGS.up : BAT_WINGS.down };
  });
  return patch;
}

export function wipePath(fraction: number) {
  const [cx, cy] = LEADER_CENTER;
  if (fraction <= 0) return "M0 0Z";
  if (fraction >= 1) return "M0 0H1280V720H0Z";
  const radius = 900;
  const angle = -Math.PI / 2 + fraction * Math.PI * 2;
  const x = cx + Math.cos(angle) * radius;
  const y = cy + Math.sin(angle) * radius;
  return `M${cx} ${cy}V${cy - radius}A${radius} ${radius} 0 ${fraction > 0.5 ? 1 : 0} 1 ${fixed(x)} ${fixed(y)}Z`;
}

export function rubberHoseFilmPatch(state: FilmState): Patch {
  const patch: Patch = {};
  const { leader } = state;
  patch["rh-weave"] = { transform: `translate(${state.weave[0]} ${state.weave[1]})` };
  patch["rh-leader-plate"] = { transform: `translate(0 ${leader.slip})` };
  patch["rh-frameline"] = { height: String(leader.slip) };
  patch["rh-wipe"] = { d: wipePath(leader.wipe) };
  patch["rh-count"] = { "#text": leader.count };
  patch["rh-exposure"] = { opacity: fixed(leader.exposure) };
  patch["rh-flicker"] = { opacity: fixed(state.flicker) };
  patch["rh-grain-noise"] = { seed: String(state.grainSeed) };
  patch["rh-grain"] = { opacity: fixed(state.grain) };
  state.dust.forEach((speck, index) => {
    patch[`rh-dust-${index}`] = {
      transform: `translate(${speck.x} ${speck.y})`,
      opacity: on(speck.visible),
    };
  });
  patch["rh-hair"] = { opacity: on(state.hair) };
  state.scratches.forEach((scratch, index) => {
    patch[`rh-scratch-${index}`] = {
      transform: `translate(${scratch.x} 0)`,
      opacity: scratch.visible ? "0.5" : "0",
    };
  });
  return patch;
}

/** Complete (not incremental) patches per drawing and per film frame, so any seek is independent. */
export const rubberHoseDrawingPatches = () =>
  Array.from({ length: RUBBER_HOSE_DRAWINGS }, (_, drawing) =>
    rubberHoseDrawingPatch(rubberHoseDrawingState(drawing / DRAWING_RATE)),
  );
export const rubberHoseFilmPatches = () =>
  Array.from({ length: RUBBER_HOSE_FILM_FRAMES }, (_, frame) =>
    rubberHoseFilmPatch(rubberHoseFilmState(frame / FILM_RATE)),
  );

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
type Draw = (tag: string, values: Attrs, children?: string) => string;

function drawing(patch: Patch): Draw {
  return (tag, values, children = "") => {
    const id = values.id === undefined ? undefined : String(values.id);
    const merged: Attrs = { ...values };
    let content = children;
    for (const [key, value] of Object.entries((id && patch[id]) || {}))
      if (key === "#text") content = escapeXml(value);
      else merged[key] = value;
    return content || tag === "text"
      ? `<${tag} ${attrs(merged)}>${content}</${tag}>`
      : `<${tag} ${attrs(merged)}/>`;
  };
}

const LEADER_FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const brush = (d: string, color: string, width: number, opacity: number) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
const ink = (d: string, opacity = 1) =>
  `<path d="${d}" fill="${C.ink_black}"${opacity < 1 ? ` opacity="${opacity}"` : ""}/>`;

function sky(el: Draw) {
  return (
    `<rect width="1280" height="720" fill="${C.dusty_grey}"/>` +
    `<circle cx="230" cy="140" r="300" fill="${C.aged_ivory}" opacity=".26"/><circle cx="230" cy="140" r="150" fill="${C.aged_ivory}" opacity=".22"/>` +
    el(
      "g",
      { id: "rh-clouds-far", "data-part": "painterly-sky" },
      brush(
        "M-120 120C120 40 320 60 460 130S760 210 980 120S1260 60 1420 110",
        C.aged_ivory,
        60,
        0.2,
      ) +
        brush("M-100 40C200 10 480 30 700 20S1100 60 1400 20", C.ink_black, 46, 0.22) +
        brush("M40 232C200 176 360 200 430 252", C.aged_ivory, 34, 0.16) +
        brush("M-60 180C60 120 160 160 120 230S260 300 360 240", C.ink_black, 38, 0.24) +
        brush("M380 60C460 20 560 40 600 100", C.ink_black, 30, 0.26),
    ) +
    el(
      "g",
      { id: "rh-clouds-near" },
      brush(
        "M-120 300C160 240 360 280 560 250S940 180 1120 250S1320 300 1420 280",
        C.ink_black,
        72,
        0.3,
      ) +
        brush("M600 120C760 60 980 80 1200 150", C.ink_black, 90, 0.18) +
        brush("M880 330C980 300 1100 310 1240 350", C.sepia_brown, 40, 0.3),
    ) +
    `<path d="M0 560C90 520 170 520 250 540C320 510 400 512 470 530L470 720H0Z" fill="${C.sepia_brown}" opacity=".5"/>`
  );
}

const WINDOWS: { d: string; cx: number; cy: number; w: number; h: number; tower?: "l" | "r" }[] = [
  {
    d: "M600 226L606 170C610 160 620 160 624 170L626 224Z",
    cx: 613,
    cy: 198,
    w: 26,
    h: 58,
    tower: "l",
  },
  { d: "M590 330L612 328L614 374L592 376Z", cx: 602, cy: 352, w: 24, h: 48 },
  { d: "M690 300L718 296L720 336L692 340Z", cx: 705, cy: 318, w: 30, h: 42 },
  { d: "M736 292L758 290L760 326L738 330Z", cx: 748, cy: 310, w: 24, h: 38 },
  {
    d: "M790 190L794 130C798 118 812 118 816 128L820 188Z",
    cx: 805,
    cy: 158,
    w: 30,
    h: 68,
    tower: "r",
  },
  { d: "M790 270L816 266L818 312L792 316Z", cx: 804, cy: 291, w: 28, h: 48 },
  { d: "M684 436L686 400C690 392 704 392 708 400L710 436Z", cx: 697, cy: 416, w: 26, h: 42 },
  { d: "M866 392L884 394L884 418L866 416Z", cx: 875, cy: 405, w: 18, h: 26 },
];

function window(el: Draw, index: number) {
  const { d, cx, cy, w, h } = WINDOWS[index];
  return el(
    "g",
    { id: `rh-window-${index}`, "data-part": "lit-window" },
    `<path d="${d}" fill="${C.aged_ivory}" stroke="${C.vintage_gold}" stroke-width="2" stroke-opacity=".7"/>` +
      `<path d="M${cx} ${cy - h / 2 + 4}V${cy + h / 2 - 2}M${cx - w / 2} ${cy + 2}H${cx + w / 2}" stroke="${C.ink_black}" stroke-width="3"/>`,
  );
}

/** Sample subject only: an original crooked, leaning house drawn as an inked cartoon silhouette. */
function house(el: Draw) {
  const windowsFor = (tower?: "l" | "r") =>
    WINDOWS.map((entry, index) => (entry.tower === tower ? window(el, index) : "")).join("");
  const leftTower = el(
    "g",
    { id: "rh-tower-l" },
    ink("M556 272C590 220 612 150 628 60C640 140 664 214 676 256C640 262 596 268 556 272Z") +
      ink("M628 60C630 40 640 26 654 22C644 32 637 46 634 64Z") +
      brush("M558 270C592 220 614 150 628 62", C.sepia_brown, 5, 0.75) +
      windowsFor("l"),
  );
  const rightTower = el(
    "g",
    { id: "rh-tower-r" },
    ink("M758 204C784 150 800 92 808 20C820 86 844 146 862 194C826 198 792 202 758 204Z") +
      ink("M808 20C802 6 790 0 778 4C791 8 800 14 804 26Z") +
      brush("M760 202C786 150 802 92 808 22", C.sepia_brown, 5, 0.75) +
      windowsFor("r"),
  );
  return el(
    "g",
    { id: "rh-house", "data-subject": "sample-house", "data-role": "replaceable-sample-subject" },
    ink("M666 436L900 470L1060 504L852 436Z", 0.45) +
      ink("M574 436C570 380 566 320 572 262L650 248C656 300 662 370 666 436Z") +
      ink("M650 436L652 250C700 238 748 232 792 226L800 436Z") +
      ink("M640 256C686 196 722 168 748 150C766 180 792 206 812 228C760 236 700 246 640 256Z") +
      ink("M768 436C766 340 770 260 774 196L838 186C840 260 846 350 852 436Z") +
      ink("M716 176L720 118L742 114L740 170Z") +
      ink("M846 436C852 400 856 372 858 344L900 360C900 390 898 414 896 436Z") +
      ink("M846 350L906 356L896 334Z") +
      ink("M640 436L644 392L752 384L758 436Z") +
      ink("M628 398L762 380L768 392L632 408Z") +
      [
        "M576 434C572 380 568 320 574 264",
        "M652 434L654 252",
        "M642 254C686 196 722 168 748 152",
        "M770 434C768 340 772 260 776 198",
        "M718 174L722 120",
      ]
        .map((d) => brush(d, C.sepia_brown, 5, 0.75))
        .join("") +
      [
        "M600 420C598 360 596 320 600 286",
        "M624 420C624 360 622 300 626 272",
        "M680 420L682 272",
        "M740 420L742 262",
        "M800 420C800 340 802 260 806 214",
        "M826 420C828 340 828 270 830 222",
      ]
        .map((d) => brush(d, C.dusty_grey, 2.5, 0.3))
        .join("") +
      brush("M646 412H754M650 424H756", C.sepia_brown, 3, 0.6) +
      windowsFor() +
      leftTower +
      rightTower,
  );
}

const RAIN_STREAKS = [
  [20, 14, 8, 46],
  [120, 60, 104, 98],
  [196, 22, 186, 48],
  [64, 130, 50, 170],
  [170, 150, 158, 178],
  [100, 200, 90, 216],
]
  .map(([x1, y1, x2, y2]) => `<path d="M${x1} ${y1}L${x2} ${y2}"/>`)
  .join("");

const TREE_TRUNK =
  "M-26 0C-22 -90 -10 -200 24 -300C40 -350 70 -390 104 -420C76 -380 58 -340 48 -296C20 -196 14 -90 18 0Z";
const TREE_BRANCHES = [
  "M30 -260C70 -300 120 -320 170 -330C124 -312 84 -290 40 -246Z",
  "M10 -180C-30 -230 -60 -260 -110 -280C-64 -250 -34 -220 0 -168Z",
  "M60 -360C90 -420 100 -470 96 -520C110 -470 106 -420 74 -350Z",
  "M40 -300C0 -360 -20 -400 -24 -450C-6 -404 14 -364 52 -310Z",
  "M94 -410C140 -430 190 -428 236 -410C190 -420 144 -416 100 -398Z",
];
const TREE_TWIGS =
  "M170 -330l30 -24M170 -330l36 6M-110 -280l-22 -30M-110 -280l-34 4M96 -520l-14 -26M96 -520l18 -22M236 -410l26 -18M-24 -450l-20 -20";
const TREES: [string, number, number, number, 1 | -1][] = [
  ["rh-tree-far", 60, 690, 1.05, 1],
  ["rh-tree-l", 170, 730, 1.42, 1],
  ["rh-tree-r", 1190, 700, 1.18, -1],
];

function tree(el: Draw, id: string, opacity: number) {
  return el(
    "g",
    { id, opacity, "data-part": "bare-tree" },
    ink(TREE_TRUNK) +
      brush("M-20 -10C-16 -100 -6 -200 26 -296", C.sepia_brown, 3, 0.6) +
      el(
        "g",
        { id: `${id}-crown` },
        TREE_BRANCHES.map((d) => ink(d)).join("") +
          `<path d="${TREE_TWIGS}" fill="none" stroke="${C.ink_black}" stroke-width="3.5" stroke-linecap="round"/>`,
      ),
  );
}

function cartoonScene(el: Draw) {
  const bats = [0, 1]
    .map((index) =>
      el(
        "g",
        { id: `rh-bat-${index}` },
        el("path", { id: `rh-bat-${index}-wings`, d: BAT_WINGS.up, fill: C.ink_black }),
      ),
    )
    .join("");
  return (
    sky(el) +
    bats +
    tree(el, "rh-tree-far", 0.75) +
    `<path d="M0 720L0 650C200 620 420 596 560 570C650 554 760 552 860 562C1020 578 1160 612 1280 642L1280 720Z" fill="${C.ink_black}" data-part="hill"/>` +
    brush(
      "M0 650C200 620 420 596 560 570C650 554 760 552 860 562C1020 578 1160 612 1280 642",
      C.sepia_brown,
      5,
      0.7,
    ) +
    brush("M330 720C430 670 560 620 690 566", C.sepia_brown, 14, 0.5) +
    brush(
      "M120 700C260 670 420 640 540 616M820 600C960 610 1080 640 1220 680",
      C.sepia_brown,
      3,
      0.35,
    ) +
    `<g transform="translate(-280 -50) scale(1.4)">${house(el)}</g>` +
    tree(el, "rh-tree-r", 1) +
    tree(el, "rh-tree-l", 1) +
    `<path d="M40 720l14 -40M70 720l-6 -34M560 720l10 -30M960 720l-8 -36M1000 720l12 -28" stroke="${C.ink_black}" stroke-width="5" stroke-linecap="round"/>` +
    `<rect width="1280" height="720" fill="url(#rh-rain-pattern)" opacity=".7" data-part="wind-streaks"/>`
  );
}

/** Optional effect sample: a photographic leader plate, kept free of cartoon ink and line boil. */
function leaderPlate(el: Draw) {
  const [cx, cy] = LEADER_CENTER;
  const random = seeded(1940);
  const fineScratches = Array.from({ length: 14 }, () => {
    const x = Math.round(random() * 1280);
    const top = Math.round(random() * 300);
    return `<path d="M${x} ${top}V${top + 260 + Math.round(random() * 420)}" stroke="${random() > 0.4 ? C.aged_ivory : C.ink_black}" stroke-width="${random() > 0.7 ? 1.6 : 1}" opacity="${fixed(0.12 + random() * 0.2)}"/>`;
  }).join("");
  const blotches = Array.from({ length: 10 }, () => {
    const x = Math.round(random() * 1280);
    const y = Math.round(random() * 720);
    const r = 2 + random() * 5;
    return `<ellipse cx="${x}" cy="${y}" rx="${fixed(r)}" ry="${fixed(r * (0.6 + random() * 0.6))}" fill="${C.ink_black}" opacity="${fixed(0.35 + random() * 0.35)}"/>`;
  }).join("");
  return el(
    "g",
    { id: "rh-leader-plate", "data-part": "film-leader" },
    `<rect width="1280" height="720" fill="${C.dusty_grey}"/><rect width="1280" height="720" fill="${C.sepia_brown}" opacity=".5"/>` +
      el("path", {
        id: "rh-wipe",
        d: "M0 0Z",
        fill: C.ink_black,
        opacity: 0.5,
        "data-part": "clock-wipe-sector",
      }) +
      fineScratches +
      blotches +
      `<path d="M0 ${cy}H1280M${cx} 0V720" stroke="${C.aged_ivory}" stroke-width="2.5" opacity=".85" data-part="crosshair"/>` +
      `<circle cx="${cx}" cy="${cy}" r="330" fill="none" stroke="${C.aged_ivory}" stroke-width="6" opacity=".9" data-part="registration-circle"/>` +
      `<circle cx="${cx}" cy="${cy}" r="272" fill="none" stroke="${C.aged_ivory}" stroke-width="5" opacity=".9" data-part="registration-circle"/>` +
      el(
        "text",
        {
          id: "rh-count",
          x: cx,
          y: cy + 170,
          "font-family": LEADER_FONT,
          "font-size": 470,
          "font-weight": 700,
          "text-anchor": "middle",
          fill: C.aged_ivory,
          stroke: C.ink_black,
          "stroke-width": 4,
          "stroke-opacity": 0.7,
          "paint-order": "stroke",
          "data-part": "leader-numeral",
        },
        "",
      ),
  );
}

function filmWear(el: Draw) {
  const dust = Array.from({ length: 9 }, (_, index) =>
    el(
      "g",
      { id: `rh-dust-${index}` },
      `<ellipse rx="${2 + (index % 3)}" ry="${1.5 + (index % 2)}" fill="${index % 3 === 2 ? C.aged_ivory : C.ink_black}" opacity=".75"/>`,
    ),
  ).join("");
  const scratches = [0, 1, 2]
    .map((index) =>
      el("path", {
        id: `rh-scratch-${index}`,
        d: "M0 0V720",
        stroke: index === 1 ? C.ink_black : C.aged_ivory,
        "stroke-width": index === 0 ? 1.6 : 1.1,
        opacity: 0,
      }),
    )
    .join("");
  return el(
    "g",
    { "data-part": "film-wear" },
    el("rect", { id: "rh-flicker", width: 1280, height: 720, fill: C.ink_black, opacity: 0 }) +
      el("rect", {
        id: "rh-grain",
        width: 1280,
        height: 720,
        fill: C.ink_black,
        filter: "url(#rh-grain-f)",
        opacity: 0.2,
      }) +
      dust +
      el("path", {
        id: "rh-hair",
        d: "M820 120q14 -18 26 -4t22 -6q10 14 -4 26",
        fill: "none",
        stroke: C.ink_black,
        "stroke-width": 1.5,
        opacity: 0,
      }) +
      scratches +
      `<rect width="1280" height="720" fill="url(#rh-vignette)"/>`,
  );
}

export function rubberHosePreviewSvg(time = RUBBER_HOSE_DURATION) {
  const patch = {
    ...rubberHoseDrawingPatch(rubberHoseDrawingState(time)),
    ...rubberHoseFilmPatch(rubberHoseFilmState(time)),
  };
  const el = drawing(patch);
  const defs =
    `<defs>` +
    `<filter id="rh-boil" x="-2%" y="-2%" width="104%" height="104%">${el("feTurbulence", { id: "rh-boil-noise", type: "turbulence", baseFrequency: 0.022, numOctaves: 2, seed: 3, result: "boil" })}<feDisplacementMap in="SourceGraphic" in2="boil" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter>` +
    `<filter id="rh-grain-f" x="0" y="0" width="100%" height="100%">${el("feTurbulence", { id: "rh-grain-noise", type: "fractalNoise", baseFrequency: 0.85, numOctaves: 1, seed: 1 })}<feColorMatrix type="matrix" values="0 0 0 0 0.145 0 0 0 0 0.133 0 0 0 0 0.122 1.4 0 0 0 -0.55"/></filter>` +
    el(
      "pattern",
      { id: "rh-rain-pattern", width: 220, height: 220, patternUnits: "userSpaceOnUse" },
      `<g stroke="${C.aged_ivory}" stroke-width="3.5" stroke-linecap="round">${RAIN_STREAKS}</g>`,
    ) +
    `<radialGradient id="rh-vignette" cx="50%" cy="50%" r="72%"><stop offset=".55" stop-color="${C.ink_black}" stop-opacity="0"/><stop offset="1" stop-color="${C.ink_black}" stop-opacity=".6"/></radialGradient></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" data-layout-allow-overflow="true">${defs}<rect width="1280" height="720" fill="${C.ink_black}"/>${el(
    "g",
    { id: "rh-weave" },
    el("g", { id: "rh-cartoon", filter: "url(#rh-boil)" }, cartoonScene(el)) +
      el(
        "g",
        { id: "rh-leader" },
        el("rect", { id: "rh-frameline", width: 1280, height: 0, fill: C.ink_black }) +
          leaderPlate(el),
      ) +
      el("rect", { id: "rh-exposure", width: 1280, height: 720, fill: C.aged_ivory, opacity: 0 }),
  )}${filmWear(el)}</svg>`;
}

// ---------------------------------------------------------------------------
// HyperFrames composition
// ---------------------------------------------------------------------------

export function rubberHosePreviewHtml() {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${C.aged_ivory}}svg{display:block;width:1280px;height:720px}</style></head><body><div data-composition-id="${RUBBER_HOSE_COMPOSITION_ID}" data-width="1280" data-height="720" data-duration="${RUBBER_HOSE_DURATION}" data-fps="${RUBBER_HOSE_DELIVERY_FPS}" style="width:100%;height:100%">${rubberHosePreviewSvg(0)}</div><script src="gsap.min.js"></script><script>
const DRAWINGS=${json(rubberHoseDrawingPatches())};
const FILM=${json(rubberHoseFilmPatches())};
const nodes={};
const node=(id)=>nodes[id]||(nodes[id]=document.getElementById(id));
function apply(patch){for(const id in patch){const target=node(id);const values=patch[id];for(const key in values){if(key==='#text')target.textContent=values[key];else target.setAttribute(key,values[key]);}}}
const clock={time:0};
const index=(rate,count)=>Math.max(0,Math.min(count-1,Math.floor(clock.time*rate+1e-6)));
function render(){apply(DRAWINGS[index(${DRAWING_RATE},${RUBBER_HOSE_DRAWINGS})]);apply(FILM[index(${FILM_RATE},${RUBBER_HOSE_FILM_FRAMES})]);}
const tl=gsap.timeline({paused:true});
tl.to(clock,{time:${RUBBER_HOSE_DURATION},duration:${RUBBER_HOSE_DURATION},ease:'none',onUpdate:render},0);
render();
window.__timelines={'${RUBBER_HOSE_COMPOSITION_ID}':tl};
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

const designNotes =
  "Claude Opus 5.5 code-drawn Vintage Rubber Hose Animation sample. An original crooked house on a hill at night shows the hand-inked style: strong irregular ink silhouettes, painterly sepia rim light and dry-brush shadow, small glowing windows, leaning bare trees, layered painterly sky and wind streaks. The house squashes, stretches and settles in elastic drawings that change 12 times a second. It then cuts to the optional film-leader countdown, 3, 2, 1: precise concentric rings and crosshairs, a large pale sans-serif numeral and a darker rotating clock-wipe sector on a photographic plate with grain, scratches, dust and gate weave. The house and sequence are sample content, not requirements.";

export const rubberHoseWorkspace = () =>
  path.join(examplesFolder, "video-projects", RUBBER_HOSE_STYLE_ID);

export async function prepareRubberHosePreview() {
  const catalog = await loadCatalog();
  const style = catalog.styles.find((entry) => entry.id === RUBBER_HOSE_STYLE_ID);
  if (!style) throw Error("Vintage Rubber Hose Animation must be in the catalog first");
  const svg = rubberHosePreviewSvg();
  await validateExamplePalette(svg, style);
  const record = await publishExample(
    { styleId: style.id, svg, designNotes },
    {
      styleId: style.id,
      catalogHash: catalog.hash,
      thumbnail: "",
      status: "ready",
      provider: "claude",
      model: RUBBER_HOSE_AUTHOR_MODEL,
    },
  );
  await writeExampleRecords([
    ...(await readExampleRecords()).filter((entry) => entry.styleId !== style.id),
    record,
  ]);
  const workspace = rubberHoseWorkspace();
  await mkdir(workspace, { recursive: true });
  await copyFile(
    path.resolve("node_modules/gsap/dist/gsap.min.js"),
    path.join(workspace, "gsap.min.js"),
  );
  await writeFile(path.join(workspace, "index.html"), rubberHosePreviewHtml());
  await writeFile(path.join(workspace, "STYLE.json"), JSON.stringify(style, null, 2));
  return { workspace, record, svgHash: createHash("sha256").update(svg).digest("hex") };
}

/** Renders through the existing HyperFrames pipeline and records the clip only after it succeeds. */
export async function renderRubberHosePreview() {
  const [{ renderJob }, { verifyVisibleMotion }, motion, assets, { illustrationMotionRevision }] =
    await Promise.all([
      import("../src/server/rendering/render"),
      import("../src/server/motion/motion-visibility"),
      import("../src/server/catalog/style-motion"),
      import("../src/server/catalog/style-preview-assets"),
      import("../src/server/motion/illustration-motion"),
    ]);
  const catalog = await loadCatalog();
  const workspace = rubberHoseWorkspace();
  const signal = new AbortController().signal;
  const started = Date.now();
  const output = await renderJob(
    {
      id: RUBBER_HOSE_STYLE_ID,
      runId: "style-examples",
      candidateId: RUBBER_HOSE_STYLE_ID,
      kind: "preview",
      phase: "rendering",
      workspace,
      model: RUBBER_HOSE_AUTHOR_MODEL,
      duration: RUBBER_HOSE_DURATION,
    },
    {
      pipeline: "HyperFrames",
      fallbackReason: null,
      styleRenderer: ["SVG"],
      motionEngine: ["GSAP"],
      sourceFile: "index.html",
      duration: RUBBER_HOSE_DURATION,
      width: 1280,
      height: 720,
      audioDescription: "Silent",
      limitations: [
        "Illustrative code-drawn sample with a replaceable subject; not reference footage.",
      ],
    },
    signal,
    (type, message) => console.log(`${type}: ${message}`),
  );
  const rendered = path.join(workspace, output.video);
  const visibleChangeRatio = await verifyVisibleMotion(rendered, signal);
  const video = RUBBER_HOSE_STYLE_ID + path.extname(output.video);
  await copyFile(rendered, path.join(assets.stylePreviewVideoFolder, video));
  await assets.publishStylePreviewSource(workspace, RUBBER_HOSE_STYLE_ID);
  const svg = rubberHosePreviewSvg();
  const records = (await motion.readStyleVideos()).filter(
    (r) => r.styleId !== RUBBER_HOSE_STYLE_ID,
  );
  await motion.writeStyleVideos([
    ...records,
    {
      styleId: RUBBER_HOSE_STYLE_ID,
      catalogHash: catalog.hash,
      sourceHash: createHash("sha256").update(svg).digest("hex"),
      video,
      duration: RUBBER_HOSE_DURATION,
      generatedAt: new Date().toISOString(),
      renderMs: Date.now() - started,
      reviewed: true,
      motionRevision: illustrationMotionRevision,
      visibleChangeRatio,
      model: RUBBER_HOSE_AUTHOR_MODEL,
    },
  ]);
  return { video, visibleChangeRatio };
}

/** Authored agent summary for this style only, keyed by the existing summary cache helper. */
export const rubberHoseSummary = {
  styleId: RUBBER_HOSE_STYLE_ID,
  name: "Vintage Rubber Hose Animation. An authored Motion Graphic in Animation Techniques: early sound-era hand-inked cel cartoon drawing with stepped, elastic acting; its only optional effects are film wear and a vintage film-leader countdown.",
  visualIdentity:
    "The catalog preview is the source of truth for drawing style, atmosphere, tonal palette and motion. Match its visual identity while adapting the subject and story. Explicit: strong irregular ink silhouettes, organic slightly imperfect contours with varied line weight, simplified forms, flat cel fills under bold painterly or cel shadow masses, expressive warped or asymmetric scenery and layered atmosphere. Environmental acting is mandatory wherever scenery is present: architecture rocks, structural parts flex or skew, trees sway and branches move independently; other settings use equivalent acting with readable holds. Characters, when present, may be any original subject with rounded elastic masses and jointless hose limbs; shots without characters are valid.",
  suitableUses:
    "Explicit: stories, intros, explainers and title moments that want an early hand-drawn cartoon feel, with or without characters. Inferred: brand, education and entertainment pieces built around an original subject. Not suited to photoreal, glossy 3D or clean corporate vector briefs. Audience is unspecified.",
  limitations:
    "Never imitate an existing cartoon character, mascot, recognizable silhouette or reference composition. No subject, story, setting or sequence is required. Avoid neon, glossy gradients and heavy saturation unless requested. Keep flashes to three per second or fewer; an optional film leader is a creative hybrid, not a strict historical reconstruction.",
  palette:
    "The catalog preview's tonal palette comes first. Recolour only when explicitly requested for this style's assigned scenes, retaining tonal contrast; palettes assigned to other scenes must not bleed in. Optional example tokens: ink black #25221F, aged ivory #F1E3C6, sepia brown #856548, dusty grey #77736D, muted rust #B5523A, vintage gold #E8B65B, faded teal #7EA9A3 and pale sky blue #B9D8D2. These example tokens do not require a sepia tint.",
  motionAndInteraction:
    "Explicit: stepped drawings, typically 12 per second against a 24 fps film reference, from absolute time; expressive elastic poses with anticipation, squash and stretch, overshoot, arcs and rhythmic timing; readable holds without a mandatory perpetual bounce. Environmental acting is required wherever scenery is present; moving texture alone is insufficient. Optional effects only: film wear on the whole plate, and a leader with precise rings and crosshairs, a pale bold sans-serif numeral and a rotating clock-wipe sector.",
  audio:
    "Optional ideas governed by the project's audio settings: jazz percussion, upright bass, muted brass, playful woodwinds, cartoon sound effects, projector noise or vinyl hiss with film wear, and clicks with an optional leader. Do not invent narration or music when audio is disabled. The catalog preview is silent.",
  assetRequirements:
    "Subjects, any characters, story, copy, duration, aspect ratio, resolution and frame rate come from the project; drawing style, atmosphere, tonal palette and motion follow the catalog preview. Everything can be code-drawn with system fonts; supplied hand-drawn cels can replace coded drawings. The drawing rate is animation sampling, not the delivery frame rate.",
  combinations:
    "Usually used alone. Traditional Cel Animation (style-081) can supply drawn cel frames; Scientific Visualization / Data Storytelling (style-097) can add explanatory diagrams in the same ink and palette.",
  productionApproach:
    "Inspect assets/style-previews/style-140.webm and assets/style-previews/sources/style-140/index.html before authoring, then compare representative rendered frames and environmental motion over time against the preview. SVG and HTML/CSS draw ink, cels, scenery, any characters and text; Canvas 2D or SVG filters and Rough.js are added only for optional film wear or line boil. The optional leader is precise geometry kept separate from the cartoon artwork. GSAP drives one paused timeline through pure time-state functions. Composition and export follow the project renderer.",
  decisionGuidance:
    "Identity: early hand-inked cel cartoon drawing with irregular ink silhouettes, painterly shadow masses, expressive scenery and stepped elastic acting. Advantages: warm, playful, hand-made character and environment performance for any original subject, with optional film wear and a precise vintage leader for period flavour. Disadvantages: needs authored key drawings and consistent construction; it reads as nostalgic rather than sleek. Combination fit: stands alone; Traditional Cel Animation can supply drawn frames and data storytelling can add inked diagrams. Visual constraints: original subjects only, flat fills and ink contours, the preview as the visual source of truth with colour overrides scoped to explicitly requested scenes, no neon, glossy 3D or clean corporate vector icons unless requested.",
};

export async function cacheRubberHoseSummary() {
  const { summarizeStyle, styleSummarySource, styleSummaryCacheFolder } =
    await import("../src/server/catalog/style-summaries");
  const catalog = await loadCatalog();
  const scratch = await mkdtemp(path.join(os.tmpdir(), "rubber-hose-summary-"));
  try {
    await summarizeStyle(
      styleSummarySource(catalog, RUBBER_HOSE_STYLE_ID),
      "claude",
      new AbortController().signal,
      scratch,
      async ({ schema }) => ({ value: schema.parse(rubberHoseSummary), sessionId: "" }),
    );
    const [name] = await readdir(path.join(scratch, "shared"));
    const entry = JSON.parse(await readFile(path.join(scratch, "shared", name), "utf8"));
    const target = path.join(styleSummaryCacheFolder, "shared", name);
    await writeFile(
      target,
      JSON.stringify({ ...entry, model: RUBBER_HOSE_AUTHOR_MODEL, provider: "claude" }, null, 2),
    );
    return target;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  console.log(await prepareRubberHosePreview());
  if (args.includes("--summary")) console.log(await cacheRubberHoseSummary());
  if (args.includes("--render")) console.log(await renderRubberHosePreview());
}
