import { TAU, clamp, ease, seeded } from "./drawing";

/**
 * Pixel-Tile Materialize & Targeted Delete.
 * One original code-drawn illustration is sliced into a fixed grid. Every tile is a
 * real crop of that image (clip to the tile, offset the same drawing), starts from a
 * seeded scatter position with depth scale and rotation, and converges to its home
 * cell so the image becomes whole and readable. A red selection box then hops between
 * fixed cells; each selected cell either fragments into drifting red squares or fills
 * with binary digits and goes dark. Deleted cells stay empty and nothing reflows.
 * Every pose is a closed-form function of absolute time; nothing is simulated.
 */

export const GRID = { cols: 8, rows: 6, size: 44, x: 144, y: 40 } as const;
export const TILE_COUNT = GRID.cols * GRID.rows;
export const IMAGE = {
  x: GRID.x,
  y: GRID.y,
  w: GRID.cols * GRID.size,
  h: GRID.rows * GRID.size,
} as const;
export const ASSEMBLY = {
  appearStart: 0.15,
  appearSpread: 0.42,
  appearFade: 0.12,
  moveStart: 0.55,
  moveSpread: 0.5,
  moveDuration: 0.8,
  /** Straggler specks outside the image: fade in, drift inward and are gone before the hold. */
  loose: { fadeIn: [0.55, 0.75], fadeOut: [1.45, 1.8], drift: 10 },
  /** Every tile is home by this time; a readable hold of the whole image follows. */
  complete: 1.85,
  gridIn: { start: 2.8, end: 2.95 },
} as const;
type DeleteMode = "fragment" | "binary";
/** Authored deletion targets: fixed cells, hop times and dissolve mode. */
export const TARGETS: readonly { col: number; row: number; hop: number; mode: DeleteMode }[] = [
  { col: 6, row: 1, hop: 3.0, mode: "fragment" },
  { col: 2, row: 3, hop: 3.4, mode: "binary" },
  { col: 5, row: 4, hop: 3.8, mode: "fragment" },
  { col: 1, row: 1, hop: 4.2, mode: "fragment" },
  { col: 4, row: 2, hop: 4.6, mode: "binary" },
];
export const DELETE = { dwell: 0.24, binary: 0.5, popDuration: 0.08 } as const;
/**
 * Fragment pieces stay opaque for most of their life, fall more than one cell height and
 * may drift either way; the phase may overlap the next selector hop (the slot stays fixed).
 */
export const FRAGMENT = { life: 0.62, maxDelay: 0.12, gravity: 460, fadeFrom: 0.7 } as const;
/** Length of the dissolve phase that follows the selector dwell. */
export function deleteDuration(mode: DeleteMode) {
  return mode === "fragment" ? FRAGMENT.life + FRAGMENT.maxDelay : DELETE.binary;
}
/** Absolute time at which target k's cell becomes permanently empty. */
export function deletionEnd(k: number) {
  return TARGETS[k].hop + DELETE.dwell + deleteDuration(TARGETS[k].mode);
}
export const SELECTION_COLOR = "#FF3B4E";
const cellIndex = (col: number, row: number) => row * GRID.cols + col;
export const TARGET_CELLS = TARGETS.map((target) => cellIndex(target.col, target.row));

/** Home rectangle of a tile on the stage. */
export function tileHome(index: number) {
  const col = index % GRID.cols;
  const row = Math.floor(index / GRID.cols);
  return { col, row, x: GRID.x + col * GRID.size, y: GRID.y + row * GRID.size, size: GRID.size };
}
/** The crop of the single illustration shown by a tile, in image-local coordinates. */
export function tileSourceRect(index: number) {
  const home = tileHome(index);
  return { x: home.x - IMAGE.x, y: home.y - IMAGE.y, w: GRID.size, h: GRID.size };
}

