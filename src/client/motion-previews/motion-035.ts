import { ink, accent, warm, dark, clamp, motionDrawing } from "./drawing";

/**
 * Orbit Choreography.
 * The camera is locked (corner brackets never move). Four bodies orbit the hub on
 * tilted ellipses with whole-number speeds (3, 2, 1 and −2 turns per loop), timed so all
 * of them line up in front of the hub at t = 3 s. A moon orbits the second body.
 * Depth order is per frame: anything behind the hub is drawn before it, anything in
 * front after it. Short fading trails stay subordinate to the bodies.
 */

const CENTER = { x: 320, y: 176 };
const LOOP = 6;
const ALIGN_AT = 3;
const BODIES = [
  { id: "1", rx: 110, ry: 30, turns: 3, size: 9, color: accent, tilt: -0.08 },
  { id: "2", rx: 168, ry: 58, turns: 2, size: 12, color: warm, tilt: -0.08 },
  { id: "3", rx: 226, ry: 86, turns: 1, size: 11, color: "#B6C9E8", tilt: -0.08 },
  { id: "4", rx: 270, ry: 112, turns: -2, size: 9, color: "#F4BA73", tilt: -0.08 },
];

function place(b: (typeof BODIES)[number], t: number) {
  // Angle π/2 = nearest point (front). Every body passes it together at ALIGN_AT.
  const a = Math.PI / 2 + (b.turns * Math.PI * 2 * (t - ALIGN_AT)) / LOOP;
  const x = Math.cos(a) * b.rx,
    y = Math.sin(a) * b.ry;
  return {
    x: CENTER.x + x * Math.cos(b.tilt) - y * Math.sin(b.tilt),
    y: CENTER.y + x * Math.sin(b.tilt) + y * Math.cos(b.tilt),
    depth: Math.sin(a), // +1 front, −1 back
  };
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  // Locked camera frame.
  c.strokeStyle = "#3C5262";
  c.lineWidth = 3;
  for (const [x, y, dx, dy] of [
    [24, 24, 1, 1],
    [616, 24, -1, 1],
    [24, 336, 1, -1],
    [616, 336, -1, -1],
  ] as [number, number, number, number][]) {
    c.beginPath();
    c.moveTo(x, y + dy * 22);
    c.lineTo(x, y);
    c.lineTo(x + dx * 22, y);
    c.stroke();
  }
  // Orbit guides.
  c.strokeStyle = "#22343F";
  c.lineWidth = 1.5;
  for (const b of BODIES) {
    c.beginPath();
    c.ellipse(CENTER.x, CENTER.y, b.rx, b.ry, b.tilt, 0, Math.PI * 2);
    c.stroke();
  }

  type Sprite = { depth: number; paint: () => void };
  const sprites: Sprite[] = [];
  for (const b of BODIES) {
    const now = place(b, t);
    const scale = 1 + now.depth * 0.25;
    sprites.push({
      depth: now.depth,
      paint: () => {
        // Trail: a few earlier positions, smaller and fainter.
        for (let k = 4; k >= 1; k--) {
          const past = place(b, t - k * 0.05); // where it was, whichever way it turns
          c.globalAlpha = 0.12 * (5 - k);
          circle(past.x, past.y, b.size * scale * (1 - k * 0.12), b.color);
        }
        c.globalAlpha = 1;
        circle(now.x, now.y, b.size * scale, b.color);
        text(b.id, now.x, now.y + 5, 13 * scale, dark);
        if (b.id === "2") {
          const m = (Math.PI * 2 * 4 * t) / LOOP;
          const mx = now.x + Math.cos(m) * 26 * scale,
            my = now.y + Math.sin(m) * 9 * scale;
          circle(mx, my, 4 * scale, ink);
        }
      },
    });
  }
  sprites.push({
    depth: 0,
    paint: () => {
      circle(CENTER.x, CENTER.y, 32, ink);
      text("A", CENTER.x, CENTER.y + 9, 26, dark);
    },
  });
  sprites.sort((a, b) => a.depth - b.depth).forEach((s) => s.paint());

  text("OBJECTS ORBIT · CAMERA HOLDS", 320, 52, 18, ink);
  const aligned = clamp(1 - Math.abs(t - ALIGN_AT) / 0.35);
  if (aligned > 0) {
    c.globalAlpha = aligned;
    text("ALIGNMENT", 540, 84, 16, accent);
    c.globalAlpha = 1;
  }
}
