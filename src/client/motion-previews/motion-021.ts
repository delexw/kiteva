import { Vector3 } from "three";
import { ink, accent, warm, clamp, ease, motionDrawing } from "./drawing";
import {
  boxCorners,
  boxFaces,
  makeCamera,
  paintFaces,
  paintGround,
  paintShadow,
} from "../motion-orbit-preview";

/**
 * Cursor-Driven Camera Orbit.
 * The robot never moves. An authored pointer path maps to bounded camera azimuth and
 * elevation around a fixed target at a fixed radius; the camera follows the pointer
 * evaluated slightly earlier in time (stateless lag) and returns exactly to the
 * resting view after the pointer leaves, so t = 0 and t = 6 render identically.
 */

const TARGET = new Vector3(0, 0.95, 0);
const RADIUS = 6;
const REST = { azimuth: -0.35, elevation: 0.42 };
const LIMIT = { azimuth: 0.62, elevation: 0.22 };
const LIGHT = new Vector3(-0.5, 1, 0.55).normalize();

type Box = [number, number, number, number, number, number];
const PARTS: { box: Box; color: string }[] = [
  { box: [0, 0.06, 0, 1.6, 0.12, 1.6], color: "#3F5566" }, // turntable mat
  { box: [-0.22, 0.4, 0, 0.26, 0.56, 0.3], color: "#566A7C" }, // legs
  { box: [0.22, 0.4, 0, 0.26, 0.56, 0.3], color: "#566A7C" },
  { box: [0, 1.0, 0, 0.9, 0.66, 0.56], color: "#78DEC8" }, // torso
  { box: [0, 1.6, 0.02, 0.6, 0.48, 0.5], color: "#EAF1F5" }, // head
  { box: [0, 1.62, 0.28, 0.42, 0.14, 0.03], color: "#14212B" }, // visor (front only)
  { box: [0.18, 1.95, 0, 0.06, 0.24, 0.06], color: "#9FB0BC" }, // antenna
  { box: [0.18, 2.1, 0, 0.12, 0.12, 0.12], color: "#FF926C" },
  { box: [-0.6, 1.06, 0.06, 0.22, 0.5, 0.24], color: "#5FB3A2" }, // left arm
  { box: [0.62, 1.2, 0.18, 0.22, 0.24, 0.5], color: "#5FB3A2" }, // right arm reaching forward
  { box: [0, 1.05, -0.36, 0.5, 0.42, 0.16], color: "#F4BA73" }, // battery pack (rear)
];
const FACES = PARTS.flatMap(({ box, color }) => boxFaces(...box, color));
const SHADOW = PARTS.slice(1).flatMap(({ box }) => boxCorners(...box));

// Pointer keys [time, x, y] in normalised viewport units; |x| > 1 is outside.
const POINTER_KEYS: [number, number, number][] = [
  [0, 1.5, 0.8],
  [0.6, 0.2, 0.3],
  [1.8, 0.95, 0.1],
  [3.0, -0.85, -0.7],
  [3.8, -0.1, 0.4],
  [4.4, 1.5, 0.8],
  [6, 1.5, 0.8],
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
  return { x: 1.5, y: 0.8 };
}
// Influence: enter → active → exit, then an eased return to the resting viewpoint.
const influence = (t: number) => ease((t - 0.5) / 0.4) * (1 - ease((t - 3.9) / 1.1));

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text, cursor } = motionDrawing(c);
  const lagged = pointer(t - 0.15);
  const k = influence(t);
  const azimuth =
    REST.azimuth + clamp((lagged.x + 1) / 2) * 2 * LIMIT.azimuth * k - LIMIT.azimuth * k;
  const elevation = REST.elevation + (clamp((-lagged.y + 1) / 2) * 2 - 1) * LIMIT.elevation * k;
  const position = new Vector3(
    Math.sin(azimuth) * Math.cos(elevation) * RADIUS,
    TARGET.y + Math.sin(elevation) * RADIUS,
    Math.cos(azimuth) * Math.cos(elevation) * RADIUS,
  );
  const camera = makeCamera(position, TARGET, 38);

  c.save();
  c.beginPath();
  c.rect(0, 0, 640, 360);
  c.clip();
  paintGround(c, camera, 3);
  paintShadow(c, camera, SHADOW, LIGHT);
  paintFaces(c, FACES, camera, LIGHT);
  c.restore();

  text("POINTER-CONTROLLED CAMERA", 320, 40, 20, ink);
  // Bounded orbit gizmo: arc of allowed azimuth with the live camera marker.
  const gx = 560,
    gy = 300;
  c.strokeStyle = "#3C5262";
  c.lineWidth = 4;
  c.beginPath();
  c.arc(gx, gy, 34, -Math.PI / 2 - LIMIT.azimuth, -Math.PI / 2 + LIMIT.azimuth);
  c.stroke();
  const az = azimuth - REST.azimuth;
  circle(gx + Math.sin(az) * 34, gy - Math.cos(az) * 34, 6, accent);
  circle(gx, gy, 5, warm);
  const azDeg = Math.round((az * 180) / Math.PI) || 0;
  const elDeg = Math.round(((elevation - REST.elevation) * 180) / Math.PI) || 0;
  text(`az ${azDeg}° · el ${elDeg}°`, gx, gy + 24, 12, "#9FB0BC");
  text("Fixed subject · bounded orbit · returns on exit", 260, 338, 14, ink);

  const live = pointer(t);
  if (Math.abs(live.x) < 1.2) cursor(320 + live.x * 300, 180 + live.y * 170);
}