// Seeded scatter (fixed at module load, never time-dependent).
const scatterRandom = seeded(4801);
const centre = { x: IMAGE.x + IMAGE.w / 2, y: IMAGE.y + IMAGE.h / 2 };
const distances = Array.from({ length: TILE_COUNT }, (_, i) => {
  const home = tileHome(i);
  return Math.hypot(home.x + GRID.size / 2 - centre.x, home.y + GRID.size / 2 - centre.y);
});
const farthest = Math.max(...distances);
const keepInFrame = (value: number, margin: number, extent: number) =>
  Math.max(margin, Math.min(extent - margin, value));
const SCATTER = Array.from({ length: TILE_COUNT }, (_, i) => {
  const angle = scatterRandom() * TAU;
  const radius = 150 + scatterRandom() * 190;
  const scale = 0.35 + scatterRandom() * 1.1;
  // Half the rotated tile's diagonal, so every scattered tile stays fully inside the frame.
  const margin = GRID.size * scale * Math.SQRT1_2;
  return {
    x: keepInFrame(centre.x + Math.cos(angle) * radius * 1.35, margin, 640),
    y: keepInFrame(centre.y + Math.sin(angle) * radius * 0.7, margin, 360),
    scale,
    rotation: (scatterRandom() - 0.5) * 1.6,
    appear: ASSEMBLY.appearStart + scatterRandom() * ASSEMBLY.appearSpread,
    // Centre tiles arrive first so a silhouette cluster forms before the edges lock.
    move: ASSEMBLY.moveStart + (distances[i] / farthest) * ASSEMBLY.moveSpread,
  };
});
/** Far (small) tiles are painted first; the order is fixed so depth never flickers. */
const PAINT_ORDER = Array.from({ length: TILE_COUNT }, (_, i) => i).sort(
  (a, b) => SCATTER[a].scale - SCATTER[b].scale || a - b,
);
const looseRandom = seeded(4802);
// Stragglers sit in bands beside the image (never over it) and drift inward toward it.
const LOOSE = Array.from({ length: 7 }, (_, i) => {
  const side = i % 2 ? 1 : -1;
  const size = 4 + looseRandom() * 5;
  const x =
    side < 0 ? IMAGE.x - 50 + looseRandom() * 28 : IMAGE.x + IMAGE.w + 12 + looseRandom() * 28;
  return { x, y: IMAGE.y + looseRandom() * (IMAGE.h - size), size, inward: -side };
});
/** Straggler specks at a time: positions and opacity are closed-form; all gone before the hold. */
export function loosePieces(time: number) {
  const { fadeIn, fadeOut, drift } = ASSEMBLY.loose;
  const alpha =
    clamp((time - fadeIn[0]) / (fadeIn[1] - fadeIn[0])) *
    (1 - clamp((time - fadeOut[0]) / (fadeOut[1] - fadeOut[0])));
  const travel = drift * clamp((time - fadeIn[0]) / (fadeOut[1] - fadeIn[0]));
  return LOOSE.map((piece) => ({ ...piece, x: piece.x + piece.inward * travel, alpha }));
}

const easeInOutCubic = (value: number) => {
  const p = clamp(value);
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
};

/** Time at which a tile reaches its home cell. */
export function tileArrival(index: number) {
  return SCATTER[index].move + ASSEMBLY.moveDuration;
}
/** Pose of a tile (centre, scale, rotation, alpha) as a pure function of time. */
export function tilePose(index: number, time: number) {
  const home = tileHome(index);
  const scatter = SCATTER[index];
  const p = easeInOutCubic((time - scatter.move) / ASSEMBLY.moveDuration);
  const hx = home.x + GRID.size / 2;
  const hy = home.y + GRID.size / 2;
  return {
    x: scatter.x + (hx - scatter.x) * p,
    y: scatter.y + (hy - scatter.y) * p,
    scale: scatter.scale + (1 - scatter.scale) * p,
    rotation: p >= 1 ? 0 : scatter.rotation * (1 - p),
    alpha: clamp((time - scatter.appear) / ASSEMBLY.appearFade),
    home: p >= 1,
  };
}

