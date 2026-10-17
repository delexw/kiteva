import { ink, accent, warm, dark, motionProgress, motionDrawing } from "./drawing";

/**
 * UI Recompose.
 * The same "hello" note card travels from a hero layout into the first row of a
 * notes app: its rect, corner radius, type size and avatar position interpolate
 * together while the surrounding layout (toolbar, sibling rows, detail pane) arrives
 * around it. The text is left-anchored throughout so it never jumps alignment. The
 * avatar, which must travel from the right of the title to its left, hops over the
 * shrinking title on a late-peaking arc instead of sliding through the letters.
 *
 * Morphing-connector option (frame finding f173–222): once the layout has settled, a
 * connector at the seam between the selected row and its detail pane changes meaning
 * in held, stepped keyframes — zig-zag, "~", "×", ")(", "][" — and the bracket halves
 * split outward into corner brackets that end exactly on each card's corners, while
 * small checker tiles pop at the seam. The source's card convergence is not shown.
 */

export type Layout = {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  size: number;
  textX: number;
  textY: number;
  avatarX: number;
  avatarY: number;
  avatarR: number;
};
const HERO: Layout = {
  x: 70,
  y: 60,
  w: 500,
  h: 230,
  radius: 18,
  size: 54,
  textX: 248,
  textY: 192,
  avatarX: 520,
  avatarY: 108,
  avatarR: 18,
};
const ROW: Layout = {
  x: 40,
  y: 92,
  w: 260,
  h: 62,
  radius: 31,
  size: 22,
  textX: 104,
  textY: 131,
  avatarX: 72,
  avatarY: 123,
  avatarR: 16,
};
const SIBLINGS = [
  { label: "meeting notes", color: "#B6C9E8" },
  { label: "groceries", color: accent },
];

const mix = (a: number, b: number, p: number) => a + (b - a) * p;

// Connector keyframes are stepped (each held well over two frames at 30 fps).
export const CONNECTOR_STAGES = [
  { stage: "zigzag", start: 2.7 },
  { stage: "tilde", start: 2.95 },
  { stage: "cross", start: 3.12 },
  { stage: "parens", start: 3.29 },
  { stage: "brackets", start: 3.46 },
] as const;
export const BRACKET_SPLIT = { start: 3.62, end: 3.95 };
export const CONNECTOR_SCALE = 1.5;
/** Peak upward hop of the avatar while it passes over the shrinking title. */
export const AVATAR_HOP = 52;
const RECOMPOSE = { start: 1.0, end: 2.5 };

/** Interpolated card layout at time t; the avatar hops above the title on a late-peaking arc. */
export function layoutAt(t: number): Layout {
  const p = motionProgress(t, RECOMPOSE.start, RECOMPOSE.end);
  const L = Object.fromEntries(
    (Object.keys(HERO) as (keyof Layout)[]).map((k) => [k, mix(HERO[k], ROW[k], p)]),
  ) as Layout;
  // p³ shifts the arc's peak late (p ≈ 0.79), where the avatar actually passes over the
  // text (p ≈ 0.54–0.95); the lift is exactly 0 at both ends, so the hero and row layouts
  // are unchanged.
  const lift = p <= 0 || p >= 1 ? 0 : AVATAR_HOP * Math.sin(Math.PI * Math.pow(p, 3));
  return { ...L, avatarY: L.avatarY - lift };
}
const SEAM = { x: 310, y: 123 };
type Box = { x: number; y: number; w: number; h: number };
export const FRAMED: { row: Box; pane: Box } = {
  row: { x: ROW.x, y: ROW.y, w: ROW.w, h: ROW.h },
  pane: { x: 320, y: 92, w: 300, h: 244 },
};

export function connectorStage(t: number) {
  let current: (typeof CONNECTOR_STAGES)[number]["stage"] | null = null;
  for (const entry of CONNECTOR_STAGES) if (t >= entry.start) current = entry.stage;
  return current;
}

/** Corner-bracket vertices for both cards, travelling from the seam to the exact corners. */
export function bracketCorners(t: number) {
  const split = motionProgress(t, BRACKET_SPLIT.start, BRACKET_SPLIT.end);
  return (["row", "pane"] as const).flatMap((key) => {
    const box = FRAMED[key];
    const side = key === "row" ? -1 : 1;
    return [
      { x: box.x, y: box.y, dx: 1, dy: 1 },
      { x: box.x + box.w, y: box.y, dx: -1, dy: 1 },
      { x: box.x, y: box.y + box.h, dx: 1, dy: -1 },
      { x: box.x + box.w, y: box.y + box.h, dx: -1, dy: -1 },
    ].map((corner) => {
      // At the seam the four L-shapes of one card stack into a single "]" or "[" half.
      const seamX = SEAM.x + side * 6,
        seamY = SEAM.y + (corner.dy > 0 ? -12 : 12);
      return {
        x: mix(seamX, corner.x, split),
        y: mix(seamY, corner.y, split),
        // "]" (arms left) for the row half, "[" (arms right) for the pane half; arms turn
        // to point along each card edge halfway through the split.
        dx: split >= 0.5 ? corner.dx : side,
        dy: corner.dy,
      };
    });
  });
}

