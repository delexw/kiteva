import { ink, accent, warm, dark, clamp, motionDrawing } from "./drawing";

/**
 * Medium Swap.
 * One pose function (a figure waving beside a table) is rendered by two media: a 1920s
 * ink sketch and a 2020s flat-vector style. The new medium replaces the old through
 * authored vertical strips that drop in a staggered order while the wave continues;
 * joints, horizon and table are shared anchors and the era label lives in each layer.
 */

const FRAME = { x: 40, y: 48, w: 560, h: 262 };
const STRIPS = 8;
const SWAP = { start: 1.4, end: 3.6 };
type P = { x: number; y: number };

/** Shared skeleton: identical joints for both media at any time. */
function pose(t: number) {
  const wave = Math.sin(t * 4.2);
  const shoulder = { x: 420, y: 168 },
    hip = { x: 420, y: 232 };
  const upper = -0.75 + 0.22 * wave,
    lower = -1.55 + 0.55 * Math.sin(t * 4.2 - 0.7);
  const elbow = { x: shoulder.x + Math.cos(upper) * 34, y: shoulder.y + Math.sin(upper) * 34 };
  const hand = { x: elbow.x + Math.cos(lower) * 30, y: elbow.y + Math.sin(lower) * 30 };
  return {
    head: { x: 420, y: 140 },
    shoulder,
    hip,
    elbow,
    hand,
    restElbow: { x: 404, y: 198 },
    restHand: { x: 398, y: 228 },
    knees: [
      { x: 410, y: 262 },
      { x: 432, y: 262 },
    ],
    feet: [
      { x: 404, y: 290 },
      { x: 440, y: 290 },
    ],
  };
}
const HORIZON = 290;

function sketch(c: CanvasRenderingContext2D, t: number) {
  const j = pose(t);
  c.fillStyle = "#D9C4A0";
  c.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
  // Wobbly double ink line: deterministic jitter per segment, no randomness.
  const ink2 = (a: P, b: P, seed: number) => {
    c.strokeStyle = "#3B2A1C";
    for (let pass = 0; pass < 2; pass++) {
      const j1 = Math.sin(seed * 12.9 + pass * 3.1) * 1.6,
        j2 = Math.cos(seed * 7.7 + pass * 1.9) * 1.6;
      c.lineWidth = pass ? 1.2 : 2.2;
      c.beginPath();
      c.moveTo(a.x + j1, a.y - j2);
      c.lineTo(b.x - j2, b.y + j1);
      c.stroke();
    }
  };
  ink2({ x: 70, y: HORIZON }, { x: 570, y: HORIZON }, 1);
  for (let i = 0; i < 26; i++)
    ink2({ x: 70 + i * 19, y: 306 }, { x: 84 + i * 19, y: HORIZON + 2 }, i + 2); // hatching
  ink2({ x: 250, y: 236 }, { x: 350, y: 236 }, 40);
  ink2({ x: 300, y: 236 }, { x: 300, y: HORIZON }, 41);
  c.strokeStyle = "#3B2A1C";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(j.head.x, j.head.y, 20, 0, Math.PI * 2);
  c.stroke();
  const bones: [P, P][] = [
    [j.shoulder, j.hip],
    [j.shoulder, j.elbow],
    [j.elbow, j.hand],
    [j.shoulder, j.restElbow],
    [j.restElbow, j.restHand],
    [j.hip, j.knees[0]!],
    [j.knees[0]!, j.feet[0]!],
    [j.hip, j.knees[1]!],
    [j.knees[1]!, j.feet[1]!],
  ];
  bones.forEach(([a, b], i) => ink2(a, b, 60 + i));
  c.fillStyle = "#3B2A1C";
  c.textAlign = "left";
  c.font = "italic 600 18px serif";
  c.fillText("1920 · ink sketch", FRAME.x + 20, FRAME.y + 32);
}

function flat(c: CanvasRenderingContext2D, t: number) {
  const { circle, line } = motionDrawing(c);
  const j = pose(t);
  c.fillStyle = "#24506B";
  c.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
  circle(150, 110, 30, "#FFD27A");
  c.fillStyle = "#1A3A4E";
  c.fillRect(FRAME.x, HORIZON, FRAME.w, FRAME.y + FRAME.h - HORIZON);
  c.fillStyle = accent;
  c.beginPath();
  c.roundRect(250, 228, 100, 12, 6);
  c.fill();
  c.fillRect(294, 236, 12, HORIZON - 236);
  line(j.hip.x, j.hip.y, j.knees[0]!.x, j.knees[0]!.y, dark, 12);
  line(j.knees[0]!.x, j.knees[0]!.y, j.feet[0]!.x, j.feet[0]!.y, dark, 11);
  line(j.hip.x, j.hip.y, j.knees[1]!.x, j.knees[1]!.y, dark, 12);
  line(j.knees[1]!.x, j.knees[1]!.y, j.feet[1]!.x, j.feet[1]!.y, dark, 11);
  line(j.shoulder.x, j.shoulder.y, j.hip.x, j.hip.y, warm, 24);
  line(j.shoulder.x, j.shoulder.y, j.restElbow.x, j.restElbow.y, warm, 10);
  line(j.restElbow.x, j.restElbow.y, j.restHand.x, j.restHand.y, warm, 9);
  line(j.shoulder.x, j.shoulder.y, j.elbow.x, j.elbow.y, warm, 10);
  line(j.elbow.x, j.elbow.y, j.hand.x, j.hand.y, warm, 9);
  circle(j.hand.x, j.hand.y, 6, "#F4D3BC");
  circle(j.head.x, j.head.y, 20, "#F4D3BC");
  c.fillStyle = ink;
  c.textAlign = "left";
  c.font = "700 18px sans-serif";
  c.fillText("2020 · FLAT VECTOR", FRAME.x + 20, FRAME.y + 32);
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  const p = clamp((t - SWAP.start) / (SWAP.end - SWAP.start));
  sketch(c, t);
  if (p > 0) {
    // Union of strip rects: each strip drops top→bottom; order is authored, not random.
    const order = [3, 5, 1, 6, 0, 4, 7, 2];
    const width = FRAME.w / STRIPS;
    c.save();
    c.beginPath();
    order.forEach((strip, rank) => {
      const local = clamp(p * 1.8 - rank * 0.1);
      const eased = local * local * (3 - 2 * local);
      if (eased > 0) c.rect(FRAME.x + strip * width, FRAME.y, width + 0.5, FRAME.h * eased);
    });
    c.clip();
    flat(c, t);
    c.restore();
  }
  text("SAME ACTION · DIFFERENT MEDIUM", 320, 32, 16, ink);
}