export type CellState = "assembling" | "present" | "selected" | "fragmenting" | "binary" | "empty";
/** Lifecycle of a fixed grid cell. Deleted cells end "empty" and are never refilled. */
export function cellState(index: number, time: number): CellState {
  if (time < tileArrival(index)) return "assembling";
  const k = TARGET_CELLS.indexOf(index);
  if (k < 0) return "present";
  const { hop, mode } = TARGETS[k];
  if (time < hop) return "present";
  if (time < hop + DELETE.dwell) return "selected";
  if (time < hop + DELETE.dwell + deleteDuration(mode))
    return mode === "fragment" ? "fragmenting" : "binary";
  return "empty";
}
/** Index of the cell under the selection box, or null when no box is shown. */
export function selectionCell(time: number) {
  for (let k = TARGETS.length - 1; k >= 0; k--) {
    const end = k + 1 < TARGETS.length ? TARGETS[k + 1].hop : TARGETS[k].hop + DELETE.dwell + 0.12;
    if (time >= TARGETS[k].hop && time < end) return TARGET_CELLS[k];
    if (time >= end) return null;
  }
  return null;
}
/** Number of cells whose deletion has started (drives the progress bar). */
export function deletedCount(time: number) {
  return TARGETS.filter((target) => time >= target.hop + DELETE.dwell).length;
}

const FRAGMENTS = 4;
const fragmentRandom = seeded(4803);
const FRAGMENT_PATHS = TARGETS.map(() =>
  Array.from({ length: FRAGMENTS * FRAGMENTS }, () => ({
    // Mostly down and to the right, with some pieces drifting left.
    vx: -36 + fragmentRandom() * 88,
    vy: -16 + fragmentRandom() * 40,
    spin: (fragmentRandom() - 0.5) * 5,
    delay: fragmentRandom() * FRAGMENT.maxDelay,
    pink: fragmentRandom() > 0.55,
  })),
);
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const p = clamp((value - edge0) / (edge1 - edge0));
  return p * p * (3 - 2 * p);
};
/** Closed-form fragment pose: constant velocity plus gravity, no integration. */
export function fragmentPose(target: number, piece: number, time: number) {
  const { col, row, hop } = TARGETS[target];
  const path = FRAGMENT_PATHS[target][piece];
  const f = GRID.size / FRAGMENTS;
  const fx = GRID.x + col * GRID.size + (piece % FRAGMENTS) * f + f / 2;
  const fy = GRID.y + row * GRID.size + Math.floor(piece / FRAGMENTS) * f + f / 2;
  const tau = Math.max(0, time - (hop + DELETE.dwell) - path.delay);
  const life = clamp(tau / FRAGMENT.life);
  return {
    homeX: fx,
    homeY: fy,
    x: fx + path.vx * tau,
    y: fy + path.vy * tau + 0.5 * FRAGMENT.gravity * tau * tau,
    rotation: path.spin * tau,
    scale: 1 - 0.3 * life,
    alpha: 1 - smoothstep(FRAGMENT.fadeFrom, 1, life),
    redness: clamp(tau / 0.08),
    pink: path.pink,
  };
}
const binaryRandom = seeded(4804);
const BINARY = TARGETS.map(() =>
  Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => (binaryRandom() > 0.5 ? "1" : "0")).join(""),
  ),
);

// ---------------------------------------------------------------------------
// The single original illustration: an astronaut portrait (code-drawn).
// ---------------------------------------------------------------------------

const starRandom = seeded(4805);
const STARS = Array.from({ length: 34 }, () => ({
  x: IMAGE.x + 4 + starRandom() * (IMAGE.w - 8),
  y: IMAGE.y + 4 + starRandom() * (IMAGE.h * 0.62),
  size: starRandom() > 0.8 ? 3 : 2,
}));
const SUIT = "#EDE6D6";
const NAVY = "#162447";
const VISOR = "#0C1630";

