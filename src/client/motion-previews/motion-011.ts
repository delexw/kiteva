import { ink, accent, warm, dark, clamp, ease, motionDrawing } from "./drawing";

/**
 * Hover-Driven 3D Voice Card.
 * Pointer offset maps to bounded rotation: vertical offset → rotateX, horizontal
 * offset → rotateY. Inner layers (waveform, play button) sit at raised depths so they
 * separate under tilt. On exit the card settles to rest. This preview is silent; the
 * waveform is a static drawing, not audio analysis.
 */

const CARD = { w: 360, h: 210 };
const CENTER = { x: 320, y: 172 };
const MAX_TILT = { x: 0.26, y: 0.34 }; // radians
const PERSPECTIVE = 700;
// Static waveform heights (authored, not derived from audio).
const BARS = Array.from(
  { length: 28 },
  (_, i) => 10 + Math.abs(Math.sin(i * 1.7) * 26 + Math.sin(i * 0.6) * 12),
);

// Pointer keys [time, x, y] in card-normalised units (-1…1); |x|>1.3 means outside.
const POINTER_KEYS: [number, number, number][] = [
  [0, 1.9, 1.2],
  [0.8, 0.7, 0.6],
  [1.8, -0.8, -0.7],
  [2.8, 0.85, -0.6],
  [3.7, -0.5, 0.75],
  [4.2, 1.9, 1.2],
  [6, 1.9, 1.2],
];

function pointer(t: number) {
  for (let i = 1; i < POINTER_KEYS.length; i++) {
    const [t1, x1, y1] = POINTER_KEYS[i]!;
    const [t0, x0, y0] = POINTER_KEYS[i - 1]!;
    if (t <= t1) {
      const p = ease((t - t0) / (t1 - t0));
      return { x: x0 + (x1 - x0) * p, y: y0 + (y1 - y0) * p };
    }
  }
  return { x: 1.9, y: 1.2 };
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text, cursor } = motionDrawing(c);
  const ptr = pointer(t);
  // Hover weight eases in after entry and out after exit (authored, not damped).
  const hover = clamp((t - 0.55) / 0.35) * (1 - clamp((t - 4.0) / 0.9));
  const rx = -clamp((ptr.y + 1) / 2) * 2 + 1; // pointer below centre tips the top away
  const ry = clamp((ptr.x + 1) / 2) * 2 - 1;
  const angleX = rx * MAX_TILT.x * hover,
    angleY = ry * MAX_TILT.y * hover;

  // Project a card-local point (x, y, z) through the tilt and perspective.
  const project = (x: number, y: number, z: number) => {
    const x1 = x * Math.cos(angleY) + z * Math.sin(angleY);
    const z1 = -x * Math.sin(angleY) + z * Math.cos(angleY);
    const y2 = y * Math.cos(angleX) - z1 * Math.sin(angleX);
    const z2 = y * Math.sin(angleX) + z1 * Math.cos(angleX);
    const k = PERSPECTIVE / (PERSPECTIVE + z2);
    return { x: CENTER.x + x1 * k, y: CENTER.y + y2 * k };
  };
  // Map the card plane at depth z onto the canvas with an affine fit of three corners.
  const withPlane = (z: number, paint: () => void) => {
    const o = project(0, 0, z),
      ux = project(1, 0, z),
      uy = project(0, 1, z);
    c.save();
    c.transform(ux.x - o.x, ux.y - o.y, uy.x - o.x, uy.y - o.y, o.x, o.y);
    paint();
    c.restore();
  };

  // Soft shadow shifts opposite the tilt.
  c.fillStyle = "rgba(0, 0, 0, 0.35)";
  c.beginPath();
  c.ellipse(CENTER.x - angleY * 60, CENTER.y + CARD.h / 2 + 18, 170, 12, 0, 0, Math.PI * 2);
  c.fill();
  // Card face (perspective quad).
  const corners = [
    project(-CARD.w / 2, -CARD.h / 2, 0),
    project(CARD.w / 2, -CARD.h / 2, 0),
    project(CARD.w / 2, CARD.h / 2, 0),
    project(-CARD.w / 2, CARD.h / 2, 0),
  ];
  c.fillStyle = ink;
  c.beginPath();
  corners.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fill();
  // Specular sheen slides with the tilt, clipped to the projected card outline so it
  // can never spill past the perspective edge onto the background.
  c.save();
  c.beginPath();
  corners.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.clip();
  withPlane(0, () => {
    c.fillStyle = "rgba(255, 255, 255, 0.5)";
    c.fillRect(-CARD.w / 2 + 20 + ry * hover * 90, -CARD.h / 2 + 8, 80, 6);
  });
  c.restore();
  withPlane(-10, () => {
    c.textAlign = "left";
    c.fillStyle = dark;
    c.font = "700 20px sans-serif";
    c.fillText("VOICE NOTE", -CARD.w / 2 + 28, -CARD.h / 2 + 42);
    c.font = "500 14px sans-serif";
    c.fillStyle = "#4A5E6C";
    c.fillText("Maya · 0:42", -CARD.w / 2 + 28, -CARD.h / 2 + 64);
  });
  withPlane(-22, () => {
    BARS.forEach((h, i) => {
      c.fillStyle = i < 9 ? accent : "#56707F";
      c.fillRect(-CARD.w / 2 + 92 + i * 9, 30 - h / 2, 5, h);
    });
  });
  withPlane(-36, () => {
    c.fillStyle = warm;
    c.beginPath();
    c.arc(-CARD.w / 2 + 52, 30, 24, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = dark;
    c.beginPath();
    c.moveTo(-CARD.w / 2 + 45, 18);
    c.lineTo(-CARD.w / 2 + 64, 30);
    c.lineTo(-CARD.w / 2 + 45, 42);
    c.closePath();
    c.fill();
  });

  const state =
    hover <= 0.001 ? "REST" : t < 4.0 ? "HOVER · TILT FOLLOWS POINTER" : "EXIT · SETTLING TO REST";
  text(state, 320, 336, 16, hover > 0.001 && t < 4 ? accent : ink);
  if (Math.abs(ptr.x) < 1.6)
    cursor(CENTER.x + ptr.x * (CARD.w / 2), CENTER.y + ptr.y * (CARD.h / 2));
}
