import { clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Cumulative Device-Feed Pipeline.
 * One persistent hero device (an original code-drawn monitor and keyboard) is clicked
 * awake. Step cards slide in, build their contents only after the card is complete,
 * draw a feed arrow (head hidden until the shaft arrives) and dock into the screen
 * edge as reduced chips that stay visible. Every arrow ends on free bezel edge that no
 * chip covers, with its head outside the device. A pull-back fans the chips at the left with
 * feed arrows, the screen processes (flowchart nodes before connectors) and holds the
 * finished diagram for 0.5 s, then the
 * screen fill bursts past the bezel into an output window whose contents appear after
 * it settles. Every transform is a pure function of absolute time.
 */

type Rect = { x: number; y: number; w: number; h: number };
type Pt = [number, number];
const GROUND = "#17383F";
const RAY = "#1D454D";
const BODY = "#C7CDD0";
const BODY_SHADE = "#9AA3A8";
const SCREEN = "#0D1417";
const PAPER = "#F2F0EA";
const MUSTARD = "#F3C246";
const ARROW = "#0A0E10";
const CORAL = "#FF6B4A";
const GLOW = "#E9F4EE";
export const DEVICE = { x: 404, y: 96, w: 176, h: 146 };
export const SCREEN_RECT: Rect = { x: 418, y: 110, w: 118, h: 92 };
export const OUTPUT: Rect = { x: 236, y: 58, w: 316, h: 226 };
export const PIPELINE = {
  cursorArrive: { start: 0, end: 0.4 },
  flash: { start: 0.4, end: 0.62 },
  pullBack: { start: 3.1, end: 3.35 },
  feeds: { start: 3.3, end: 3.6 },
  nodes: [3.45, 3.57, 3.69],
  nodePop: 0.12,
  connectors: [
    { from: 0, to: 1, start: 3.7, end: 3.82 },
    { from: 1, to: 2, start: 3.82, end: 3.95 },
  ],
  // The completed diagram holds 3.95–4.45 s (0.5 s) before the burst covers the screen.
  burst: { start: 4.45, end: 4.8 },
  output: { start: 4.85, end: 5.15 },
};
/** Time at which the processing diagram is complete (last connector drawn). */
export const PROCESSING_COMPLETE = Math.max(...PIPELINE.connectors.map((link) => link.end));
export type Arrow = { from: Pt; control: Pt; to: Pt };
const HEAD = 16;
type Step = {
  label: string;
  color: string;
  enter: [number, number];
  build: [number, number];
  arrow: [number, number];
  absorb: [number, number];
  from: Pt;
  rest: Rect;
  dock: Rect;
  fan: Rect;
  arc: number;
};
export const STEPS: Step[] = [
  {
    label: "1  ASSETS",
    color: PAPER,
    enter: [0.45, 0.75],
    build: [0.75, 1.15],
    arrow: [1.15, 1.4],
    absorb: [1.6, 1.95],
    from: [-230, 92],
    rest: { x: 70, y: 92, w: 210, h: 132 },
    dock: { x: 392, y: 118, w: 84, h: 53 },
    fan: { x: 26, y: 92, w: 150, h: 94 },
    arc: 0,
  },
  {
    label: "2  PROMPT",
    color: MUSTARD,
    enter: [1.65, 2.0],
    build: [2.0, 2.35],
    arrow: [2.35, 2.6],
    absorb: [2.8, 3.1],
    from: [60, -170],
    rest: { x: 84, y: 112, w: 210, h: 132 },
    dock: { x: 398, y: 150, w: 84, h: 53 },
    fan: { x: 58, y: 196, w: 150, h: 94 },
    arc: -70,
  },
];
// Every arrow ends ON the bezel's left edge (x = DEVICE.x) at a point no docked chip
// covers (step-1 chip spans y 118–171, step-2 chip y 150–203, plus shadows); heads sit
// outside the device, pointing in. Step 1 aims above both chips, step 2 below them.
export const STEP_ARROWS: Arrow[] = [
  { from: [288, 152], control: [350, 92], to: [DEVICE.x, 106] },
  { from: [302, 182], control: [352, 240], to: [DEVICE.x, 222] },
];
export const FEED_ARROWS: Arrow[] = [
  { from: [182, 139], control: [300, 104], to: [DEVICE.x, 146] },
  { from: [214, 243], control: [320, 214], to: [DEVICE.x, 200] },
];
const bezierAt = ({ from, control, to }: Arrow, u: number): Pt => [
  (1 - u) ** 2 * from[0] + 2 * (1 - u) * u * control[0] + u * u * to[0],
  (1 - u) ** 2 * from[1] + 2 * (1 - u) * u * control[1] + u * u * to[1],
];
/** Arrowhead triangle: tip exactly at the endpoint, base behind it along the shaft. */
export function arrowHead(arrow: Arrow): Pt[] {
  const [px, py] = bezierAt(arrow, 0.9);
  const [tx, ty] = arrow.to;
  const angle = Math.atan2(ty - py, tx - px);
  return [
    [tx, ty],
    [tx + Math.cos(angle + 2.6) * HEAD, ty + Math.sin(angle + 2.6) * HEAD],
    [tx + Math.cos(angle - 2.6) * HEAD, ty + Math.sin(angle - 2.6) * HEAD],
  ];
}
const NODES: Pt[] = [
  [446, 132],
  [490, 156],
  [446, 182],
];
// Fixed burst geometry (seeded constants, never re-randomised on seek).
const SPIKES = Array.from({ length: 16 }, (_, i) => ({
  angle: (i / 16) * Math.PI * 2 + ((i * 7) % 5) * 0.03,
  length: 150 + ((i * 37) % 70),
}));

const mixRect = (a: Rect, b: Rect, p: number): Rect => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  w: a.w + (b.w - a.w) * p,
  h: a.h + (b.h - a.h) * p,
});
const progress = (t: number, [start, end]: [number, number]) => motionProgress(t, start, end);