export function drawIllustration(c: CanvasRenderingContext2D) {
  c.fillStyle = NAVY;
  c.fillRect(IMAGE.x, IMAGE.y, IMAGE.w, IMAGE.h);
  c.fillStyle = "#F1E8D2";
  for (const star of STARS) c.fillRect(star.x, star.y, star.size, star.size);
  // Ringed planet behind the shoulder.
  c.fillStyle = "#3FA7A0";
  c.beginPath();
  c.arc(446, 96, 30, 0, TAU);
  c.fill();
  c.strokeStyle = "#F1E8D2";
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(446, 96, 50, 11, -0.35, 0, TAU);
  c.stroke();
  // Shoulders and chest unit.
  c.fillStyle = SUIT;
  c.beginPath();
  c.moveTo(196, 304);
  c.bezierCurveTo(200, 250, 236, 226, 280, 220);
  c.lineTo(360, 220);
  c.bezierCurveTo(404, 226, 440, 250, 444, 304);
  c.closePath();
  c.fill();
  c.fillStyle = "#2F4FC9";
  c.fillRect(286, 246, 68, 46);
  c.fillStyle = "#F2B544";
  c.fillRect(296, 256, 12, 8);
  c.fillStyle = "#3FA7A0";
  c.fillRect(314, 256, 12, 8);
  c.fillStyle = SUIT;
  c.font = "700 11px ui-monospace, Menlo, monospace";
  c.textAlign = "center";
  c.fillText("AX-07", 320, 284);
  c.fillStyle = "#2A2F3A";
  c.fillRect(270, 212, 100, 16);
  // Helmet with visor and reflections.
  c.fillStyle = SUIT;
  c.beginPath();
  c.arc(320, 146, 78, 0, TAU);
  c.fill();
  c.strokeStyle = "#2A2F3A";
  c.lineWidth = 4;
  c.beginPath();
  c.arc(320, 146, 78, 0, TAU);
  c.stroke();
  c.fillStyle = VISOR;
  c.beginPath();
  c.roundRect(262, 112, 116, 78, 34);
  c.fill();
  c.fillStyle = "#3FA7A0";
  c.beginPath();
  c.arc(350, 168, 9, 0, TAU);
  c.fill();
  c.strokeStyle = "rgba(241, 232, 210, 0.85)";
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(276, 150);
  c.quadraticCurveTo(282, 124, 306, 120);
  c.stroke();
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(290, 160);
  c.quadraticCurveTo(294, 140, 312, 134);
  c.stroke();
  c.fillStyle = "#F2B544";
  c.fillRect(236, 136, 10, 22);
  c.fillRect(394, 136, 10, 22);
  c.strokeStyle = "#2A2F3A";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(372, 84);
  c.lineTo(390, 54);
  c.stroke();
  c.fillStyle = "#F2B544";
  c.beginPath();
  c.arc(391, 52, 4, 0, TAU);
  c.fill();
}

/** Draw the crop of the illustration that belongs at `homeX/homeY` with a given pose. */
function drawCrop(
  c: CanvasRenderingContext2D,
  homeX: number,
  homeY: number,
  size: number,
  pose: { x: number; y: number; scale: number; rotation: number },
) {
  c.save();
  c.translate(pose.x, pose.y);
  c.rotate(pose.rotation);
  c.scale(pose.scale, pose.scale);
  c.beginPath();
  c.rect(-size / 2, -size / 2, size, size);
  c.clip();
  c.translate(-homeX, -homeY);
  drawIllustration(c);
  c.restore();
}

function drawStage(c: CanvasRenderingContext2D) {
  c.fillStyle = "#0A0F1C";
  c.fillRect(0, 0, 640, 360);
  c.strokeStyle = "rgba(120, 150, 210, 0.16)";
  c.lineWidth = 1;
  c.beginPath();
  for (let col = 0; col <= GRID.cols; col++) {
    c.moveTo(GRID.x + col * GRID.size, GRID.y);
    c.lineTo(GRID.x + col * GRID.size, GRID.y + IMAGE.h);
  }
  for (let row = 0; row <= GRID.rows; row++) {
    c.moveTo(GRID.x, GRID.y + row * GRID.size);
    c.lineTo(GRID.x + IMAGE.w, GRID.y + row * GRID.size);
  }
  c.stroke();
}

