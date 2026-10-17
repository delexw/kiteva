import { PerspectiveCamera, Vector3 } from "three";
import { ink, accent, warm, clamp, ease } from "./drawing";

/**
 * Scroll-Driven Helix Flow.
 * A fixed double helix is projected through a moving PerspectiveCamera. The camera
 * dollies from a wide view to a close view of the rungs, then swings to a wide view
 * from the opposite side. Copy changes are bound to the same three camera stages.
 */

const HELIX_RADIUS = 1;
const HELIX_HALF_HEIGHT = 3.2;
const TURNS_PER_UNIT = 1.15; // radians of twist per unit height
const RUNG_STEP = 0.32;

type Pose = { angle: number; distance: number; height: number };
const STAGES: { at: number; pose: Pose }[] = [
  { at: 0, pose: { angle: 0, distance: 12, height: 0 } },
  { at: 0.9, pose: { angle: 0, distance: 12, height: 0 } }, // wide hold
  { at: 2.5, pose: { angle: 0.55, distance: 3.1, height: 0.7 } }, // close on the rungs
  { at: 3.4, pose: { angle: 0.75, distance: 3.0, height: 0.6 } }, // slow drift while reading
  { at: 5.0, pose: { angle: Math.PI, distance: 12, height: 0 } }, // opposite wide view
  { at: 6, pose: { angle: Math.PI, distance: 12, height: 0 } },
];
const COPY = [
  { from: -1, to: 1.9, title: "01 · THE STRUCTURE", body: "Two strands, one spiral" },
  { from: 1.9, to: 4.1, title: "02 · THE RUNGS", body: "Every pair is a bond" },
  { from: 4.1, to: 99, title: "03 · THE OTHER SIDE", body: "Same form, new perspective" },
];

function cameraPose(t: number): Pose {
  for (let i = 1; i < STAGES.length; i++) {
    const a = STAGES[i - 1]!,
      b = STAGES[i]!;
    if (t <= b.at) {
      const p = ease((t - a.at) / (b.at - a.at));
      return {
        angle: a.pose.angle + (b.pose.angle - a.pose.angle) * p,
        distance: a.pose.distance + (b.pose.distance - a.pose.distance) * p,
        height: a.pose.height + (b.pose.height - a.pose.height) * p,
      };
    }
  }
  return STAGES[STAGES.length - 1]!.pose;
}

// Static structure: strand samples and rung pairs, computed once in world space.
const strandPoint = (y: number, strand: 0 | 1) => {
  const a = y * TURNS_PER_UNIT + strand * Math.PI;
  return new Vector3(Math.cos(a) * HELIX_RADIUS, y, Math.sin(a) * HELIX_RADIUS);
};
const STRAND_SAMPLES = Array.from(
  { length: 81 },
  (_, i) => -HELIX_HALF_HEIGHT + (i / 80) * HELIX_HALF_HEIGHT * 2,
);
const RUNGS = Array.from(
  { length: Math.floor((HELIX_HALF_HEIGHT * 2) / RUNG_STEP) + 1 },
  (_, i) => -HELIX_HALF_HEIGHT + i * RUNG_STEP,
);

type Item = { depth: number; paint: () => void };

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const pose = cameraPose(t);
  const camera = new PerspectiveCamera(38, 640 / 360, 0.1, 100);
  camera.position.set(
    Math.sin(pose.angle) * pose.distance,
    pose.height,
    Math.cos(pose.angle) * pose.distance,
  );
  camera.lookAt(0, pose.height * 0.8, 0);
  camera.updateMatrixWorld(true);
  const toScreen = (v: Vector3) => {
    const view = v.clone().applyMatrix4(camera.matrixWorldInverse);
    const ndc = v.clone().project(camera);
    return { x: (ndc.x + 1) * 320, y: (1 - ndc.y) * 180, depth: -view.z };
  };
  const pixelsPerUnit = (depth: number) => 180 / Math.tan((19 * Math.PI) / 180) / depth;

  c.save();
  c.beginPath();
  c.rect(0, 0, 640, 360);
  c.clip();
  const items: Item[] = [];
  for (const strand of [0, 1] as const) {
    const color = strand ? warm : accent;
    for (let i = 1; i < STRAND_SAMPLES.length; i++) {
      const a = toScreen(strandPoint(STRAND_SAMPLES[i - 1]!, strand));
      const b = toScreen(strandPoint(STRAND_SAMPLES[i]!, strand));
      if (a.depth < 0.3 || b.depth < 0.3) continue;
      const depth = (a.depth + b.depth) / 2;
      items.push({
        depth,
        paint: () => {
          c.strokeStyle = color;
          c.globalAlpha = clamp(1.25 - depth / 18);
          c.lineWidth = Math.max(1.5, 0.11 * pixelsPerUnit(depth));
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        },
      });
    }
  }
  for (const y of RUNGS) {
    const a = toScreen(strandPoint(y, 0)),
      b = toScreen(strandPoint(y, 1));
    if (a.depth < 0.3 || b.depth < 0.3) continue;
    const depth = (a.depth + b.depth) / 2;
    items.push({
      depth: depth + 0.01,
      paint: () => {
        c.globalAlpha = clamp(1.25 - depth / 18);
        c.strokeStyle = "#5C7C8E";
        c.lineWidth = Math.max(1, 0.05 * pixelsPerUnit(depth));
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
        for (const [end, color] of [
          [a, accent],
          [b, warm],
        ] as const) {
          c.fillStyle = color;
          c.beginPath();
          c.arc(end.x, end.y, Math.max(2, 0.1 * pixelsPerUnit(end.depth)), 0, Math.PI * 2);
          c.fill();
        }
      },
    });
  }
  items.sort((p, q) => q.depth - p.depth).forEach((item) => item.paint());
  c.globalAlpha = 1;
  c.restore();

  // Copy window tied to the camera stage, with a short crossfade at each handoff.
  for (const copy of COPY) {
    const alpha = clamp((t - copy.from) / 0.3) * clamp((copy.to - t) / 0.3);
    if (alpha <= 0) continue;
    c.globalAlpha = alpha;
    c.fillStyle = "rgba(10, 18, 24, 0.72)";
    c.beginPath();
    c.roundRect(20, 270, 252, 64, 10);
    c.fill();
    c.textAlign = "left";
    c.fillStyle = accent;
    c.font = "600 14px sans-serif";
    c.fillText(copy.title, 34, 294);
    c.fillStyle = ink;
    c.font = "600 17px sans-serif";
    c.fillText(copy.body, 34, 320);
    c.globalAlpha = 1;
  }
  const stage = t < 1.9 ? 0 : t < 4.1 ? 1 : 2;
  for (let i = 0; i < 3; i++) {
    c.fillStyle = i === stage ? accent : "#3C5262";
    c.beginPath();
    c.arc(560 + i * 18, 312, 5, 0, Math.PI * 2);
    c.fill();
  }
}