/** Where step i's card is at time t (null before it enters). */
export function cardRect(i: number, t: number): Rect | null {
  const step = STEPS[i]!;
  if (t < step.enter[0]) return null;
  const enter = progress(t, step.enter);
  const absorb = progress(t, step.absorb);
  const pull = motionProgress(t, PIPELINE.pullBack.start, PIPELINE.pullBack.end);
  // Entrance: slide (or arc) from off-frame to the rest rect.
  const start: Rect = { ...step.rest, x: step.from[0], y: step.from[1] };
  let rect = mixRect(start, step.rest, enter);
  if (enter < 1 && step.arc) rect = { ...rect, x: rect.x + Math.sin(enter * Math.PI) * step.arc };
  if (absorb > 0) rect = mixRect(step.rest, step.dock, absorb);
  if (pull > 0 && absorb >= 1) rect = mixRect(step.dock, step.fan, pull);
  return rect;
}

function device(c: CanvasRenderingContext2D) {
  c.fillStyle = BODY_SHADE;
  c.beginPath();
  c.roundRect(DEVICE.x + 6, DEVICE.y + 6, DEVICE.w, DEVICE.h, 14);
  c.fill();
  c.fillStyle = BODY;
  c.beginPath();
  c.roundRect(DEVICE.x, DEVICE.y, DEVICE.w, DEVICE.h, 14);
  c.fill();
  // Knobs and grille.
  c.fillStyle = BODY_SHADE;
  c.beginPath();
  c.arc(558, 130, 11, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(558, 162, 11, 0, Math.PI * 2);
  c.fill();
  for (let k = 0; k < 4; k++) c.fillRect(548, 184 + k * 9, 20, 4);
  // Keyboard.
  c.fillStyle = BODY;
  c.beginPath();
  c.roundRect(392, 252, 200, 34, 6);
  c.fill();
  c.fillStyle = BODY_SHADE;
  for (let row = 0; row < 2; row++)
    for (let key = 0; key < 11; key++) c.fillRect(400 + key * 17, 258 + row * 13, 13, 9);
}

function screen(c: CanvasRenderingContext2D, t: number) {
  const flash = t >= PIPELINE.flash.start && t < PIPELINE.flash.end ? 1 : 0; // hard switch, as observed
  c.fillStyle = flash ? GLOW : SCREEN;
  c.beginPath();
  c.roundRect(SCREEN_RECT.x, SCREEN_RECT.y, SCREEN_RECT.w, SCREEN_RECT.h, 10);
  c.fill();
  // Processing: nodes first, connectors only after both endpoints exist.
  const nodeOn = PIPELINE.nodes.map((start) => motionProgress(t, start, start + PIPELINE.nodePop));
  c.strokeStyle = GLOW;
  c.lineWidth = 2;
  for (const link of PIPELINE.connectors) {
    const p = motionProgress(t, link.start, link.end);
    if (p <= 0 || nodeOn[link.from]! < 1 || nodeOn[link.to]! < 1) continue;
    const [x0, y0] = NODES[link.from]!,
      [x1, y1] = NODES[link.to]!;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p);
    c.stroke();
  }
  nodeOn.forEach((on, i) => {
    if (on <= 0) return;
    const [x, y] = NODES[i]!;
    const s = 9 * ease(on);
    c.fillStyle = i === 1 ? MUSTARD : GLOW;
    c.fillRect(x - s, y - s * 0.7, s * 2, s * 1.4);
  });
}