function drawLabels(c: CanvasRenderingContext2D, time: number) {
  c.fillStyle = "rgba(10, 15, 28, 0.78)";
  c.fillRect(8, 10, 236, 20);
  c.fillRect(436, 10, 196, 20);
  c.font = "600 11px ui-monospace, Menlo, monospace";
  c.textAlign = "left";
  c.fillStyle = "#C9D3EA";
  const deleting = time >= TARGETS[0].hop;
  c.fillText(
    deleting ? "SELECT · DELETE  fixed cells" : `MATERIALIZE · ${TILE_COUNT} tiles · 1 image`,
    16,
    24,
  );
  c.textAlign = "right";
  c.fillStyle = "rgba(201, 211, 234, 0.7)";
  c.font = "500 10px ui-monospace, Menlo, monospace";
  c.fillText("ILLUSTRATIVE IMAGE · CODE-DRAWN", 626, 24);
}

function drawProgress(c: CanvasRenderingContext2D, time: number) {
  if (time < TARGETS[0].hop) return;
  const count = deletedCount(time);
  const blocks = TARGETS.map((_, i) => (i < count ? "■" : "□")).join("");
  c.font = "600 12px ui-monospace, Menlo, monospace";
  c.textAlign = "left";
  c.fillStyle = "#E8EDF8";
  c.fillText(`$ rm ./frames/tile_*  [${blocks}]  ${count}/${TARGETS.length}`, GRID.x, 334);
  c.fillStyle = "rgba(232, 237, 248, 0.18)";
  c.fillRect(GRID.x, 342, IMAGE.w, 3);
  c.fillStyle = SELECTION_COLOR;
  c.fillRect(GRID.x, 342, (IMAGE.w * count) / TARGETS.length, 3);
}

