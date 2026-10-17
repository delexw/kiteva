import { dark, ease, motionDrawing } from "./drawing";

/**
 * Word Smash Cuts.
 * A schedule of word cards. Each cut swaps copy, background and foreground on the
 * same frame; within a card nothing moves (crisp hold, no glitch, no spring). The
 * lead-in adds punctuation to "Let's" without moving the word, emphasis is carried
 * by type scale ("GO BIG" deliberately crosses the frame edges), and the final
 * message holds.
 *
 * Two optional, source-observed handoffs (frame findings f1411–1434, f970–975 and
 * f262–283) replace only the last two clean cuts, keeping escalation coherent:
 * - Burst-masked swap: a spark between glyphs, cream radial spikes behind the word,
 *   the copy swaps at the burst peak and the emphasis word — outlined in dark so it
 *   separates from the spikes — slams down from oversize.
 * - Squash-to-band flip: the whole card collapses in height only to a thin band,
 *   swaps content and colour at minimum height, then expands back. Corner
 *   ornaments arrive with the emphasis cut and stay outside the scaled group.
 * Every state is computed from absolute time; each swap happens at one instant.
 */

const LIME = "#9BFF46",
  PLUM = "#A523A9",
  CREAM = "#FFF8EA";
type Card = {
  start: number;
  copy: string;
  background: string;
  foreground: string;
  size: number;
  leadIn?: boolean;
};
export const BURST = { spark: 3.5, start: 3.62, peak: 3.8, slamEnd: 3.98, clear: 4.0 };
// GO BIG is settled 3.98–4.45 s (≈0.47 s) before the squash; MAKE IT REAL holds from 4.95 s.
export const SQUASH = { start: 4.45, swap: 4.7, end: 4.95, min: 0.04 };
/** Ornaments arrive with the emphasis cut (a scheduled change), not mid-hold. */
export const ORNAMENTS_FROM = BURST.peak;
const CARDS: Card[] = [
  { start: 0, copy: "Let's", background: LIME, foreground: dark, size: 44, leadIn: true },
  { start: 0.4, copy: "Let's.", background: LIME, foreground: dark, size: 44, leadIn: true },
  { start: 0.8, copy: "Let's..", background: LIME, foreground: dark, size: 44, leadIn: true },
  { start: 1.2, copy: "Let's...", background: LIME, foreground: dark, size: 44, leadIn: true },
  { start: 1.7, copy: "MAKE", background: dark, foreground: CREAM, size: 96 },
  { start: 2.4, copy: "SOMETHING", background: LIME, foreground: dark, size: 80 },
  { start: 3.2, copy: "AND", background: PLUM, foreground: CREAM, size: 100 },
  { start: BURST.peak, copy: "GO BIG", background: dark, foreground: LIME, size: 190 },
  { start: SQUASH.swap, copy: "MAKE IT REAL", background: PLUM, foreground: CREAM, size: 65 },
];
// The lead-in word keeps a fixed left edge so added dots never shift it.
const LEAD_IN_LEFT = 320 - 44 * 1.25;
export const SPIKE_COLOR = CREAM;
// Fixed spike geometry (seeded constants; identical on every seek).
const SPIKES = Array.from({ length: 14 }, (_, i) => ({
  angle: (i / 14) * Math.PI * 2 + 0.11,
  length: 150 + ((i * 53) % 90),
}));

const cardAt = (t: number) =>
  CARDS.reduce((current, card) => (t >= card.start ? card : current), CARDS[0]!);

/** Height factor of the squash-to-band handoff (1 outside it). */
export function squashScale(t: number) {
  if (t < SQUASH.start) return 1;
  if (t < SQUASH.swap)
    return 1 - (1 - SQUASH.min) * ease((t - SQUASH.start) / (SQUASH.swap - SQUASH.start));
  return SQUASH.min + (1 - SQUASH.min) * ease((t - SQUASH.swap) / (SQUASH.end - SQUASH.swap));
}