function cardContents(c: CanvasRenderingContext2D, step: Step, rect: Rect, build: number) {
  const k = rect.w / step.rest.w;
  c.save();
  c.translate(rect.x, rect.y);
  c.scale(k, k);
  c.textAlign = "left";
  c.fillStyle = ARROW;
  c.font = "800 19px sans-serif";
  c.fillText(step.label, 14, 30);
  // Wireframe bars grow, then two image chips pop (staggered within the build).
  for (let row = 0; row < 3; row++) {
    const grow = clamp((build - row * 0.15) / 0.4);
    c.fillRect(14, 46 + row * 16, (row === 2 ? 90 : 130) * grow, 8);
  }
  for (let chip = 0; chip < 2; chip++) {
    const pop = clamp((build - 0.5 - chip * 0.2) / 0.3);
    if (pop <= 0) continue;
    c.fillStyle = chip ? CORAL : "#2F6F7A";
    c.fillRect(150 - chip * 8, 50 + chip * 26, 44 * pop, 32 * pop);
  }
  c.restore();
}

export const ARROW_HALO = GLOW;
function arrow(c: CanvasRenderingContext2D, geometry: Arrow, p: number, width = 5) {
  if (p <= 0) return;
  // The shaft stops at the head's base so the dark head, not the round cap, meets the bezel.
  const end = p >= 1 ? 0.9 : p;
  const shaft = () => {
    c.beginPath();
    c.moveTo(geometry.from[0], geometry.from[1]);
    const samples = 20;
    for (let i = 1; i <= samples; i++) {
      const [x, y] = bezierAt(geometry, (i / samples) * end);
      c.lineTo(x, y);
    }
    c.stroke();
  };
  c.lineCap = "round";
  // A light halo keeps the dark arrow readable on the teal ground and over the dark screen.
  c.strokeStyle = ARROW_HALO;
  c.lineWidth = width + 4;
  shaft();
  c.strokeStyle = ARROW;
  c.lineWidth = width;
  shaft();
  // data-arrowhead-for: the head exists only once the shaft has reached the endpoint.
  if (p >= 1) {
    const [tip, left, right] = arrowHead(geometry);
    c.beginPath();
    c.moveTo(tip![0], tip![1]);
    c.lineTo(left![0], left![1]);
    c.lineTo(right![0], right![1]);
    c.closePath();
    c.lineJoin = "round";
    c.strokeStyle = ARROW_HALO;
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = ARROW;
    c.fill();
  }
}

