import { motionProgress, motionDrawing } from "./drawing";

/**
 * Glitch Type Build.
 * Each glyph of "FLIGHT" is anchored at its final position (one translate per glyph)
 * and enters oversized, blurred and split into red/cyan echoes that step in discrete
 * glitch frames. It overlaps its settled neighbours while large, then shrinks into a
 * sharp, exactly-unit-scale glyph. Settled glyphs never move; the title is complete
 * by 1.4 s and holds unchanged.
 *
 * Ghost-smear option (frame finding f613–631, f860–873): after the title has held,
 * a subtitle builds left to right in place — each glyph first appears at its final
 * size and position as a faint vertically streaked ghost, then snaps solid. No
 * oversize, overlap, scale or translate is used, so settled glyphs never move.
 */

const TITLE = "FLIGHT";
const ANCHOR = { x: 95, step: 89, y: 200 };
const FIRST = 0.12,
  STAGGER = 0.18,
  ENTRY = 0.38;
const BACKGROUND = "#070F0C";
const SETTLED = "#F4ECD7";
const ECHO = ["#E83A20", "#71E8BD"] as const;
// In-place ghost-smear subtitle: fixed anchors, one glyph every 0.09 s, 0.1 s ghost.
export const GHOST_LINE = { copy: "TAKES OFF", x: 184, step: 34, y: 284, size: 40 };
export const GHOST = { first: 2.3, stagger: 0.09, ghost: 0.1 };
const GHOST_INK = "#8C968F";
const STREAKS = [-14, -7, 7, 14];

/** "ghost" before solid, "solid" afterwards, null before the glyph appears. */
export function ghostState(index: number, t: number) {
  const start = GHOST.first + index * GHOST.stagger;
  if (t < start) return null;
  return t < start + GHOST.ghost ? "ghost" : "solid";
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  c.fillStyle = BACKGROUND;
  c.fillRect(0, 0, 640, 360);
  // Faint ring centred on the title as a fixed compositional anchor.
  c.strokeStyle = "#68271F";
  c.lineWidth = 1;
  c.beginPath();
  c.arc(ANCHOR.x + (ANCHOR.step * (TITLE.length - 1)) / 2, 180, 170, 0, Math.PI * 2);
  c.stroke();

  Array.from(TITLE).forEach((glyph, i) => {
    const start = FIRST + i * STAGGER;
    if (t < start) return;
    const progress = motionProgress(t, start, start + ENTRY);
    const remaining = 1 - progress;
    c.save();
    c.translate(ANCHOR.x + i * ANCHOR.step, ANCHOR.y);
    // Oversized entrance with a quadratic fall-off; exactly 1 once settled.
    const scale = progress >= 1 ? 1 : 1 + remaining * remaining * 4;
    c.scale(scale, scale);
    c.filter = `blur(${(remaining * 3).toFixed(3)}px)`;
    if (remaining > 0.01) {
      // Echo offsets jump between discrete glitch frames instead of sliding.
      const frame = Math.floor(progress * 8);
      const jitter = ((frame * 5 + i * 3) % 7) - 3;
      const offset = remaining * 6 + jitter * remaining;
      c.globalAlpha = remaining * 0.8;
      text(glyph, -offset, -offset * 0.3, 72, ECHO[0]);
      text(glyph, offset, offset * 0.3, 72, ECHO[1]);
      // A torn scanline slice through the glyph while it is still unstable.
      if (frame % 3 === 1) {
        c.globalAlpha = remaining;
        c.fillStyle = ECHO[frame % 2];
        c.fillRect(-34 + jitter * 3, -38 + ((frame * 11) % 30), 68, 3);
      }
    }
    c.globalAlpha = 1;
    text(glyph, 0, 0, 72, SETTLED);
    c.restore();
  });

  Array.from(GHOST_LINE.copy).forEach((glyph, i) => {
    if (glyph === " ") return;
    const state = ghostState(i, t);
    if (!state) return;
    const x = GHOST_LINE.x + i * GHOST_LINE.step;
    if (state === "ghost") {
      // Faint grey smear at the final position: vertical echoes, no scale or offset in x.
      const shift = ((i * 5) % 3) - 1;
      c.globalAlpha = 0.14;
      for (const dy of STREAKS)
        text(glyph, x, GHOST_LINE.y + dy + shift, GHOST_LINE.size, GHOST_INK);
      c.globalAlpha = 0.4;
      text(glyph, x, GHOST_LINE.y, GHOST_LINE.size, GHOST_INK);
      c.globalAlpha = 1;
    } else text(glyph, x, GHOST_LINE.y, GHOST_LINE.size, SETTLED);
  });
}
