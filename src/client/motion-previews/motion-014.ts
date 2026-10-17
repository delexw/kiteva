import { ink, accent, clamp, ease, motionDrawing } from "./drawing";

/**
 * Fluid Morphing Energy Orb.
 * The silhouette is a bounded polar field r(θ, t): calm sphere → lobes and folds →
 * calm sphere again. All phases use whole cycles over the 6 s clip and the deformation
 * envelope is zero at both ends, so the loop closes on identical geometry and flow.
 */

const CENTER = { x: 320, y: 172 };
const BASE_RADIUS = 92;
const LOOP = 6;
const TAU = Math.PI * 2;

// Deformation envelope: establish (calm), develop, settle back to the sphere.
const envelope = (t: number) => ease((t - 0.6) / 1.2) * (1 - ease((t - 3.9) / 1.4));

function radiusAt(angle: number, t: number, amount: number) {
  const w = (TAU * t) / LOOP;
  const lobes =
    Math.sin(angle * 3 + w * 2) * 0.11 +
    Math.sin(angle * 5 - w * 3) * 0.05 +
    Math.cos(angle * 2 + w) * 0.06;
  return BASE_RADIUS * (1 + lobes * amount + 0.015 * Math.sin(w * 4));
}

function orbPath(
  c: CanvasRenderingContext2D,
  t: number,
  amount: number,
  scale = 1,
  dx = 0,
  dy = 0,
) {
  c.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * TAU;
    const r = radiusAt(a, t, amount) * scale;
    const x = CENTER.x + dx + Math.cos(a) * r,
      y = CENTER.y + dy + Math.sin(a) * r;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  const amount = envelope(t);
  const w = (TAU * t) / LOOP;

  // Floor reflection follows the silhouette width.
  c.fillStyle = "rgba(120, 222, 200, 0.12)";
  c.beginPath();
  c.ellipse(CENTER.x, 300, 120 + amount * 18, 12, 0, 0, TAU);
  c.fill();

  // Body with a bounded glow.
  c.save();
  c.shadowColor = accent;
  c.shadowBlur = 26 + amount * 16;
  c.fillStyle = "#2C9C88";
  orbPath(c, t, amount);
  c.fill();
  c.restore();

  // Inner shading layers offset toward the fixed key light (upper left).
  c.save();
  orbPath(c, t, amount);
  c.clip();
  c.fillStyle = "#4CC2AA";
  orbPath(c, t, amount * 0.8, 0.86, -8, -10);
  c.fill();
  c.fillStyle = accent;
  orbPath(c, t, amount * 0.6, 0.62, -18, -22);
  c.fill();
  // Surface flow: bands that travel around the form, one whole cycle per loop.
  c.strokeStyle = "rgba(234, 241, 245, 0.35)";
  c.lineWidth = 3;
  for (let band = 0; band < 4; band++) {
    const phase = w + band * (TAU / 4);
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const x = CENTER.x - 110 + u * 220;
      const y =
        CENTER.y + Math.sin(phase) * 70 + Math.sin(u * Math.PI * 2 + phase * 2) * (8 + 18 * amount);
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.globalAlpha = clamp(Math.cos(phase) * 0.5 + 0.5);
    c.stroke();
  }
  c.globalAlpha = 1;
  c.restore();
  // Specular highlight sits on the lit side and squashes with the local surface.
  c.fillStyle = "rgba(255, 255, 255, 0.85)";
  c.beginPath();
  c.ellipse(CENTER.x - 34, CENTER.y - 40, 16 + amount * 4, 10 - amount * 3, -0.6, 0, TAU);
  c.fill();

  const state = amount < 0.05 ? (t < 3 ? "CALM FORM" : "SETTLED · LOOP READY") : "FLOWING";
  text(state, 320, 338, 16, amount < 0.05 ? ink : accent);
}