function cursorAt(t: number): Pt {
  const arrive = motionProgress(t, PIPELINE.cursorArrive.start, PIPELINE.cursorArrive.end);
  const settle = motionProgress(t, 0.7, 1.1);
  const start: Pt = [250, 380],
    click: Pt = [470, 150],
    rest: Pt = [528, 228];
  if (settle <= 0)
    return [start[0] + (click[0] - start[0]) * arrive, start[1] + (click[1] - start[1]) * arrive];
  return [click[0] + (rest[0] - click[0]) * settle, click[1] + (rest[1] - click[1]) * settle];
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { cursor } = motionDrawing(c);
  c.fillStyle = GROUND;
  c.fillRect(0, 0, 640, 360);
  // Static sunburst wedges behind the device.
  c.fillStyle = RAY;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    c.beginPath();
    c.moveTo(490, 170);
    c.lineTo(490 + Math.cos(a) * 520, 170 + Math.sin(a) * 520);
    c.lineTo(490 + Math.cos(a + 0.16) * 520, 170 + Math.sin(a + 0.16) * 520);
    c.closePath();
    c.fill();
  }
  device(c);
  screen(c, t);

  const pull = motionProgress(t, PIPELINE.pullBack.start, PIPELINE.pullBack.end);
  // Per-step feed arrows while the card is at rest; they fade as it docks.
  STEPS.forEach((step, i) => {
    const absorb = progress(t, step.absorb);
    if (absorb >= 1) return;
    const rect = cardRect(i, t);
    if (!rect) return;
    const p = progress(t, step.arrow);
    c.globalAlpha = 1 - absorb;
    arrow(c, STEP_ARROWS[i]!, p);
    c.globalAlpha = 1;
  });
  // Cumulative feed arrows from every fanned chip after the pull-back.
  const feeds = motionProgress(t, PIPELINE.feeds.start, PIPELINE.feeds.end);
  if (pull >= 1 || feeds > 0) FEED_ARROWS.forEach((geometry) => arrow(c, geometry, feeds, 6));

  // Cards: built contents appear only after the card container is complete.
  STEPS.forEach((step, i) => {
    const rect = cardRect(i, t);
    if (!rect) return;
    c.fillStyle = "rgba(0, 0, 0, 0.28)";
    c.fillRect(rect.x + 5, rect.y + 6, rect.w, rect.h);
    c.fillStyle = step.color;
    c.fillRect(rect.x, rect.y, rect.w, rect.h);
    const complete = progress(t, step.enter) >= 1;
    if (complete) cardContents(c, step, rect, progress(t, step.build));
  });

  // Output: the screen fill bursts past the bezel and settles into the output window.
  const burst = motionProgress(t, PIPELINE.burst.start, PIPELINE.burst.end);
  if (burst > 0) {
    const cx = SCREEN_RECT.x + SCREEN_RECT.w / 2,
      cy = SCREEN_RECT.y + SCREEN_RECT.h / 2;
    const rays = burst * (1 - motionProgress(t, PIPELINE.burst.end, PIPELINE.burst.end + 0.25));
    if (rays > 0) {
      c.fillStyle = ARROW;
      for (const spike of SPIKES) {
        const len = spike.length * rays;
        c.beginPath();
        c.moveTo(cx + Math.cos(spike.angle - 0.09) * 30, cy + Math.sin(spike.angle - 0.09) * 30);
        c.lineTo(cx + Math.cos(spike.angle) * (30 + len), cy + Math.sin(spike.angle) * (30 + len));
        c.lineTo(cx + Math.cos(spike.angle + 0.09) * 30, cy + Math.sin(spike.angle + 0.09) * 30);
        c.closePath();
        c.fill();
      }
      // Halftone impact ring: dot size falls off with distance.
      c.fillStyle = CORAL;
      for (let ring = 1; ring <= 3; ring++)
        for (let d = 0; d < 18; d++) {
          const a = (d / 18) * Math.PI * 2 + ring * 0.2;
          const r = (60 + ring * 34) * rays;
          c.beginPath();
          c.arc(
            cx + Math.cos(a) * r,
            cy + Math.sin(a) * r,
            Math.max(0.5, (5 - ring) * rays),
            0,
            Math.PI * 2,
          );
          c.fill();
        }
    }
    const outputRect = mixRect(SCREEN_RECT, OUTPUT, ease(burst));
    c.fillStyle = GLOW;
    c.beginPath();
    c.roundRect(outputRect.x, outputRect.y, outputRect.w, outputRect.h, 12);
    c.fill();
    c.strokeStyle = ARROW;
    c.lineWidth = 3;
    c.stroke();
    // data-reveal-after="output-window": contents fill in only after it settles.
    if (burst >= 1) {
      const fill = motionProgress(t, PIPELINE.output.start, PIPELINE.output.end);
      if (fill > 0) {
        c.globalAlpha = fill;
        c.textAlign = "left";
        c.fillStyle = ARROW;
        c.font = "800 20px sans-serif";
        c.fillText("3  OUTPUT", OUTPUT.x + 18, OUTPUT.y + 34);
        c.fillStyle = "#2F6F7A";
        c.fillRect(OUTPUT.x + 18, OUTPUT.y + 52, 150 * fill, 96);
        c.fillStyle = CORAL;
        c.beginPath();
        c.arc(OUTPUT.x + 70, OUTPUT.y + 100, 22 * fill, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = ARROW;
        c.fillRect(OUTPUT.x + 18, OUTPUT.y + 166, 230 * fill, 8);
        c.fillRect(OUTPUT.x + 18, OUTPUT.y + 184, 160 * fill, 8);
        c.font = "600 14px sans-serif";
        c.textAlign = "right";
        c.fillText("illustrative output", OUTPUT.x + OUTPUT.w - 14, OUTPUT.y + 214);
        c.globalAlpha = 1;
      }
    }
  }
  const [x, y] = cursorAt(t);
  cursor(x, y);
}
