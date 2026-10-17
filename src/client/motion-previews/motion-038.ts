import { ink, warm, dark, ease, clamp, motionProgress, motionDrawing } from "./drawing";

/**
 * Punctuation Zoom.
 * The sentence's own full stop is the shared element. The sentence is right-aligned
 * so the stop sits exactly after its last letter. The view pans onto the stop while
 * zooming exponentially (constant perceived speed) up to 64×, where the dot fills the
 * frame; the next composition is then revealed inside that warm punctuation field.
 *
 * Keyword-glyph portal option (frame finding f917–969): the revealed chapter opens
 * with a semantically key glyph — the pilcrow ¶, the sign for "text" — set as a white
 * ruled-paper tile in the headline line ("¶ NEXT CHAPTER"). After a reading hold it
 * morphs through authored keyframes into a lined page (the bowl slides and flattens
 * into the colour patch, stems → ruled lines; never a crossfade), emits a
 * tilted picture card from its centre with a seeded spike burst, and the card
 * straightens until its illustration fills the frame.
 */

const SENTENCE = "Then came a pause";
const TEXT_END = { x: 452, y: 196 };
const DOT = { x: 462, y: 190, r: 6 }; // 64 × 6 = 384 px radius: covers the 367 px half-diagonal
const ZOOM = { start: 1.0, end: 2.4, max: 64 };
const REVEAL = { start: 2.55, end: 3.2 };
export const GLYPH_PORTAL = {
  // The key glyph sits in the headline line, just left of "NEXT CHAPTER" ("¶ NEXT CHAPTER"),
  // at about 85 px so its morph reads at card size.
  tile: { x: 126, y: 178 },
  scale: 1.85,
  morph: { start: 3.8, end: 4.2 },
  emit: { start: 4.2, end: 4.75 },
  caption: { start: 4.8, end: 5.05 },
};
const PAPER_WHITE = "#FBF8F1";
const RULE = "#9DB7D6";
const PATCH = "#2E8FA6";
const SPIKE_COLORS = ["#FFFFFF", dark, "#2E8FA6", "#FFD23F"];
// Seeded spike geometry: fixed, identical on every seek.
const SPIKES = Array.from({ length: 18 }, (_, i) => ({
  angle: (i / 18) * Math.PI * 2 + ((i * 7) % 4) * 0.05,
  length: 90 + ((i * 41) % 80),
  color: SPIKE_COLORS[i % SPIKE_COLORS.length]!,
}));
const mix = (a: number, b: number, p: number) => a + (b - a) * p;

/** Bowl centre in tile-local units: pilcrow bowl at m = 0, page patch centre at m = 1. */
export function bowlCenter(m: number, h = mix(46, 54, m)): [number, number] {
  return [mix(-4, 0, m), mix(-8, -h / 2 + 13, m)];
}

/** The key glyph tile, morphing from pilcrow (m = 0) to a ruled page with a patch (m = 1). */
function glyphTile(c: CanvasRenderingContext2D, m: number) {
  const { x, y } = GLYPH_PORTAL.tile;
  const w = mix(46, 40, m),
    h = mix(46, 54, m);
  c.save();
  c.translate(x, y);
  c.scale(GLYPH_PORTAL.scale, GLYPH_PORTAL.scale);
  c.fillStyle = PAPER_WHITE;
  c.fillRect(-w / 2, -h / 2, w, h);
  // Faint ruled-paper lines are always part of the tile's material.
  c.fillStyle = RULE;
  for (let k = 0; k < 4; k++) c.fillRect(-w / 2 + 4, -h / 2 + 9 + k * (h / 4.4), w - 8, 1);
  // Bowl → colour patch as one travelling part: the bowl slides to the patch position
  // while it shrinks, and the patch grows out of the bowl's current centre.
  const [bx, by] = bowlCenter(m, h);
  if (m > 0) {
    const pw = (w - 12) * m,
      ph = 14 * m;
    c.fillStyle = PATCH;
    c.fillRect(bx - pw / 2, by - ph / 2, pw, ph);
  }
  const bowlR = mix(9, 0, m);
  if (bowlR > 0.2) {
    c.fillStyle = dark;
    c.beginPath();
    c.arc(bx, by, bowlR, Math.PI / 2, (Math.PI * 3) / 2);
    c.closePath();
    c.fill();
  }
  // Two stems rotate from vertical (pilcrow) to horizontal text lines (page).
  c.fillStyle = dark;
  const angle = (Math.PI / 2) * m;
  for (const [sx, sy] of [
    [-3, 0],
    [5, 0],
  ] as const) {
    c.save();
    c.translate(mix(sx, -2, m), mix(sy, 8 + (sx > 0 ? 8 : 0), m));
    c.rotate(angle);
    const len = mix(30, 26, m);
    c.fillRect(-1.6, -len / 2, 3.2, len);
    c.restore();
  }
  c.restore();
}

