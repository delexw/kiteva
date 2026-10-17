import { ink, accent, warm, dark, clamp, ease, motionDrawing } from "./drawing";

/**
 * Cursor-Driven Miniature Scene Parallax (terrarium).
 * Rear scenery, ground, creature, foreground ferns and the glass highlight each have a
 * depth factor. An authored pointer path offsets them by depth; a quick flick makes
 * the frog hop. Layers are clipped inside the jar with oversized art so no edge gaps.
 */

const JAR = { x: 320, y: 178, rx: 170, ry: 140 };
const DEPTH = { rear: -0.35, ground: 0.25, creature: 0.25, front: 0.9, glass: -0.8 };
const MAX_SHIFT = { x: 26, y: 10 };

// Pointer keys [time, x, y] in normalised jar units; hover weight brings it in and out.
const POINTER_KEYS: [number, number, number][] = [
  [0, 1.4, 0.6],
  [0.8, 0.9, 0.3],
  [2.6, -0.8, -0.3],
  [3.05, -0.7, 0.1],
  [3.25, 0.85, 0.1], // quick flick to the right
  [4.4, 0.1, 0],
  [5.0, 1.5, 0.7], // leaves the jar
  [6, 1.5, 0.7],
];
const HOP = { start: 3.3, duration: 0.55, from: 300, to: 352 };

function pointer(t: number) {
  for (let i = 1; i < POINTER_KEYS.length; i++) {
    const [t1, x1, y1] = POINTER_KEYS[i]!;
    const [t0, x0, y0] = POINTER_KEYS[i - 1]!;
    if (t <= t1) {
      const p = ease((t - t0) / (t1 - t0));
      return { x: x0 + (x1 - x0) * p, y: y0 + (y1 - y0) * p };
    }
  }
  return { x: 1.5, y: 0.7 };
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text, cursor } = motionDrawing(c);
  const ptr = pointer(t);
  // Influence fades when the pointer is outside the jar, so layers settle to neutral.
  const influence = clamp(1.6 - Math.hypot(ptr.x, ptr.y * 1.4));
  const nx = clamp((ptr.x + 1) / 2) * 2 - 1,
    ny = clamp((ptr.y + 1) / 2) * 2 - 1;
  const shift = (depth: number) => ({
    x: -nx * depth * MAX_SHIFT.x * influence,
    y: -ny * depth * MAX_SHIFT.y * influence,
  });

  // Plinth and jar silhouette are fixed; only the inner layers move.
  c.fillStyle = "#2A3F4C";
  c.beginPath();
  c.roundRect(170, 296, 300, 26, 8);
  c.fill();
  c.save();
  c.beginPath();
  c.ellipse(JAR.x, JAR.y, JAR.rx, JAR.ry, 0, 0, Math.PI * 2);
  c.clip();
  // Rear: dusk backdrop and distant reeds (oversized beyond the jar).
  let s = shift(DEPTH.rear);
  c.fillStyle = "#1C3846";
  c.fillRect(100 + s.x, 20 + s.y, 440, 320);
  for (let i = 0; i < 8; i++) {
    c.strokeStyle = "#3C6D6A";
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(196 + i * 36 + s.x, 262 + s.y);
    c.lineTo(204 + i * 36 + s.x, 128 + (i % 3) * 26 + s.y);
    c.stroke();
  }
  // Ground mound and pebbles.
  s = shift(DEPTH.ground);
  c.fillStyle = "#5A8877";
  c.beginPath();
  c.ellipse(320 + s.x, 282 + s.y, 200, 52, 0, 0, Math.PI * 2);
  c.fill();
  for (const [x, r] of [
    [240, 9],
    [262, 6],
    [410, 8],
  ] as [number, number][])
    circle(x + s.x, 262 + s.y, r, "#9AB3A6");
  // Creature shares the ground depth so it stays in contact; the flick triggers a hop.
  s = shift(DEPTH.creature);
  const hop = clamp((t - HOP.start) / HOP.duration);
  const hx = HOP.from + (HOP.to - HOP.from) * ease(hop);
  const height = Math.sin(hop * Math.PI) * 46;
  const squash =
    hop > 0 && hop < 1 ? 0 : (1 - clamp(Math.abs(t - HOP.start - HOP.duration) / 0.12)) * 0.25;
  c.fillStyle = "rgba(10, 20, 20, 0.35)";
  c.beginPath();
  c.ellipse(hx + s.x, 258 + s.y, 22 - height * 0.2, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.translate(hx + s.x, 258 + s.y - height);
  c.scale(1 + squash, 1 - squash);
  c.fillStyle = warm;
  c.beginPath();
  c.ellipse(0, -16, 24, 17, 0, 0, Math.PI * 2);
  c.fill();
  circle(-10, -32, 7, warm);
  circle(10, -32, 7, warm);
  circle(-10, -33, 3, dark);
  circle(10, -33, 3, dark);
  c.restore();
  // Foreground ferns move most.
  s = shift(DEPTH.front);
  c.strokeStyle = accent;
  c.lineWidth = 7;
  for (const [x, lean] of [
    [178, 0.6],
    [214, 0.25],
    [452, -0.35],
    [486, -0.6],
  ] as [number, number][]) {
    c.beginPath();
    c.moveTo(x + s.x, 330 + s.y);
    c.quadraticCurveTo(x + s.x + lean * 30, 270 + s.y, x + s.x + lean * 70, 236 + s.y);
    c.stroke();
  }
  c.restore();

  // Glass rim and its highlight, which slides against the pointer.
  c.strokeStyle = ink;
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(JAR.x, JAR.y, JAR.rx, JAR.ry, 0, 0, Math.PI * 2);
  c.stroke();
  s = shift(DEPTH.glass);
  c.strokeStyle = "rgba(234, 241, 245, 0.75)";
  c.lineWidth = 6;
  c.beginPath();
  c.ellipse(JAR.x + s.x, JAR.y + s.y, JAR.rx - 22, JAR.ry - 22, 0, -1.25, -0.55);
  c.stroke();

  const px = JAR.x + ptr.x * JAR.rx,
    py = JAR.y + ptr.y * JAR.ry;
  if (px < 630 && py < 350) cursor(px, py);
  text("MOSS TERRARIUM", 320, 340, 16, ink);
}
