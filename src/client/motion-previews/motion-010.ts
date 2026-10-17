import { Vector3 } from "three";
import { ink, accent, warm, clamp, ease, motionProgress, motionDrawing } from "./drawing";
import {
  boxCorners,
  boxFaces,
  makeCamera,
  paintFaces,
  paintGround,
  paintShadow,
  prismFaces,
  projector,
} from "../motion-orbit-preview";

/**
 * Scroll-Driven Character Orbit Rotation.
 * A blocky wanderer stands still on a pedestal. Only the camera orbits (one complete
 * circuit). The opening title fades as the orbit starts, annotations appear when the
 * camera faces the detail they describe, and the closing line arrives at the front.
 */

const TARGET = new Vector3(0, 1.25, 0);
const RADIUS = 6.2,
  HEIGHT = 2.5;
const LIGHT = new Vector3(-0.45, 1, 0.6).normalize();
// Deterministic angle schedule [time, angle]: one full circuit with eased travel
// between short reading dwells at each annotated viewpoint (π/2, π, 3π/2).
// Equal consecutive angles are dwells; each travel segment is smoothstep-eased.
const ANGLE_KEYS: [number, number][] = [
  [0.5, 0], // front hold with opening title
  [1.15, Math.PI / 2],
  [1.85, Math.PI / 2], // LANTERN dwell 0.7 s
  [2.3, Math.PI],
  [3.0, Math.PI], // PACK dwell 0.7 s
  [3.45, (3 * Math.PI) / 2],
  [4.15, (3 * Math.PI) / 2], // SCROLL CASE dwell 0.7 s
  [4.75, Math.PI * 2], // back to front
];
const ORBIT_START = ANGLE_KEYS[0]![0],
  ORBIT_END = ANGLE_KEYS[ANGLE_KEYS.length - 1]![0]; // leaves ~0.95 s fully legible closing hold at the front view

type Box = [number, number, number, number, number, number];
const PARTS: { box: Box; color: string }[] = [
  { box: [-0.17, 0.65, 0, 0.22, 0.7, 0.26], color: "#3F5566" }, // legs
  { box: [0.17, 0.65, 0, 0.22, 0.7, 0.26], color: "#3F5566" },
  { box: [0, 1.35, 0, 0.7, 0.7, 0.4], color: "#72CCB9" }, // cloak
  { box: [0.45, 1.36, 0, 0.18, 0.62, 0.22], color: "#5FB3A2" }, // arms
  { box: [-0.45, 1.36, 0, 0.18, 0.62, 0.22], color: "#5FB3A2" },
  { box: [0, 1.93, 0, 0.42, 0.42, 0.42], color: "#EAD7C3" }, // head
  { box: [-0.09, 1.97, 0.215, 0.07, 0.07, 0.02], color: "#14212B" }, // eyes
  { box: [0.09, 1.97, 0.215, 0.07, 0.07, 0.02], color: "#14212B" },
  { box: [0, 2.18, 0, 0.62, 0.08, 0.62], color: "#FF926C" }, // hat brim + crown
  { box: [0, 2.32, 0, 0.32, 0.2, 0.32], color: "#FF926C" },
  { box: [0.52, 0.9, 0.1, 0.18, 0.24, 0.18], color: "#FFD27A" }, // lantern (figure's left hand: +x while facing +z)
  { box: [0, 1.42, -0.32, 0.56, 0.6, 0.24], color: "#9A7458" }, // backpack (rear)
  { box: [-0.42, 0.95, -0.06, 0.12, 0.45, 0.12], color: "#B6C9E8" }, // scroll case (figure's right hip: -x)
];
const FACES = [
  ...prismFaces(0, 0, 0, 1.05, 0.3, 8, "#4C6172"),
  ...PARTS.flatMap(({ box, color }) => boxFaces(...box, color)),
];
const SHADOW_POINTS = PARTS.flatMap(({ box }) => boxCorners(...box));