/** The emitted picture card's illustration in a 640×360 local frame. */
function picture(c: CanvasRenderingContext2D) {
  c.fillStyle = "#1E3A52";
  c.fillRect(0, 0, 640, 360);
  c.fillStyle = "#FFD23F";
  c.beginPath();
  c.arc(470, 110, 52, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = PATCH;
  c.beginPath();
  c.moveTo(0, 360);
  c.quadraticCurveTo(170, 170, 330, 270);
  c.quadraticCurveTo(470, 200, 640, 260);
  c.lineTo(640, 360);
  c.closePath();
  c.fill();
  c.fillStyle = warm;
  c.beginPath();
  c.moveTo(0, 360);
  c.quadraticCurveTo(220, 290, 400, 330);
  c.quadraticCurveTo(540, 300, 640, 340);
  c.lineTo(640, 360);
  c.closePath();
  c.fill();
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  const z = motionProgress(t, ZOOM.start, ZOOM.end);
  if (z < 1) {
    // Exponential zoom about a view centre that travels from the frame centre to the dot.
    const scale = Math.pow(ZOOM.max, z);
    const pan = ease(Math.min(1, z * 1.6));
    const viewX = 320 + (DOT.x - 320) * pan,
      viewY = 180 + (DOT.y - 180) * pan;
    c.save();
    c.translate(320, 180);
    c.scale(scale, scale);
    c.translate(-viewX, -viewY);
    c.textAlign = "right";
    c.fillStyle = ink;
    c.font = "600 40px sans-serif";
    c.fillText(SENTENCE, TEXT_END.x, TEXT_END.y);
    circle(DOT.x, DOT.y, DOT.r, warm);
    c.restore();
    return;
  }
  // Inside the punctuation field: the dot now is the whole frame.
  c.save();
  c.translate(320, 180);
  c.scale(ZOOM.max, ZOOM.max);
  c.translate(-DOT.x, -DOT.y);
  circle(DOT.x, DOT.y, DOT.r, warm);
  c.restore();
  c.fillStyle = warm;
  c.fillRect(0, 0, 640, 360);
  const reveal = motionProgress(t, REVEAL.start, REVEAL.end);
  const emit = motionProgress(t, GLYPH_PORTAL.emit.start, GLYPH_PORTAL.emit.end);
  if (reveal > 0 && emit < 1) {
    c.globalAlpha = reveal;
    const rise = (1 - reveal) * 16;
    // Dark ink at 20 px: readable on the warm field at card size.
    text("CHAPTER 2", 320, 146 + rise, 20, dark);
    text("NEXT CHAPTER", 320, 190, 38, dark);
    // A small dot under the title echoes the mark we travelled through.
    circle(320, 226 + rise, 6, dark);
    c.save();
    c.translate(0, rise);
    glyphTile(c, motionProgress(t, GLYPH_PORTAL.morph.start, GLYPH_PORTAL.morph.end));
    c.restore();
    c.globalAlpha = 1;
  }
  if (emit > 0) {
    const { x, y } = GLYPH_PORTAL.tile;
    // Spike burst from the glyph centre, peaking early and clearing before the land.
    const spikes = clamp(emit * 3) * (1 - clamp((emit - 0.55) / 0.35));
    if (spikes > 0)
      for (const spike of SPIKES) {
        c.fillStyle = spike.color;
        const len = spike.length * spikes * (1 + emit * 2);
        c.beginPath();
        c.moveTo(x + Math.cos(spike.angle - 0.07) * 20, y + Math.sin(spike.angle - 0.07) * 20);
        c.lineTo(x + Math.cos(spike.angle) * (20 + len), y + Math.sin(spike.angle) * (20 + len));
        c.lineTo(x + Math.cos(spike.angle + 0.07) * 20, y + Math.sin(spike.angle + 0.07) * 20);
        c.closePath();
        c.fill();
      }
    // The emitted card grows from the glyph centre and de-rotates to 0°.
    const e = ease(emit);
    // Starts at the enlarged tile's size (≈85 px of the 668 px card) and fills the frame.
    const scale = mix(0.12, 1.04, e);
    const rotation = mix(-0.24, 0, e);
    const cx = mix(x, 320, e),
      cy = mix(y, 180, e);
    c.save();
    c.translate(cx, cy);
    c.rotate(rotation);
    c.scale(scale, scale);
    c.translate(-320, -180);
    c.fillStyle = PAPER_WHITE;
    c.fillRect(-14, -14, 668, 388);
    picture(c);
    c.restore();
  }
  // data-reveal-after="picture-card": caption waits for the landed card.
  const caption = motionProgress(t, GLYPH_PORTAL.caption.start, GLYPH_PORTAL.caption.end);
  if (emit >= 1 && caption > 0) {
    c.globalAlpha = caption;
    c.fillStyle = "rgba(20, 33, 43, 0.82)";
    c.beginPath();
    c.roundRect(170, 288, 300, 44, 10);
    c.fill();
    text("the text became a picture", 320, 317, 18, ink);
    c.globalAlpha = 1;
  }
}