function copy(c: CanvasRenderingContext2D, card: Card, outline = false) {
  const { text } = motionDrawing(c);
  const baseline = 180 + card.size * 0.34; // optical vertical centring for caps
  if (card.leadIn) {
    c.fillStyle = card.foreground;
    c.font = `600 ${card.size}px sans-serif`;
    c.textAlign = "left";
    c.fillText(card.copy, LEAD_IN_LEFT, baseline);
    return;
  }
  if (outline) {
    // A dark keyline separates the incoming word from the spikes behind it.
    c.font = `600 ${card.size}px sans-serif`;
    c.textAlign = "center";
    c.lineJoin = "round";
    c.strokeStyle = dark;
    c.lineWidth = 12;
    c.strokeText(card.copy, 320, baseline);
  }
  text(card.copy, 320, baseline, card.size, card.foreground);
}

function burst(c: CanvasRenderingContext2D, t: number) {
  // Spark anticipation between the glyphs.
  if (t >= BURST.spark && t < BURST.start) {
    const s = 4 + 14 * ((t - BURST.spark) / (BURST.start - BURST.spark));
    c.fillStyle = LIME;
    c.beginPath();
    c.moveTo(338, 150 - s);
    c.lineTo(342, 150);
    c.lineTo(338 + s, 154);
    c.lineTo(342, 158);
    c.lineTo(338, 158 + s);
    c.lineTo(334, 158);
    c.lineTo(338 - s, 154);
    c.lineTo(334, 150);
    c.closePath();
    c.fill();
  }
  const grow =
    t < BURST.peak
      ? ease((t - BURST.start) / (BURST.peak - BURST.start))
      : 1 - ease((t - BURST.peak) / (BURST.clear - BURST.peak));
  if (t < BURST.start || t >= BURST.clear || grow <= 0) return;
  c.fillStyle = SPIKE_COLOR;
  c.beginPath();
  SPIKES.forEach((spike, i) => {
    const inner = 40 * grow,
      outer = 40 * grow + spike.length * grow;
    const half = Math.PI / SPIKES.length;
    const a = spike.angle;
    const point = (r: number, angle: number) => [
      320 + Math.cos(angle) * r,
      172 + Math.sin(angle) * r,
    ];
    const [x0, y0] = point(inner, a - half);
    const [x1, y1] = point(outer, a);
    const [x2, y2] = point(inner, a + half);
    if (i === 0) c.moveTo(x0!, y0!);
    else c.lineTo(x0!, y0!);
    c.lineTo(x1!, y1!);
    c.lineTo(x2!, y2!);
  });
  c.closePath();
  c.fill();
}

/** Two-tone corner brackets (dark keyline, cream core) read on dark, plum and cream. */
function ornaments(c: CanvasRenderingContext2D) {
  for (const [color, width] of [
    [dark, 6],
    [CREAM, 3],
  ] as const) {
    c.strokeStyle = color;
    c.lineWidth = width;
    for (const [x, y, dx, dy] of [
      [18, 18, 1, 1],
      [622, 18, -1, 1],
      [18, 342, 1, -1],
      [622, 342, -1, -1],
    ] as const) {
      c.beginPath();
      c.moveTo(x + dx * 22, y);
      c.lineTo(x, y);
      c.lineTo(x, y + dy * 22);
      c.stroke();
    }
  }
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const card = cardAt(t);
  if (t >= SQUASH.start) {
    // Squash-to-band: one scaled group (field + copy) about the mid-frame band.
    const sy = squashScale(t);
    c.fillStyle = CREAM;
    c.fillRect(0, 0, 640, 360);
    c.save();
    c.translate(0, 180);
    c.scale(1, sy);
    c.translate(0, -180);
    c.fillStyle = card.background;
    c.fillRect(0, 0, 640, 360);
    copy(c, card);
    c.restore();
  } else {
    c.fillStyle = card.background;
    c.fillRect(0, 0, 640, 360);
    const inBurst = t >= BURST.spark && t < BURST.clear;
    if (inBurst) burst(c, t);
    // Oversized slam: word B lands at the burst peak and settles to its readable size.
    const slam = t >= BURST.peak ? 1 - ease((t - BURST.peak) / (BURST.slamEnd - BURST.peak)) : 0;
    const outline = inBurst && t >= BURST.peak;
    if (slam > 0) {
      c.save();
      c.translate(320, 180);
      c.scale(1 + 0.6 * slam, 1 + 0.6 * slam);
      c.translate(-320, -180);
      copy(c, card, outline);
      c.restore();
    } else copy(c, card, outline);
  }
  if (t >= ORNAMENTS_FROM) ornaments(c);
}
