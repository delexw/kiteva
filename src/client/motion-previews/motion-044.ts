import { clamp, ease, motionProgress } from "./drawing";

/**
 * Glyph Ink-Flood Container Handoff.
 * A settled title becomes the next scene's container. Each glyph's ink dilates (a
 * round-joined stroke of the glyph outline is a morphological dilation), centre glyphs
 * first, until counters and gaps close and the word fuses into one block whose rim
 * still follows the outer letter silhouettes. The locked block is recoloured to the
 * container hue and expands into the panel; the incoming title writes on only after
 * the panel is complete. Every value is a pure function of absolute time; the ragged
 * rim uses a fixed offset table, so it never boils during holds.
 */

type Rect = { x: number; y: number; w: number; h: number };
const PAPER = "#D9DED8";
const INK = "#16191F";
const CONTAINER = "#1C2C4C";
const INCOMING = "#F3F5F0";
const DAB = "#3FCFAE";
const OUTGOING = "FORMAT";
const GLYPH = { size: 104, step: 82, baseline: 214, top: 136, bottom: 216 };
const glyphX = (i: number) => 320 + (i - (OUTGOING.length - 1) / 2) * GLYPH.step;
// Seed in the middle: rank 0 for the two centre glyphs, then outward.
const RANK = Array.from(OUTGOING, (_, i) => Math.floor(Math.abs(i - (OUTGOING.length - 1) / 2)));
export const INK_FLOOD = {
  hold: 1.6,
  rankDelay: 0.16,
  dilate: 0.42,
  maxRadius: 27,
  lock: 2.5,
  recolor: { start: 2.5, end: 2.72 },
  expand: { start: 2.72, end: 3.55 },
  panelComplete: 3.55,
  write: { start: 3.62, end: 4.3 },
};
// Fixed ragged-rim offsets (seeded once, never time-dependent).
const RIM = [
  [2.6, -1.8],
  [-2.2, 2.4],
  [1.4, 3.1],
] as const;
const CORE: Rect = {
  x: glyphX(0),
  y: GLYPH.top + 4,
  w: glyphX(OUTGOING.length - 1) - glyphX(0),
  h: GLYPH.bottom - GLYPH.top - 8,
};
export const PANEL: Rect = { x: 44, y: 46, w: 552, h: 268 };
/** Locked block bounds (core plus rim) from which the panel expands. */
export const EXPAND_FROM: Rect = { x: CORE.x - 30, y: CORE.y - 14, w: CORE.w + 60, h: CORE.h + 28 };

const font = (size: number) =>
  `900 ${size}px Impact, "Arial Narrow Bold", "Arial Black", sans-serif`;
const mixRect = (a: Rect, b: Rect, p: number): Rect => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  w: a.w + (b.w - a.w) * p,
  h: a.h + (b.h - a.h) * p,
});

/** Dilation radius of glyph i at time t. */
export function glyphRadius(i: number, t: number) {
  const start = INK_FLOOD.hold + RANK[i]! * INK_FLOOD.rankDelay;
  return INK_FLOOD.maxRadius * motionProgress(t, start, start + INK_FLOOD.dilate);
}

function brackets(c: CanvasRenderingContext2D) {
  c.strokeStyle = INK;
  c.lineWidth = 3;
  const corner = (x: number, y: number, dx: number, dy: number) => {
    c.beginPath();
    c.moveTo(x + dx * 26, y);
    c.lineTo(x, y);
    c.lineTo(x, y + dy * 26);
    c.stroke();
  };
  corner(22, 22, 1, 1);
  corner(618, 22, -1, 1);
  corner(22, 338, 1, -1);
  corner(618, 338, -1, -1);
  // Registration crosses and a top tick: fixed technical ornaments.
  c.lineWidth = 2;
  for (const [x, y] of [
    [34, 180],
    [606, 180],
  ] as const) {
    c.beginPath();
    c.moveTo(x - 5, y - 5);
    c.lineTo(x + 5, y + 5);
    c.moveTo(x + 5, y - 5);
    c.lineTo(x - 5, y + 5);
    c.stroke();
  }
  c.fillStyle = INK;
  c.fillRect(314, 12, 12, 4);
  c.fillRect(318, 16, 4, 6);
}