export default function motion048(c: CanvasRenderingContext2D, time: number) {
  drawStage(c);
  // Tiles: scattered crops converge, then hold at fixed homes; deleted cells are skipped.
  for (const index of PAINT_ORDER) {
    const state = cellState(index, time);
    if (state === "empty" || state === "fragmenting") continue;
    const pose = tilePose(index, time);
    if (pose.alpha <= 0) continue;
    const home = tileHome(index);
    c.globalAlpha = state === "binary" ? 1 - binaryFade(index, time) : pose.alpha;
    drawCrop(c, home.x + GRID.size / 2, home.y + GRID.size / 2, GRID.size, pose);
    c.globalAlpha = 1;
  }
  // A few straggler specks beside the image, gone before the assembled hold.
  for (const piece of loosePieces(time)) {
    if (piece.alpha <= 0) continue;
    c.fillStyle = `rgba(237, 230, 214, ${0.7 * piece.alpha})`;
    c.fillRect(piece.x, piece.y, piece.size, piece.size);
  }
  // Cell gutters appear once the image is whole: the grid becomes selectable, nothing moves.
  const gutters = ease(
    (time - ASSEMBLY.gridIn.start) / (ASSEMBLY.gridIn.end - ASSEMBLY.gridIn.start),
  );
  if (gutters > 0) {
    c.strokeStyle = `rgba(10, 15, 28, ${0.7 * gutters})`;
    c.lineWidth = 2;
    c.beginPath();
    for (let col = 1; col < GRID.cols; col++) {
      c.moveTo(GRID.x + col * GRID.size, GRID.y);
      c.lineTo(GRID.x + col * GRID.size, GRID.y + IMAGE.h);
    }
    for (let row = 1; row < GRID.rows; row++) {
      c.moveTo(GRID.x, GRID.y + row * GRID.size);
      c.lineTo(GRID.x + IMAGE.w, GRID.y + row * GRID.size);
    }
    c.stroke();
  }
  TARGETS.forEach((target, k) => {
    const index = TARGET_CELLS[k];
    const state = cellState(index, time);
    const home = tileHome(index);
    if (state === "binary") drawBinary(c, k, time);
    if (state === "fragmenting")
      for (let piece = 0; piece < FRAGMENTS * FRAGMENTS; piece++) {
        const pose = fragmentPose(k, piece, time);
        if (pose.alpha <= 0) continue;
        const f = GRID.size / FRAGMENTS;
        c.globalAlpha = pose.alpha;
        drawCrop(c, pose.homeX, pose.homeY, f, pose);
        c.save();
        c.translate(pose.x, pose.y);
        c.rotate(pose.rotation);
        c.scale(pose.scale, pose.scale);
        c.fillStyle = pose.pink ? "#FF8FA3" : SELECTION_COLOR;
        c.globalAlpha = pose.alpha * pose.redness;
        c.fillRect(-f / 2, -f / 2, f, f);
        c.restore();
        c.globalAlpha = 1;
      }
    // Deleted cells keep their position as an empty slot.
    if (state === "empty" || state === "fragmenting") {
      c.strokeStyle = "rgba(120, 150, 210, 0.3)";
      c.lineWidth = 1;
      c.strokeRect(home.x + 2.5, home.y + 2.5, GRID.size - 5, GRID.size - 5);
    }
  });
  const selected = selectionCell(time);
  if (selected !== null) {
    const k = TARGET_CELLS.indexOf(selected);
    const home = tileHome(selected);
    const pop = 1 + 0.12 * (1 - clamp((time - TARGETS[k].hop) / DELETE.popDuration));
    const size = GRID.size * pop;
    const x = home.x + GRID.size / 2 - size / 2;
    const y = home.y + GRID.size / 2 - size / 2;
    c.strokeStyle = SELECTION_COLOR;
    c.lineWidth = 3;
    c.strokeRect(x, y, size, size);
    c.fillStyle = SELECTION_COLOR;
    c.font = "700 9px ui-monospace, Menlo, monospace";
    c.textAlign = "left";
    c.fillText(`[${home.col},${home.row}]`, x, y - 4);
  }
  drawProgress(c, time);
  drawLabels(c, time);
}

function binaryFade(index: number, time: number) {
  const k = TARGET_CELLS.indexOf(index);
  const start = TARGETS[k].hop + DELETE.dwell;
  return clamp((time - start - DELETE.binary * 0.6) / (DELETE.binary * 0.4));
}

/** Binary-fill cell: seeded digit rows on a fixed 8px column grid, clipped to the cell. */
export const BINARY_LAYOUT = { columnX: 5, rowY: 10, pitch: 8 } as const;
function drawBinary(c: CanvasRenderingContext2D, k: number, time: number) {
  const index = TARGET_CELLS[k];
  const home = tileHome(index);
  const start = TARGETS[k].hop + DELETE.dwell;
  const fill = clamp((time - start) / (DELETE.binary * 0.55));
  const fade = binaryFade(index, time);
  c.save();
  c.beginPath();
  c.rect(home.x, home.y, GRID.size, GRID.size);
  c.clip();
  c.fillStyle = `rgba(10, 15, 28, ${0.82 * (1 - fade) * Math.min(1, fill * 3)})`;
  c.fillRect(home.x, home.y, GRID.size, GRID.size);
  c.fillStyle = `rgba(255, 143, 163, ${1 - fade})`;
  c.font = "700 7px ui-monospace, Menlo, monospace";
  c.textAlign = "left";
  const { columnX, rowY, pitch } = BINARY_LAYOUT;
  const rows = Math.ceil(fill * BINARY[k].length);
  for (let row = 0; row < rows; row++)
    [...BINARY[k][row]].forEach((digit, column) =>
      c.fillText(digit, home.x + columnX + column * pitch, home.y + rowY + row * pitch),
    );
  c.restore();
}
