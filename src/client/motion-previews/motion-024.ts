import { ink, accent, dark, clamp, ease, motionProgress } from "./drawing";

/**
 * Focus Reveal.
 * Words rise a few pixels out of blur and sharpen fully before the reading hold. A
 * highlight grows only behind the key word "CREATION". Later the key word is replaced
 * by "MOTION", travelling up through the same line mask while the highlight resizes.
 */

type Word = { text: string; x: number; line: 0 | 1; at: number };
const FONT = "700 34px sans-serif";
const LINE_Y = [150, 216];
// Authored word centres (estimated metrics for a 34px bold sans; see limitations).
const WORDS: Word[] = [
  { text: "FROM", x: 189, line: 0, at: 0.35 },
  { text: "A", x: 256, line: 0, at: 0.5 },
  { text: "ROUGH", x: 338, line: 0, at: 0.65 },
  { text: "IDEA", x: 450, line: 0, at: 0.85 },
  { text: "TO", x: 172, line: 1, at: 1.35 },
  { text: "REAL", x: 252, line: 1, at: 1.5 },
];
const KEY = {
  x: 404,
  line: 1 as const,
  at: 1.7,
  from: "CREATION",
  to: "MOTION",
  widths: [196, 150],
};
const REVEAL = 0.45;
const HIGHLIGHT = { start: 2.25, end: 2.75 };
const SWAP = { start: 4.0, end: 4.6 };

function word(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  progress: number,
  color: string,
) {
  if (progress <= 0) return;
  c.save();
  c.globalAlpha = clamp(progress * 1.4);
  const blur = (1 - progress) * 9;
  c.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
  c.fillStyle = color;
  c.font = FONT;
  c.textAlign = "center";
  c.fillText(text, x, y + (1 - ease(progress)) * 18);
  c.restore();
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  for (const w of WORDS)
    word(c, w.text, w.x, LINE_Y[w.line]!, motionProgress(t, w.at, w.at + REVEAL), ink);

  // Highlight: grows left→right behind the key word only, after it is sharp.
  const grow = motionProgress(t, HIGHLIGHT.start, HIGHLIGHT.end);
  const swap = motionProgress(t, SWAP.start, SWAP.end);
  const width = KEY.widths[0]! + (KEY.widths[1]! - KEY.widths[0]!) * swap;
  const y = LINE_Y[KEY.line]!;
  const box = { x: KEY.x - width / 2 - 6, y: y - 32, w: (width + 12) * grow, h: 44 };
  if (grow > 0) {
    c.fillStyle = accent;
    c.beginPath();
    c.roundRect(box.x, box.y, box.w, box.h, 8);
    c.fill();
  }
  const keyReveal = motionProgress(t, KEY.at, KEY.at + REVEAL);
  const drawKey = (color: string) => {
    if (swap < 1) word(c, KEY.from, KEY.x, y - swap * 50, keyReveal, color);
    if (swap > 0) word(c, KEY.to, KEY.x, y + (1 - swap) * 50, 1, color);
  };
  // Line mask: the key word and its replacement travel through the same box.
  c.save();
  c.beginPath();
  c.rect(KEY.x - 112, y - 38, 224, 52);
  c.clip();
  drawKey(ink);
  // Where the highlight has grown, the same glyphs switch to dark for contrast.
  if (grow > 0) {
    c.beginPath();
    c.rect(box.x, box.y, box.w, box.h);
    c.clip();
    drawKey(dark);
  }
  c.restore();
}
