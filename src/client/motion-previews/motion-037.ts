import { ink, warm, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Phrase Scatter & Step-In.
 * "OLD TALE" holds intact, then each glyph is released in turn: a bounded tilt and an
 * accelerating downward drift while it fades fully out (no lingering fragments). The
 * incoming phrase steps in by words, with pauses chosen by meaning: "THIS IS A",
 * a beat, the emphasised "NEW" (warm italic serif with a small punch), a beat, "IDEA".
 */

const OUTGOING = "OLD TALE";
const OUT = { x: 208, step: 32, y: 160 };
const RELEASE = { start: 1.0, stagger: 0.07, duration: 0.85 };
const WORDS = [
  { text: "THIS", x: 175, at: 1.55 },
  { text: "IS", x: 252, at: 1.8 },
  { text: "A", x: 297, at: 2.0 },
  { text: "NEW", x: 368, at: 2.55, emphasis: true },
  { text: "IDEA", x: 466, at: 3.25 },
];
const STEP = 0.32;
const BASELINE = 185;

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  // Outgoing glyphs: intact until release, then tilt + fall + fade, then gone.
  Array.from(OUTGOING).forEach((glyph, index) => {
    if (glyph === " ") return;
    const start = RELEASE.start + index * RELEASE.stagger;
    const age = clamp((t - start) / RELEASE.duration);
    if (age >= 1) return;
    c.save();
    c.globalAlpha = 1 - age;
    c.translate(
      OUT.x + index * OUT.step + Math.sin(index * 2.1) * 18 * age,
      OUT.y + age * age * 90,
    );
    c.rotate((index % 2 ? 1 : -1) * (0.25 + (index % 3) * 0.12) * age);
    text(glyph, 0, 0, 36, ink);
    c.restore();
  });

  // Incoming words: each rises a short distance and fades in on its own beat.
  for (const word of WORDS) {
    const entrance = motionProgress(t, word.at, word.at + STEP);
    if (entrance === 0) continue;
    c.save();
    c.globalAlpha = entrance;
    const y = BASELINE + (1 - ease(entrance)) * 18;
    if (word.emphasis) {
      // Small overshoot punch that settles to exactly 1.
      const punch = entrance >= 1 ? 1 : 1 + Math.sin(entrance * Math.PI) * 0.18;
      c.translate(word.x, y);
      c.scale(punch, punch);
      c.fillStyle = warm;
      c.textAlign = "center";
      c.font = "italic 700 36px serif";
      c.fillText(word.text, 0, 0);
    } else text(word.text, word.x, y, 34, ink);
    c.restore();
  }
}
