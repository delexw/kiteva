import { Vector3 } from "three";
import { ink, accent, warm, clamp, ease, motionDrawing } from "./drawing";
import { boxFaces, makeCamera, paintFaces, projector } from "../motion-orbit-preview";

/**
 * Scroll-Driven Camera Dolly.
 * A real perspective camera translates along the corridor axis toward a product on a
 * plinth while looking at a fixed target. Constant FOV: the pillars sweep past the
 * frame edges far faster than the product grows, which a flat zoom cannot produce.
 * The authored scroll arrives, scrubs back part-way and returns to the detail view.
 */

const TARGET = new Vector3(0, 1.2, 0);
const CAMERA_Y = 1.55;
const START_Z = 12,
  DETAIL_Z = 3.3;
const LIGHT = new Vector3(-0.4, 1, 0.8).normalize();
const SCROLL_KEYS: [number, number][] = [
  [0, 0],
  [0.7, 0],
  [3.3, 1],
  [4.3, 1],
  [5.0, 0.55], // scrub back
  [5.6, 1], // and forward again
  [6, 1],
];
function scroll(t: number) {
  for (let i = 1; i < SCROLL_KEYS.length; i++) {
    const [t1, v1] = SCROLL_KEYS[i]!;
    const [t0, v0] = SCROLL_KEYS[i - 1]!;
    if (t <= t1) return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
  }
  return 1;
}

const FACES = [
  ...[-2, 1.5, 5, 8.5].flatMap((z) => [
    ...boxFaces(-2.4, 1.5, z, 0.5, 3, 0.5, "#B6C9E8"),
    ...boxFaces(2.4, 1.5, z, 0.5, 3, 0.5, "#B6C9E8"),
  ]),
  ...boxFaces(0, 0.42, 0, 1.4, 0.84, 1.0, "#566A7C"), // plinth
  ...boxFaces(0, 1.2, 0, 1.2, 0.72, 0.5, "#2B3A45"), // camera body
  ...boxFaces(-0.32, 1.66, 0, 0.3, 0.2, 0.3, "#9FB0BC"), // dial
  ...boxFaces(0.38, 1.62, 0, 0.26, 0.12, 0.2, "#FF926C"), // shutter button
];
const LENS_CENTER = new Vector3(0.08, 1.18, 0.25);
const DIAL_TOP = new Vector3(-0.32, 1.76, 0);

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  const p = scroll(t);
  const camZ = START_Z + (DETAIL_Z - START_Z) * p;
  const camera = makeCamera(new Vector3(0, CAMERA_Y, camZ), TARGET, 42);
  const project = projector(camera);

  c.save();
  c.beginPath();
  c.rect(0, 0, 640, 360);
  c.clip();
  // Corridor floor lines, culled when behind the camera.
  c.strokeStyle = "#2B4150";
  c.lineWidth = 1;
  for (let z = -4; z <= 14; z += 1.5) {
    const a = project(new Vector3(-3, 0, z)),
      b = project(new Vector3(3, 0, z));
    if (a.depth < 0.3 || b.depth < 0.3) continue;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  for (const x of [-3, -1, 1, 3]) {
    const a = project(new Vector3(x, 0, -4)),
      b = project(new Vector3(x, 0, Math.min(14, camZ - 0.4)));
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  paintFaces(c, FACES, camera, LIGHT);
  // Lens: concentric rings on the body front, sized by true projection.
  const lens = project(LENS_CENTER);
  const edge = project(LENS_CENTER.clone().add(new Vector3(0.26, 0, 0)));
  const r = Math.abs(edge.x - lens.x);
  circle(lens.x, lens.y, r, "#9FB0BC");
  circle(lens.x, lens.y, r * 0.78, "#14212B");
  circle(lens.x, lens.y, r * 0.5, "#3A6A8A");
  circle(lens.x - r * 0.18, lens.y - r * 0.18, r * 0.14, ink);
  c.restore();

  // Detail callouts: leaders draw first, labels follow once leaders are complete.
  const detail = clamp((p - 0.82) / 0.18);
  const callouts = [
    { anchor: lens, label: "50 mm prime lens", at: { x: 470, y: 250 } },
    { anchor: project(DIAL_TOP), label: "Machined mode dial", at: { x: 470, y: 92 } },
  ];
  for (const callout of callouts) {
    const leader = clamp(detail / 0.6);
    if (leader <= 0) continue;
    const end = callout.at;
    c.strokeStyle = warm;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(callout.anchor.x, callout.anchor.y);
    c.lineTo(
      callout.anchor.x + (end.x - callout.anchor.x) * leader,
      callout.anchor.y + (end.y - callout.anchor.y) * leader,
    );
    c.stroke();
    circle(callout.anchor.x, callout.anchor.y, 4, warm);
    const label = clamp((detail - 0.6) / 0.4);
    if (label > 0) {
      c.globalAlpha = label;
      c.fillStyle = "rgba(10, 18, 24, 0.85)";
      c.beginPath();
      c.roundRect(end.x, end.y - 20, 150, 30, 8);
      c.fill();
      c.textAlign = "left";
      c.fillStyle = ink;
      c.font = "600 14px sans-serif";
      c.fillText(callout.label, end.x + 10, end.y);
      c.globalAlpha = 1;
    }
  }

  text(p > 0.82 ? "DETAIL VIEW" : "SCROLL TO DOLLY IN", 320, 40, 18, ink);
  // Scroll track and the camera position it drives.
  c.fillStyle = "#22343F";
  c.fillRect(170, 330, 300, 4);
  circle(170 + p * 300, 332, 7, accent);
  text(`camera z ${camZ.toFixed(1)} · FOV 42° fixed`, 320, 318, 13, "#9FB0BC");
}
