import { ink, accent, warm, dark, clamp, motionProgress, motionDrawing } from "./drawing";

/**
 * Elastic Arrival.
 * Letter tiles fall under constant gravity, compress at contact (scaled about the
 * contact point on the baseline), and rebound with restitution so each bounce is
 * lower and shorter. The motion is evaluated analytically per tile age, so any seek
 * gives the same pose. Tiles are staggered and settle into a held title.
 */

const BASELINE = 262;
const TILE = 74;
const GRAVITY = 2400; // px / s²
const DROP = 170; // px above the baseline (tiles start fully in frame)
const RESTITUTION = 0.42;
const CONTACT_TIME = 0.075; // seconds of squash per contact (scaled by impact speed)
const TILES = [
  { letter: "L", color: warm, x: 194, at: 0.4 },
  { letter: "A", color: accent, x: 278, at: 0.62 },
  { letter: "N", color: ink, x: 362, at: 0.84 },
  { letter: "D", color: warm, x: 446, at: 1.06 },
];

type Pose = { height: number; squash: number; speed: number };
const V0 = Math.sqrt(2 * GRAVITY * DROP);

/** Height above the baseline and squash amount for a tile `age` seconds after release. */
function bounce(age: number): Pose {
  if (age <= 0) return { height: DROP, squash: 0, speed: 0 };
  const fall = V0 / GRAVITY;
  if (age < fall)
    return { height: DROP - 0.5 * GRAVITY * age * age, squash: 0, speed: (GRAVITY * age) / V0 };
  let time = fall;
  let impact = V0;
  for (let n = 0; n < 4; n++) {
    const contact = CONTACT_TIME * (impact / V0) + 0.02;
    if (age < time + contact) {
      const u = (age - time) / contact;
      return { height: 0, squash: 0.34 * (impact / V0) * Math.sin(u * Math.PI), speed: 0 };
    }
    time += contact;
    const v = impact * RESTITUTION;
    const flight = (2 * v) / GRAVITY;
    if (age < time + flight) {
      const s = age - time;
      return {
        height: v * s - 0.5 * GRAVITY * s * s,
        squash: 0,
        speed: Math.abs(v - GRAVITY * s) / V0,
      };
    }
    time += flight;
    impact = v;
  }
  return { height: 0, squash: 0, speed: 0 };
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  c.fillStyle = "#3C5262";
  c.fillRect(130, BASELINE, 380, 3);

  for (const tile of TILES) {
    const pose = bounce(t - tile.at);
    if (t < tile.at - 0.25) continue; // not yet in view
    const appear = clamp((t - tile.at + 0.25) / 0.25);
    // Contact shadow: tighter and darker as the tile nears the baseline.
    const near = 1 - clamp(pose.height / DROP);
    c.fillStyle = `rgba(4, 10, 14, ${0.15 + 0.4 * near})`;
    c.beginPath();
    c.ellipse(
      tile.x,
      BASELINE + 2,
      (TILE / 2) * (0.55 + 0.45 * near) * (1 + pose.squash),
      5,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    // Squash about the contact point, stretch slightly along the fall when fast.
    const stretch = pose.speed * 0.12;
    const sx = (1 + pose.squash) / (1 + stretch * 0.5),
      sy = (1 - pose.squash) * (1 + stretch);
    c.save();
    c.globalAlpha = appear;
    c.translate(tile.x, BASELINE - pose.height);
    c.scale(sx, sy);
    c.fillStyle = tile.color;
    c.beginPath();
    c.roundRect(-TILE / 2, -TILE, TILE, TILE, 14);
    c.fill();
    text(tile.letter, 0, -TILE / 2 + 15, 44, dark);
    c.restore();
  }
  // Tagline only after every tile has settled.
  const tagline = motionProgress(t, 2.75, 3.15);
  if (tagline > 0) {
    c.globalAlpha = tagline;
    text("landed softly", 320, 308, 18, "#9FB0BC");
    c.globalAlpha = 1;
  }
}
