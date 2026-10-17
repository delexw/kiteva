import { ink, accent, warm, dark, clamp, ease, motionDrawing } from "./drawing";

/**
 * Cursor-Driven Gaze Tracking.
 * A firefly follows an authored path. Pupils aim at it inside clipped sockets, brows
 * and head tilt follow the same path evaluated slightly earlier (an analytic delay, no
 * smoothing loop), blinks are scheduled, and the face returns to neutral at the end.
 */

const HEAD = { x: 300, y: 186, r: 104 };
const EYES = [
  { x: 258, y: 170 },
  { x: 342, y: 170 },
];
const SOCKET = { rx: 26, ry: 22 };
const PUPIL_TRAVEL = { x: 13, y: 10 };
const BLINKS = [1.85, 4.15];

// Target keys [time, x, y]; includes extreme positions to exercise the socket bounds.
const TARGET_KEYS: [number, number, number][] = [
  [0, 520, 70],
  [0.6, 520, 70],
  [1.5, 590, 300],
  [2.4, 80, 310],
  [3.1, 70, 60],
  [3.7, 300, 128], // close in front of the face: eyes converge
  [4.5, 560, 120],
  [5.1, 640, 40], // flies out
  [6, 640, 40],
];

function target(t: number) {
  const time = clamp(t / 6) * 6;
  for (let i = 1; i < TARGET_KEYS.length; i++) {
    const [t1, x1, y1] = TARGET_KEYS[i]!;
    const [t0, x0, y0] = TARGET_KEYS[i - 1]!;
    if (time <= t1) {
      const p = ease((time - t0) / (t1 - t0));
      return { x: x0 + (x1 - x0) * p, y: y0 + (y1 - y0) * p };
    }
  }
  return { x: 640, y: 40 };
}
// Attention: 0 before the target appears and after it leaves, so gaze settles neutral.
const attention = (t: number) => ease((t - 0.3) / 0.5) * (1 - ease((t - 5.0) / 0.5));

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, line } = motionDrawing(c);
  const focus = attention(t);
  const now = target(t);
  const lagged = target(t - 0.22); // brows trail the eyes
  const tilt = ((target(t - 0.35).x - HEAD.x) / 320) * 0.08 * attention(t - 0.35);
  const blink = Math.max(...BLINKS.map((b) => 1 - clamp(Math.abs(t - b) / 0.12)));

  c.save();
  c.translate(HEAD.x, HEAD.y + 90);
  c.rotate(tilt);
  c.translate(-HEAD.x, -(HEAD.y + 90));
  // Head, ears and cheeks.
  circle(HEAD.x - 100, HEAD.y - 4, 22, "#C9D6DE");
  circle(HEAD.x + 100, HEAD.y - 4, 22, "#C9D6DE");
  circle(HEAD.x, HEAD.y, HEAD.r, ink);
  c.globalAlpha = 0.35;
  circle(HEAD.x - 66, HEAD.y + 40, 14, warm);
  circle(HEAD.x + 66, HEAD.y + 40, 14, warm);
  c.globalAlpha = 1;

  for (const eye of EYES) {
    // Socket.
    c.fillStyle = "#FFFFFF";
    c.beginPath();
    c.ellipse(eye.x, eye.y, SOCKET.rx, SOCKET.ry, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = dark;
    c.lineWidth = 3;
    c.stroke();
    // Pupil aims at the target from this eye's own position, so near targets converge.
    const dx = now.x - eye.x,
      dy = now.y - eye.y;
    const reach = clamp(Math.hypot(dx, dy) / 140);
    const angle = Math.atan2(dy, dx);
    const px = eye.x + Math.cos(angle) * PUPIL_TRAVEL.x * reach * focus;
    const py = eye.y + Math.sin(angle) * PUPIL_TRAVEL.y * reach * focus;
    c.save();
    c.beginPath();
    c.ellipse(eye.x, eye.y, SOCKET.rx - 1.5, SOCKET.ry - 1.5, 0, 0, Math.PI * 2);
    c.clip();
    circle(px, py, 11, dark);
    circle(px - 3.5, py - 4, 3, "#FFFFFF");
    // Eyelid descends from above inside the same socket clip.
    if (blink > 0) {
      c.fillStyle = "#C9D6DE";
      c.fillRect(eye.x - SOCKET.rx, eye.y - SOCKET.ry, SOCKET.rx * 2, SOCKET.ry * 2 * blink);
    }
    c.restore();
    // Brows raise when the (lagged) target is high, knit when it is close.
    const raise = clamp((HEAD.y - lagged.y) / 160) * 8 * attention(t - 0.22);
    const side = eye.x < HEAD.x ? -1 : 1;
    line(
      eye.x - 22,
      eye.y - 34 - raise + side * 2,
      eye.x + 22,
      eye.y - 34 - raise - side * 2,
      dark,
      5,
    );
  }
  // Mouth: neutral line, small "o" of surprise when the firefly comes close.
  const surprise = focus * (1 - clamp(Math.hypot(now.x - HEAD.x, now.y - 130) / 90));
  // A single mouth shape morphs from a flat line to a round "o".
  c.fillStyle = dark;
  c.beginPath();
  c.ellipse(HEAD.x, HEAD.y + 50, 22 - 11 * surprise, 2.5 + 8 * surprise, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();

  // The firefly target with a short glow.
  if (focus > 0.01 && now.x < 632) {
    c.save();
    c.globalAlpha = focus;
    c.shadowColor = warm;
    c.shadowBlur = 14;
    circle(now.x, now.y, 6, warm);
    c.restore();
    c.save();
    c.globalAlpha = 0.6 * focus;
    for (const s of [-1, 1]) {
      c.fillStyle = accent;
      c.beginPath();
      c.ellipse(now.x + s * 7, now.y - 4, 6, 3, s * 0.5 + Math.sin(t * 40) * 0.3, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
}
