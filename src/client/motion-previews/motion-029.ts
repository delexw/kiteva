import { warm, dark, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Stroke Reveal.
 * Authored contours are revealed in drawing order by arc length: horizon, mountain
 * ridge, sun, birds. A pen tip rides each path, oriented to its tangent. Pigment
 * washes go in only after their outlines exist and are painted beneath the ink, so
 * completed outlines are never erased. The finished drawing holds.
 *
 * Annotation-lifecycle option (frame findings f619–654, f1027–1078, f1339–1368): on a
 * separate annotation layer — never the drawing itself — a brush arrow points from a
 * note to the sun. Its head is hidden until the shaft reaches the endpoint; it holds
 * while the note is read, straightens from a hook into a line (same points), then
 * retracts from its tail into the target with the head hidden from the first retract
 * frame, and the sun pulses as if fed. The over/under weave is not implemented.
 */

type Pt = [number, number];
const PAPER = { x: 60, y: 62, w: 520, h: 250 };
const circlePath = (cx: number, cy: number, r: number, n = 40): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
const RIDGE: Pt[] = [
  [90, 262],
  [150, 210],
  [190, 232],
  [262, 148],
  [312, 200],
  [352, 176],
  [430, 236],
  [470, 214],
  [550, 262],
];
const STROKES: { points: Pt[]; start: number; end: number; width: number }[] = [
  {
    points: [
      [84, 262],
      [556, 262],
    ],
    start: 0.35,
    end: 0.85,
    width: 3,
  },
  { points: RIDGE, start: 0.95, end: 2.05, width: 4 },
  { points: circlePath(470, 120, 30), start: 2.15, end: 2.75, width: 3 },
  {
    points: [
      [212, 112],
      [222, 104],
      [232, 112],
      [242, 104],
      [252, 112],
    ],
    start: 2.85,
    end: 3.1,
    width: 2.5,
  },
];

export const ANNOTATION = {
  note: { start: 4.3, end: 4.45 },
  draw: { start: 4.38, end: 4.78 },
  hold: { start: 4.78, end: 5.15 },
  straighten: { start: 5.15, end: 5.35 },
  retract: { start: 5.35, end: 5.65 },
  pulse: { start: 5.62, end: 5.85 },
};
const ARROW_START: Pt = [366, 102];
const ARROW_END: Pt = [436, 116];
const ARROW_POINTS = 24;

/** Annotation arrow state: drawn span [from, to] of its points, hook amount and head visibility. */
export function annotationState(t: number) {
  const drawn = clamp((t - ANNOTATION.draw.start) / (ANNOTATION.draw.end - ANNOTATION.draw.start));
  const hook = 1 - motionProgress(t, ANNOTATION.straighten.start, ANNOTATION.straighten.end);
  const retract = motionProgress(t, ANNOTATION.retract.start, ANNOTATION.retract.end);
  return {
    from: retract,
    to: drawn,
    hook,
    // data-arrowhead-for: visible only once the shaft is complete and before any retract.
    head: drawn >= 1 && t < ANNOTATION.retract.start,
  };
}

function arrowPoint(u: number, hook: number): Pt {
  const x = ARROW_START[0] + (ARROW_END[0] - ARROW_START[0]) * u;
  const y = ARROW_START[1] + (ARROW_END[1] - ARROW_START[1]) * u;
  return [x - 10 * hook * Math.sin(Math.PI * u), y - 30 * hook * Math.sin(Math.PI * u)];
}

function annotation(c: CanvasRenderingContext2D, t: number) {
  const note = motionProgress(t, ANNOTATION.note.start, ANNOTATION.note.end);
  if (note > 0) {
    c.globalAlpha = note;
    c.textAlign = "right";
    c.fillStyle = "#B4412F";
    c.font = "italic 700 16px serif";
    c.fillText("first light", 360, 108);
    c.globalAlpha = 1;
  }
  const state = annotationState(t);
  if (state.to <= 0 || state.from >= 1) return;
  const first = Math.floor(state.from * (ARROW_POINTS - 1));
  const last = state.to * (ARROW_POINTS - 1);
  c.strokeStyle = "#B4412F";
  c.lineWidth = 3.5;
  c.lineCap = "round";
  c.beginPath();
  const tail = arrowPoint(Math.max(state.from, first / (ARROW_POINTS - 1)), state.hook);
  c.moveTo(tail[0], tail[1]);
  for (let i = first + 1; i <= Math.floor(last); i++) {
    const [x, y] = arrowPoint(i / (ARROW_POINTS - 1), state.hook);
    c.lineTo(x, y);
  }
  const tip = arrowPoint(state.to, state.hook);
  c.lineTo(tip[0], tip[1]);
  c.stroke();
  if (state.head) {
    const before = arrowPoint(0.9, state.hook);
    const angle = Math.atan2(ARROW_END[1] - before[1], ARROW_END[0] - before[0]);
    c.fillStyle = "#B4412F";
    c.beginPath();
    c.moveTo(ARROW_END[0] + Math.cos(angle) * 4, ARROW_END[1] + Math.sin(angle) * 4);
    c.lineTo(ARROW_END[0] + Math.cos(angle + 2.6) * 12, ARROW_END[1] + Math.sin(angle + 2.6) * 12);
    c.lineTo(ARROW_END[0] + Math.cos(angle - 2.6) * 12, ARROW_END[1] + Math.sin(angle - 2.6) * 12);
    c.closePath();
    c.fill();
  }
}

function lengths(points: Pt[]) {
  const acc = [0];
  for (let i = 1; i < points.length; i++)
    acc.push(
      acc[i - 1]! +
        Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]),
    );
  return acc;
}