function connector(c: CanvasRenderingContext2D, t: number) {
  const stage = connectorStage(t);
  if (!stage) return;
  c.strokeStyle = warm;
  c.lineWidth = 3;
  c.lineCap = "round";
  // Symbol stages are drawn 1.5× about the seam so they read at card size; the final
  // brackets are drawn unscaled so they still end exactly on the card corners.
  const symbol = stage !== "brackets";
  if (symbol) {
    c.save();
    c.translate(SEAM.x, SEAM.y);
    c.scale(CONNECTOR_SCALE, CONNECTOR_SCALE);
    c.translate(-SEAM.x, -SEAM.y);
  }
  c.beginPath();
  const { x, y } = SEAM;
  if (stage === "zigzag") {
    const drawn = motionProgress(t, 2.7, 2.85);
    const points = [-10, -6, -2, 2, 6, 10];
    c.moveTo(x - 10, y);
    points.slice(1).forEach((px, i) => {
      if ((i + 1) / (points.length - 1) <= drawn + 1e-9) c.lineTo(x + px, y + (i % 2 ? 5 : -5));
    });
  } else if (stage === "tilde") {
    c.moveTo(x - 10, y + 2);
    c.quadraticCurveTo(x - 5, y - 7, x, y);
    c.quadraticCurveTo(x + 5, y + 7, x + 10, y - 2);
  } else if (stage === "cross") {
    c.moveTo(x - 7, y - 7);
    c.lineTo(x + 7, y + 7);
    c.moveTo(x + 7, y - 7);
    c.lineTo(x - 7, y + 7);
  } else if (stage === "parens") {
    c.arc(x - 12, y, 12, -0.9, 0.9);
    c.moveTo(x + 12 + Math.cos(Math.PI - 0.9) * 12, y + Math.sin(Math.PI - 0.9) * 12);
    c.arc(x + 12, y, 12, Math.PI - 0.9, Math.PI + 0.9);
  }
  c.stroke();
  if (symbol) {
    c.restore();
    return;
  }
  // "][" splits into corner brackets that end exactly at each card's corners.
  const len = 12;
  for (const corner of bracketCorners(t)) {
    c.beginPath();
    c.moveTo(corner.x + corner.dx * len, corner.y);
    c.lineTo(corner.x, corner.y);
    c.lineTo(corner.x, corner.y + corner.dy * len);
    c.stroke();
  }
  // Checker tiles pop at the seam as the brackets leave.
  const pop = motionProgress(t, BRACKET_SPLIT.start, BRACKET_SPLIT.start + 0.15);
  if (pop > 0)
    for (let k = 0; k < 4; k++) {
      c.fillStyle = k % 2 ? ink : warm;
      const s = 5 * pop;
      c.fillRect(SEAM.x - s + (k % 2) * s, SEAM.y + 32 - s + Math.floor(k / 2) * s, s, s);
    }
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  const p = motionProgress(t, RECOMPOSE.start, RECOMPOSE.end);
  const chrome = motionProgress(t, 1.6, 2.4);
  const L = layoutAt(t);

  // Surrounding layout arrives around the moving card.
  c.globalAlpha = chrome;
  c.fillStyle = "#1C2B35";
  c.beginPath();
  c.roundRect(20, 24, 600, 48, 12);
  c.fill();
  text("NOTES", 70, 54, 15, ink);
  c.fillStyle = "#2E4757";
  c.beginPath();
  c.roundRect(470, 36, 130, 24, 12);
  c.fill();
  text("+ new", 535, 53, 13, "#9FB0BC");
  // Detail pane on the right shows the selected note's content.
  c.fillStyle = "#162733";
  c.beginPath();
  c.roundRect(320, 92, 300, 244, 14);
  c.fill();
  c.textAlign = "left";
  c.fillStyle = ink;
  c.font = "700 20px sans-serif";
  c.fillText("hello", 344, 128);
  c.fillStyle = "#4C6172";
  for (let i = 0; i < 4; i++) c.fillRect(344, 148 + i * 22, 240 - i * 34, 8);
  c.globalAlpha = 1;
  // Sibling rows slide up into the list below the card.
  SIBLINGS.forEach((row, i) => {
    const local = motionProgress(t, 1.8 + i * 0.15, 2.5 + i * 0.15);
    if (local <= 0) return;
    const y = 170 + i * 78 + (1 - local) * 40;
    c.globalAlpha = local;
    c.fillStyle = "#22343F";
    c.beginPath();
    c.roundRect(40, y, 260, 62, 31);
    c.fill();
    circle(72, y + 31, 16, row.color);
    c.textAlign = "left";
    c.fillStyle = ink;
    c.font = "600 20px sans-serif";
    c.fillText(row.label, 104, y + 38);
    c.globalAlpha = 1;
  });

  // The persistent card: one object whose geometry is interpolated, never swapped.
  c.fillStyle = ink;
  c.beginPath();
  c.roundRect(L.x, L.y, L.w, L.h, L.radius);
  c.fill();
  c.strokeStyle = accent;
  c.lineWidth = 2 + 2 * p;
  c.stroke();
  circle(L.avatarX, L.avatarY, L.avatarR, warm);
  c.textAlign = "left";
  c.fillStyle = dark;
  c.font = `700 ${L.size.toFixed(2)}px sans-serif`;
  c.fillText("hello", L.textX, L.textY);
  // Hero-only subline fades as the card compacts.
  c.globalAlpha = 1 - motionProgress(t, 1.0, 1.4);
  c.font = "500 16px sans-serif";
  c.fillStyle = "#4A5E6C";
  c.fillText("a new note · just now", 248, 226);
  c.globalAlpha = 1;
  connector(c, t);
}
