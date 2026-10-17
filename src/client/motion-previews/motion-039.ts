import { warm, dark, motionProgress, motionDrawing } from "./drawing";

/**
 * Radial Logo Burst.
 * Fixed sixteen-ray mark at the frame centre. On the beat grid (every 0.4 s from
 * 0.45 s) a soft white wave leaves the mark and fades while travelling outward.
 * At 0.45 s a compact party-popper burst exits the icon centre toward the viewer:
 * pieces start tiny, grow in apparent size in front of the icon, spread only a
 * little, hang briefly, then fall under gravity and fade. At 3 s an expanding
 * circular mask inverts field and mark around the same centre; the wordmark lands
 * and the identity holds from 4.2 s.
 */

const CX = 320,
  CY = 180;
const FIELD = warm,
  INK = dark,
  WHITE = "#FFFFFF";

// Beat-timed waves.
const WAVE = { first: 0.45, interval: 0.4, count: 5, life: 1.3, startRadius: 35, travel: 390 };
// Confetti: 72 pieces, 4 shapes, released from the icon centre.
const CONFETTI = {
  count: 72,
  release: 0.45,
  stagger: 0.012, // tiny per-piece offset (7 groups) so the burst reads as a pop, not a block
  life: 3,
  spreadMin: 45,
  spreadRange: 65,
  launchRate: 10, // exponential approach to the spread position (strong forward impulse)
  hang: 0.35, // seconds before gravity takes over
  gravity: 40,
  drift: 3,
};
const INVERSION = { start: 3, end: 4.2, maxRadius: 400 };

function mark(c: CanvasRenderingContext2D, color: string) {
  const { line } = motionDrawing(c);
  for (let index = 0; index < 16; index++) {
    const angle = (index * Math.PI) / 8;
    line(
      CX + Math.cos(angle) * 10,
      CY + Math.sin(angle) * 10,
      CX + Math.cos(angle) * 45,
      CY + Math.sin(angle) * 45,
      color,
      6,
    );
  }
}

function confettiPiece(c: CanvasRenderingContext2D, index: number, t: number) {
  const age = t - (CONFETTI.release + (index % 7) * CONFETTI.stagger);
  if (age < 0 || age >= CONFETTI.life) return;
  // Forward pop: radial spread saturates quickly, so pieces "hang" before falling.
  const travel = 1 - Math.exp(-age * CONFETTI.launchRate);
  const angle = index * 2.399963; // golden-angle spread around the exit
  const distance = CONFETTI.spreadMin + ((index * 47) % CONFETTI.spreadRange);
  const fall = Math.max(0, age - CONFETTI.hang) ** 2 * CONFETTI.gravity;
  const size = 3 + ((index * 7) % 6);
  c.save();
  c.globalAlpha = Math.min(1, age / 0.035) * (1 - motionProgress(age, 1.8, 2.7));
  c.translate(
    CX + Math.cos(angle) * distance * travel - age * CONFETTI.drift,
    CY + Math.sin(angle) * distance * travel * 0.35 + fall,
  );
  c.rotate(angle + age * (index % 2 ? 1.8 : -1.4)); // tumbling
  // Apparent size grows as the piece approaches the viewer; flip squashes one axis.
  const approach = 0.12 + motionProgress(age, 0, 0.35) * 1.35;
  c.scale(approach * (0.65 + Math.abs(Math.cos(age * 2 + index)) * 0.35), approach);
  const color = index % 3 === 0 ? INK : WHITE;
  c.fillStyle = color;
  c.strokeStyle = color;
  c.shadowColor = "#14212B40";
  c.shadowBlur = 3;
  c.shadowOffsetX = 2;
  c.shadowOffsetY = 3;
  switch (index % 4) {
    case 0: // square
      c.fillRect(-size / 2, -size / 2, size, size);
      break;
    case 1: // triangle
      c.beginPath();
      c.moveTo(0, -size * 0.65);
      c.lineTo(size * 0.6, size * 0.5);
      c.lineTo(-size * 0.6, size * 0.5);
      c.closePath();
      c.fill();
      break;
    case 2: // circle
      c.beginPath();
      c.arc(0, 0, size * 0.45, 0, Math.PI * 2);
      c.fill();
      break;
    default: // cross
      c.lineWidth = Math.max(2, size * 0.22);
      c.beginPath();
      c.moveTo(-size / 2, 0);
      c.lineTo(size / 2, 0);
      c.moveTo(0, -size / 2);
      c.lineTo(0, size / 2);
      c.stroke();
  }
  c.restore();
}

function wave(c: CanvasRenderingContext2D, pulse: number, t: number) {
  const age = t - (WAVE.first + pulse * WAVE.interval);
  if (age < 0 || age >= WAVE.life) return;
  const progress = age / WAVE.life;
  c.save();
  c.globalAlpha = Math.min(1, age / 0.08) * (1 - progress) * 0.85;
  c.strokeStyle = WHITE;
  c.lineWidth = 4 + progress * 3;
  c.shadowColor = WHITE;
  c.shadowBlur = 8;
  c.beginPath();
  c.arc(CX, CY, WAVE.startRadius + progress * WAVE.travel, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  const inversion = motionProgress(t, INVERSION.start, INVERSION.end);
  const radius = inversion * INVERSION.maxRadius;
  const covered = radius >= INVERSION.maxRadius;
  // Field and mark: outside the mask the original palette, inside it the inverted one.
  c.fillStyle = covered ? INK : FIELD;
  c.fillRect(0, 0, 640, 360);
  if (covered) mark(c, FIELD);
  else if (inversion > 0) {
    circle(CX, CY, radius, INK);
    if (radius > 45) mark(c, FIELD);
    else {
      mark(c, INK);
      c.save();
      c.beginPath();
      c.arc(CX, CY, radius, 0, Math.PI * 2);
      c.clip();
      mark(c, FIELD);
      c.restore();
    }
  } else mark(c, INK);
  // Confetti in front of the icon, then the beat waves.
  for (let index = 0; index < CONFETTI.count; index++) confettiPiece(c, index, t);
  for (let pulse = 0; pulse < WAVE.count; pulse++) wave(c, pulse, t);
  // Wordmark lands inside the inverted field once the mask has spread past it.
  const wordmark = motionProgress(t, 3.7, 4.2);
  if (wordmark > 0) {
    c.globalAlpha = wordmark;
    text("BURST", CX, 268 + (1 - wordmark) * 12, 28, FIELD);
    c.globalAlpha = 1;
  }
}