/** Draw the outgoing word, its dilated silhouette and (once locked) the hole-free core. */
function inkWord(c: CanvasRenderingContext2D, t: number, color: string) {
  c.font = font(GLYPH.size);
  c.textAlign = "center";
  c.lineJoin = "round";
  c.fillStyle = color;
  c.strokeStyle = color;
  Array.from(OUTGOING).forEach((glyph, i) => {
    const x = glyphX(i);
    const radius = glyphRadius(i, t);
    if (radius > 0) {
      c.lineWidth = radius * 2;
      // Two fixed sub-offsets roughen the dilated rim like a choked photocopy edge.
      const rim = RIM[i % RIM.length]!;
      c.strokeText(glyph, x, GLYPH.baseline);
      c.strokeText(glyph, x + rim[0] * (radius / INK_FLOOD.maxRadius), GLYPH.baseline + rim[1]);
    }
    c.fillText(glyph, x, GLYPH.baseline);
  });
  // After every glyph has fully dilated, a core fill guarantees no counter survives.
  if (t >= INK_FLOOD.lock) c.fillRect(CORE.x, CORE.y, CORE.w, CORE.h);
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  c.fillStyle = PAPER;
  c.fillRect(0, 0, 640, 360);
  // Faint paper grain rows (fixed geometry).
  c.fillStyle = "rgba(22, 25, 31, 0.05)";
  for (let row = 0; row < 18; row++) c.fillRect(0, 8 + row * 20, 640, 1);

  const recolor = motionProgress(t, INK_FLOOD.recolor.start, INK_FLOOD.recolor.end);
  const expand = motionProgress(t, INK_FLOOD.expand.start, INK_FLOOD.expand.end);

  if (recolor < 1) inkWord(c, t, INK);
  if (recolor > 0) {
    // The container hue arrives over the locked block, still inheriting its silhouette.
    c.globalAlpha = recolor;
    inkWord(c, t, CONTAINER);
    c.globalAlpha = 1;
  }
  if (expand > 0) {
    // The block's bounds grow into the panel; the glyph rim stays underneath and is absorbed.
    // expand is already smoothstep-eased by motionProgress; easing once avoids lingering ends.
    const rect = mixRect(EXPAND_FROM, PANEL, expand);
    c.fillStyle = CONTAINER;
    c.fillRect(rect.x, rect.y, rect.w, rect.h);
    // A few rough rim notches relax as the panel settles.
    const rough = 1 - expand;
    if (rough > 0) {
      for (let k = 0; k < 8; k++) {
        const w = 18 + ((k * 13) % 22);
        c.fillRect(rect.x + 20 + k * (rect.w / 8), rect.y - 6 * rough, w, 6 * rough);
        c.fillRect(rect.x + 34 + k * (rect.w / 8), rect.y + rect.h, w * 0.8, 5 * rough);
      }
    }
  }
  brackets(c);

  // data-reveal-after="panel": the incoming title waits for the completed container.
  if (t >= INK_FLOOD.panelComplete) {
    const write = clamp(
      (t - INK_FLOOD.write.start) / (INK_FLOOD.write.end - INK_FLOOD.write.start),
    );
    if (write > 0) {
      c.save();
      c.beginPath();
      c.rect(PANEL.x, PANEL.y, (PANEL.w - 0) * ease(write), PANEL.h);
      c.clip();
      c.fillStyle = INCOMING;
      c.font = font(86);
      c.textAlign = "left";
      c.fillText("NEW FRAME", 86, 214);
      c.font = "700 18px sans-serif";
      c.fillText("CHAPTER 02 · THE TEMPLATE", 90, 252);
      c.restore();
    }
    const dab = motionProgress(t, 4.32, 4.55);
    if (dab > 0) {
      c.fillStyle = DAB;
      c.beginPath();
      c.moveTo(500, 138);
      c.lineTo(500 + 58 * dab, 128);
      c.lineTo(504 + 58 * dab, 142);
      c.lineTo(504, 150);
      c.closePath();
      c.fill();
    }
  }
}
