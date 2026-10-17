import { ink, accent, warm, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Immersive Float: hover → activation → drop → squash on contact → surface growth.
 * Growth is a surface-space ellipse centred on the impact point; tufts, flowers and
 * sparks are placed on that surface and appear only when the front reaches them.
 */

const MOUND = { x: 320, y: 268, rx: 236, ry: 52 };
const SURFACE_Y = MOUND.y - MOUND.ry + 6; // top of the soft form where the orb lands
const ORB_RADIUS = 26;
const HOVER_Y = 104;
const REST_Y = SURFACE_Y - ORB_RADIUS + 5; // sinks slightly into the soft surface

const TRIGGER = 1.25; // activation click
const DROP_START = 1.5;
const CONTACT = 1.95;
const GROWTH_START = 2.02;
const GROWTH_END = 4.6;
// Growth ellipse proportions on the projected surface (wider than deep).
const ASPECT = (MOUND.ry / MOUND.rx) * 1.6;

// Surface accents in mound coordinates; "reach" is the surface distance from impact.
const ACCENTS = Array.from({ length: 15 }, (_, i) => {
  const u = ((i * 0.618) % 1) * 2 - 1;
  const v = ((i * 0.381 + 0.2) % 1) * 1.4 - 0.55;
  const x = MOUND.x + u * MOUND.rx * 0.82;
  const y = MOUND.y + v * MOUND.ry * 0.7;
  return {
    x,
    y,
    reach: Math.hypot(x - MOUND.x, (y - SURFACE_Y - 10) / ASPECT),
    flower: i % 3 === 0,
  };
});
const MAX_REACH = MOUND.rx * 1.08;

function orbCenter(t: number) {
  if (t < TRIGGER) return HOVER_Y + Math.sin(t * Math.PI * 1.2) * 6; // weightless bob
  if (t < DROP_START)
    return HOVER_Y - 10 * Math.sin(((t - TRIGGER) / (DROP_START - TRIGGER)) * Math.PI * 0.5); // anticipation lift
  if (t < CONTACT) {
    const p = (t - DROP_START) / (CONTACT - DROP_START);
    return HOVER_Y - 10 + (REST_Y - HOVER_Y + 10) * p * p; // accelerating fall
  }
  return REST_Y;
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text, flower } = motionDrawing(c);
  const y = orbCenter(t);
  const contact = t >= CONTACT ? t - CONTACT : -1;
  // Squash peaks just after contact and recovers with a small overshoot.
  const squash =
    contact < 0
      ? 0
      : 0.42 * Math.exp(-contact * 7) * Math.cos(contact * 15) * (contact < 0.6 ? 1 : 0);
  const stretch =
    t > DROP_START && t < CONTACT ? 0.12 * ((t - DROP_START) / (CONTACT - DROP_START)) : 0;
  const growth = motionProgress(t, GROWTH_START, GROWTH_END);
  const front = growth * MAX_REACH;

  // Receiving soft form; the dent follows the squash.
  c.fillStyle = "#24404E";
  c.beginPath();
  c.ellipse(MOUND.x, MOUND.y, MOUND.rx, MOUND.ry, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#2D4E5E";
  c.beginPath();
  c.ellipse(MOUND.x, MOUND.y - 8, MOUND.rx - 20, MOUND.ry - 16, 0, 0, Math.PI * 2);
  c.fill();

  // Growth mask: a surface ellipse expanding from the impact point.
  if (front > 0) {
    c.save();
    c.beginPath();
    c.ellipse(MOUND.x, MOUND.y, MOUND.rx, MOUND.ry, 0, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = "#3E7D5E";
    c.beginPath();
    c.ellipse(MOUND.x, SURFACE_Y + 10, front, front * ASPECT, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#4E9A6C";
    c.beginPath();
    c.ellipse(MOUND.x, SURFACE_Y + 6, front * 0.7, front * ASPECT * 0.66, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // Tufts and flowers pop when the front passes them; sparks ride the front itself.
  for (const a of ACCENTS) {
    const local = clamp((front - a.reach) / 40);
    if (local <= 0) continue;
    if (a.flower) flower(a.x, a.y - 6 * local, 0.55 * ease(local));
    else {
      c.strokeStyle = "#8FE0A8";
      c.lineWidth = 2;
      for (const lean of [-0.4, 0, 0.4]) {
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(a.x + lean * 10 * local, a.y - 12 * ease(local));
        c.stroke();
      }
    }
  }
  if (growth > 0 && growth < 1) {
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + growth * 2;
      const sx = MOUND.x + Math.cos(angle) * front;
      const sy = SURFACE_Y + 10 + Math.sin(angle) * front * ASPECT;
      const insideMound = ((sx - MOUND.x) / MOUND.rx) ** 2 + ((sy - MOUND.y) / MOUND.ry) ** 2 < 1;
      if (!insideMound) continue;
      c.globalAlpha = 0.9 * (1 - growth);
      circle(sx, sy - 4, 2.6, i % 2 ? warm : ink);
      c.globalAlpha = 1;
    }
  }

  // Contact shadow tightens and darkens as the orb approaches.
  const height = REST_Y - y;
  const shadowScale = 1 - clamp(height / 260) * 0.6;
  c.fillStyle = `rgba(6, 12, 16, ${0.25 + 0.35 * shadowScale})`;
  c.beginPath();
  c.ellipse(
    MOUND.x,
    SURFACE_Y + 4,
    30 * shadowScale + 8 * squash,
    7 * shadowScale,
    0,
    0,
    Math.PI * 2,
  );
  c.fill();

  // Orb, scaled about its contact point once it touches the surface.
  c.save();
  const pivotY = t >= CONTACT ? y + ORB_RADIUS : y;
  c.translate(MOUND.x, pivotY);
  const sy = (1 - squash) * (1 + stretch);
  c.scale(1 / Math.sqrt(Math.max(0.3, sy)), sy);
  const cy = t >= CONTACT ? -ORB_RADIUS : 0;
  c.shadowColor = accent;
  c.shadowBlur = 18;
  circle(0, cy, ORB_RADIUS, accent);
  c.shadowBlur = 0;
  circle(-8, cy - 9, 7, "#D6FFF4");
  c.restore();

  // Activation cue: a click ring on the hovering orb.
  const click = motionProgress(t, TRIGGER, TRIGGER + 0.35);
  if (click > 0 && click < 1) {
    c.strokeStyle = ink;
    c.globalAlpha = 1 - click;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(MOUND.x, orbCenter(TRIGGER), ORB_RADIUS + 6 + click * 22, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
  }

  const label =
    t < TRIGGER
      ? "HOVERING"
      : t < CONTACT
        ? "DROP"
        : growth < 1
          ? "IMPACT · GROWTH SPREADS"
          : "TRANSFORMED";
  text(label, 320, 338, 16, t >= GROWTH_END ? accent : ink);
}