/** Stroke a polyline up to `fraction` of its length; return the tip and its heading. */
function partialStroke(c: CanvasRenderingContext2D, points: Pt[], fraction: number) {
  const acc = lengths(points);
  const target = acc[acc.length - 1]! * fraction;
  c.beginPath();
  c.moveTo(points[0]![0], points[0]![1]);
  let tip = { x: points[0]![0], y: points[0]![1], heading: 0 };
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!,
      [x1, y1] = points[i]!;
    const heading = Math.atan2(y1 - y0, x1 - x0);
    if (acc[i]! <= target) {
      c.lineTo(x1, y1);
      tip = { x: x1, y: y1, heading };
    } else {
      const u = (target - acc[i - 1]!) / (acc[i]! - acc[i - 1]!);
      tip = { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, heading };
      c.lineTo(tip.x, tip.y);
      break;
    }
  }
  c.stroke();
  return tip;
}

function penTip(c: CanvasRenderingContext2D, x: number, y: number, heading: number) {
  c.save();
  c.translate(x, y);
  c.rotate(heading - Math.PI / 4);
  c.fillStyle = warm;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(8, -26);
  c.lineTo(20, -14);
  c.closePath();
  c.fill();
  c.fillStyle = dark;
  c.fillRect(8, -40, 12, 18);
  c.restore();
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  c.fillStyle = "#E6EDF1";
  c.beginPath();
  c.roundRect(PAPER.x, PAPER.y, PAPER.w, PAPER.h, 6);
  c.fill();
  text("FOLLOW THE STROKE", 320, 44, 18, "#EAF1F5");

  // Pigment beneath the ink: the ridge wash sweeps left→right, the sun fills from centre.
  const ridgeWash = motionProgress(t, 3.2, 3.9);
  if (ridgeWash > 0) {
    c.save();
    c.beginPath();
    c.rect(PAPER.x, PAPER.y, 30 + ridgeWash * (PAPER.w - 30), PAPER.h);
    c.clip();
    c.fillStyle = "rgba(120, 222, 200, 0.55)";
    c.beginPath();
    RIDGE.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
    c.restore();
  }
  const sunFill = motionProgress(t, 3.05, 3.5);
  if (sunFill > 0) circle(470, 120, 29 * ease(sunFill), "rgba(255, 146, 108, 0.75)");

  // Ink strokes in order; earlier strokes stay drawn.
  c.strokeStyle = dark;
  let active: { x: number; y: number; heading: number } | undefined;
  for (const stroke of STROKES) {
    const p = clamp((t - stroke.start) / (stroke.end - stroke.start));
    if (p <= 0) continue;
    c.lineWidth = stroke.width;
    const tip = partialStroke(c, stroke.points, p);
    if (p < 1) active = tip;
  }
  if (active) penTip(c, active.x, active.y, active.heading);
  // Title caption fades in only once every stroke and wash is complete.
  const sign = motionProgress(t, 3.95, 4.3);
  if (sign > 0) {
    c.globalAlpha = sign;
    c.textAlign = "right";
    c.fillStyle = "#4A5E6C";
    c.font = "italic 600 16px serif";
    c.fillText("— morning ridge", 556, 296);
    c.globalAlpha = 1;
  }
  annotation(c, t);
  // The fed target answers with one ring that expands and clears.
  const pulse = motionProgress(t, ANNOTATION.pulse.start, ANNOTATION.pulse.end);
  if (pulse > 0 && pulse < 1) {
    c.globalAlpha = 1 - pulse;
    c.strokeStyle = warm;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(470, 120, 32 + pulse * 18, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
  }
}