// Annotations: the camera angle at which each detail faces the viewer.
const NOTES = [
  {
    angle: Math.PI / 2,
    anchor: new Vector3(0.6, 0.9, 0.1),
    title: "LANTERN",
    body: "carried in the left hand",
    at: { x: 470, y: 112 },
  },
  {
    angle: Math.PI,
    anchor: new Vector3(0, 1.5, -0.45),
    title: "PACK",
    body: "only visible from behind",
    at: { x: 470, y: 112 },
  },
  {
    angle: (3 * Math.PI) / 2,
    anchor: new Vector3(-0.48, 1.0, -0.06),
    title: "SCROLL CASE",
    body: "strapped to the right hip",
    at: { x: 170, y: 112 },
  },
];

function cameraAngle(t: number) {
  if (t <= ORBIT_START || t >= ORBIT_END) return 0; // front view (2π ≡ 0) outside the range
  for (let i = 1; i < ANGLE_KEYS.length; i++) {
    const [t1, a1] = ANGLE_KEYS[i]!;
    const [t0, a0] = ANGLE_KEYS[i - 1]!;
    if (t <= t1) return a0 + (a1 - a0) * ease((t - t0) / (t1 - t0));
  }
  return 0;
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  const angle = cameraAngle(t);
  const camera = makeCamera(
    new Vector3(Math.sin(angle) * RADIUS, HEIGHT, Math.cos(angle) * RADIUS),
    TARGET,
    38,
  );
  const project = projector(camera);
  c.save();
  c.beginPath();
  c.rect(0, 0, 640, 360);
  c.clip();
  paintGround(c, camera, 3);
  paintShadow(c, camera, SHADOW_POINTS, LIGHT);
  paintFaces(c, FACES, camera, LIGHT);

  for (const note of NOTES) {
    const offset = Math.abs(Math.atan2(Math.sin(angle - note.angle), Math.cos(angle - note.angle)));
    // Leader is fully drawn by offset 0.5; label fades in from 0.45 to full at 0.25 rad,
    // so it is fully opaque through each 0.7 s dwell plus the eased approach/departure.
    const leader = clamp((0.8 - offset) / 0.3);
    const label = clamp((0.45 - offset) / 0.2); // label only after its leader has arrived
    if (leader <= 0) continue;
    const a = project(note.anchor);
    const end = { x: note.at.x + (note.at.x > 320 ? -12 : 12), y: note.at.y + 30 };
    circle(a.x, a.y, 4, warm);
    c.strokeStyle = warm;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(a.x + (end.x - a.x) * leader, a.y + (end.y - a.y) * leader);
    c.stroke();
    if (label > 0) {
      c.globalAlpha = label;
      const left = note.at.x > 320 ? note.at.x - 12 : note.at.x - 138;
      c.fillStyle = "rgba(10, 18, 24, 0.82)";
      c.beginPath();
      c.roundRect(left, note.at.y, 150, 52, 8);
      c.fill();
      text(note.title, left + 75, note.at.y + 22, 14, accent);
      text(note.body, left + 75, note.at.y + 41, 12, ink);
      c.globalAlpha = 1;
    }
  }
  c.restore();

  const title = 1 - motionProgress(t, ORBIT_START, ORBIT_START + 0.35);
  if (title > 0) {
    c.globalAlpha = title;
    text("MEET THE WANDERER", 320, 44, 22, ink);
    c.globalAlpha = 1;
  }
  const closing = motionProgress(t, ORBIT_END + 0.05, ORBIT_END + 0.3);
  if (closing > 0) {
    c.globalAlpha = closing;
    text("Every side tells the story", 320, 44, 20, ink);
    c.globalAlpha = 1;
  }
  // Orbit progress track: the dot travels a full circle and returns to FRONT.
  const p = angle / (Math.PI * 2);
  c.fillStyle = "#22343F";
  c.fillRect(220, 330, 200, 4);
  c.fillStyle = accent;
  c.fillRect(220, 330, 200 * (t >= ORBIT_END ? 1 : p), 4);
  text("CAMERA ORBIT", 320, 322, 12, "#9FB0BC");
}
