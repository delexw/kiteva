import { clamp, motionProgress } from "./drawing";

/**
 * Annotation-Mark Portal Transition.
 * One continuous marker stroke leaves a reference card, closes a rounded lasso around
 * an illustration and holds. The SAME stroke (identical point list, never swapped)
 * then straightens into a rectangle, its connector tail erases, and the rectangle —
 * clipping a copy of the lassoed content — scales about the region toward the camera
 * until it becomes the border of the next section. Ornaments and the incoming title
 * appear only after that frame has locked. All state derives from absolute time.
 */

type Pt = [number, number];
type Box = { cx: number; cy: number; a: number; b: number };
const FIELD = "#101418";
const CARD = "#F4F1EA";
const MARKER = "#3D7BFF";
const TICK = "#FF5C8A";
const SUN = "#FFD23F";
const HILL = "#E2487E";
const WHITE = "#F6F7F4";
export const PORTAL = {
  settle: 0.6,
  draw: { start: 0.6, end: 1.7 },
  hold: { start: 1.7, end: 2.4 },
  straighten: { start: 2.4, end: 2.62 },
  zoom: { start: 2.62, end: 3.4 },
  locked: 3.4,
  clear: { start: 3.4, end: 3.7 },
  ticks: { start: 3.72, end: 3.9 },
  title: { start: 3.9, end: 4.3 },
};
// Lassoed region (top-right illustration) and its lasso / final frame boxes.
const REGION = { x: 392, y: 74, w: 196, h: 116 };
const LASSO: Box = { cx: 490, cy: 132, a: 116, b: 72 };
export const FRAME: Box = { cx: 320, cy: 180, a: 286, b: 146 };
export const LOOP_POINTS = 72;
const CONNECTOR_POINTS = 24;

const superellipse = (box: Box, angle: number, wobble: number): Pt => {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const e = 2 / 4.2; // rounded-rectangle lasso
  const hand = 1 + wobble * (0.035 * Math.sin(angle * 3 + 0.6) + 0.02 * Math.cos(angle * 5));
  return [
    box.cx + box.a * hand * Math.sign(cos) * Math.pow(Math.abs(cos), e),
    box.cy + box.b * hand * Math.sign(sin) * Math.pow(Math.abs(sin), e),
  ];
};
/**
 * The 72 loop samples, defined once on a unit square [-1, 1]² by perimeter: start on the
 * left edge, run up and clockwise round all four corners, then overlap past the start
 * like a hand-closed lasso. The sample nearest each corner is the exact corner, so the
 * locked frame is a true rectangle. Each sample's polar angle gives its matching lasso
 * point, so lasso and rectangle share one parameterisation (and one stroke identity).
 */
const UNIT_PATH: Pt[] = [
  [-1, 0.25],
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -0.2],
];
const UNIT_LOOP: Pt[] = (() => {
  const segments = UNIT_PATH.slice(1).map((point, i) => {
    const previous = UNIT_PATH[i]!;
    return {
      from: previous,
      to: point,
      length: Math.hypot(point[0] - previous[0], point[1] - previous[1]),
    };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const at = (distance: number): Pt => {
    let remaining = distance;
    for (const segment of segments) {
      if (remaining <= segment.length) {
        const u = remaining / segment.length;
        return [
          segment.from[0] + (segment.to[0] - segment.from[0]) * u,
          segment.from[1] + (segment.to[1] - segment.from[1]) * u,
        ];
      }
      remaining -= segment.length;
    }
    return UNIT_PATH[UNIT_PATH.length - 1]!;
  };
  const samples = Array.from({ length: LOOP_POINTS }, (_, i) =>
    at((total * i) / (LOOP_POINTS - 1)),
  );
  // Snap the nearest sample to each corner (inner path vertices) so corners are exact.
  let distance = 0;
  segments.slice(0, -1).forEach((segment, i) => {
    distance += segment.length;
    samples[Math.round((distance / total) * (LOOP_POINTS - 1))] = UNIT_PATH[i + 1]!;
  });
  return samples;
})();
export const UNIT_CORNERS: Pt[] = UNIT_PATH.slice(1, 5);
const loopAngle = (i: number) => Math.atan2(UNIT_LOOP[i]![1], UNIT_LOOP[i]![0]);
const rectPoint = (box: Box, i: number): Pt => [
  box.cx + box.a * UNIT_LOOP[i]![0],
  box.cy + box.b * UNIT_LOOP[i]![1],
];
// Connector: quadratic curve from the front reference card into the lasso start.
const CONNECTOR_START: Pt = [206, 238];
const lassoStart = superellipse(LASSO, loopAngle(0), 1);
const CONNECTOR: Pt[] = Array.from({ length: CONNECTOR_POINTS }, (_, i) => {
  const u = i / (CONNECTOR_POINTS - 1);
  const control: Pt = [300, 262];
  return [
    (1 - u) ** 2 * CONNECTOR_START[0] + 2 * (1 - u) * u * control[0] + u * u * lassoStart[0],
    (1 - u) ** 2 * CONNECTOR_START[1] + 2 * (1 - u) * u * control[1] + u * u * lassoStart[1],
  ];
});
const DRAWN_LASSO: Pt[] = [
  ...CONNECTOR,
  ...Array.from({ length: LOOP_POINTS }, (_, i) => superellipse(LASSO, loopAngle(i), 1)),
];
const CUMULATIVE = DRAWN_LASSO.reduce<number[]>((acc, point, i) => {
  if (i === 0) return [0];
  const previous = DRAWN_LASSO[i - 1]!;
  return [...acc, acc[i - 1]! + Math.hypot(point[0] - previous[0], point[1] - previous[1])];
}, []);
const TOTAL = CUMULATIVE[CUMULATIVE.length - 1]!;
export const MARK_POINT_COUNT = DRAWN_LASSO.length;

const mixBox = (a: Box, b: Box, p: number): Box => ({
  cx: a.cx + (b.cx - a.cx) * p,
  cy: a.cy + (b.cy - a.cy) * p,
  a: a.a + (b.a - a.a) * p,
  b: a.b + (b.b - a.b) * p,
});

/** Frame box at time t: the lasso bounds tighten while straightening, then zoom to FRAME. */
export function frameBox(t: number): Box {
  const straighten = motionProgress(t, PORTAL.straighten.start, PORTAL.straighten.end);
  const zoom = motionProgress(t, PORTAL.zoom.start, PORTAL.zoom.end);
  const tight = mixBox(LASSO, { ...LASSO, a: LASSO.a * 0.94, b: LASSO.b * 0.9 }, straighten);
  return mixBox(tight, FRAME, zoom);
}

/** Uniform "cover" scale for the region copy: fills the box without stretching. */
export function regionCoverScale(box: Box) {
  return Math.max((box.a * 2) / REGION.w, (box.b * 2) / REGION.h);
}

/** The one persistent mark: same point count in every phase. */
export function markPoints(t: number): Pt[] {
  const straighten = motionProgress(t, PORTAL.straighten.start, PORTAL.straighten.end);
  if (straighten <= 0) return DRAWN_LASSO;
  const box = frameBox(t);
  return DRAWN_LASSO.map((point, index) => {
    if (index < CONNECTOR_POINTS) {
      // Connector points collapse onto the lasso start as the tail erases.
      const target = rectPoint(box, 0);
      return [
        point[0] + (target[0] - point[0]) * straighten,
        point[1] + (target[1] - point[1]) * straighten,
      ];
    }
    const loopIndex = index - CONNECTOR_POINTS;
    const lasso = superellipse(LASSO, loopAngle(loopIndex), 1 - straighten);
    const scaledLasso: Pt = [
      box.cx + ((lasso[0] - LASSO.cx) / LASSO.a) * box.a,
      box.cy + ((lasso[1] - LASSO.cy) / LASSO.b) * box.b,
    ];
    const rect = rectPoint(box, loopIndex);
    return [
      scaledLasso[0] + (rect[0] - scaledLasso[0]) * straighten,
      scaledLasso[1] + (rect[1] - scaledLasso[1]) * straighten,
    ];
  });
}

/** Region artwork drawn in a normalised 196×116 frame so the zoomed copy keeps identity. */
function regionArt(c: CanvasRenderingContext2D) {
  c.fillStyle = "#1A2230";
  c.fillRect(0, 0, REGION.w, REGION.h);
  c.fillStyle = SUN;
  c.beginPath();
  c.arc(50, 42, 22, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = HILL;
  c.beginPath();
  c.moveTo(0, 116);
  c.quadraticCurveTo(70, 52, 120, 92);
  c.quadraticCurveTo(160, 64, 196, 84);
  c.lineTo(196, 116);
  c.closePath();
  c.fill();
  c.fillStyle = WHITE;
  c.beginPath();
  c.moveTo(0, 116);
  c.quadraticCurveTo(60, 92, 110, 108);
  c.quadraticCurveTo(150, 96, 196, 110);
  c.lineTo(196, 116);
  c.closePath();
  c.fill();
  c.fillStyle = MARKER;
  c.beginPath();
  c.arc(150, 34, 12, 0, Math.PI * 2);
  c.fill();
}

function outgoingScene(c: CanvasRenderingContext2D) {
  c.fillStyle = WHITE;
  c.font = "800 30px sans-serif";
  c.textAlign = "left";
  c.fillText("02  ADD REFERENCES", 40, 56);
  // A fanned stack of three bordered reference cards.
  for (let k = 2; k >= 0; k--) {
    c.save();
    c.translate(64 + k * 18, 120 + k * 14);
    c.rotate((k - 1) * 0.04);
    c.fillStyle = CARD;
    c.fillRect(0, 0, 186, 128);
    c.fillStyle = ["#2C3A55", "#E2487E", SUN][k]!;
    c.fillRect(8, 8, 170, 112);
    c.fillStyle = CARD;
    c.beginPath();
    c.arc(52, 58, 18, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  c.save();
  c.translate(REGION.x, REGION.y);
  regionArt(c);
  c.restore();
  c.fillStyle = WHITE;
  c.font = "800 26px sans-serif";
  c.fillText("FOLLOW THE ASSET", 352, 258);
}

function strokeMark(
  c: CanvasRenderingContext2D,
  points: Pt[],
  from: number,
  to: number,
  join: CanvasLineJoin = "round",
) {
  c.strokeStyle = MARKER;
  c.lineWidth = 7;
  c.lineCap = "round";
  c.lineJoin = join;
  c.beginPath();
  let started = false;
  for (let i = 0; i < points.length; i++) {
    if (CUMULATIVE[i]! < from) continue;
    if (CUMULATIVE[i]! > to) {
      // Partial final segment so the draw advances smoothly by arc length.
      const previous = points[i - 1]!;
      const span = CUMULATIVE[i]! - CUMULATIVE[i - 1]!;
      const u = span > 0 ? (to - CUMULATIVE[i - 1]!) / span : 0;
      const point = points[i]!;
      if (started)
        c.lineTo(
          previous[0] + (point[0] - previous[0]) * u,
          previous[1] + (point[1] - previous[1]) * u,
        );
      break;
    }
    if (!started) {
      c.moveTo(points[i]![0], points[i]![1]);
      started = true;
    } else c.lineTo(points[i]![0], points[i]![1]);
  }
  c.stroke();
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  c.fillStyle = FIELD;
  c.fillRect(0, 0, 640, 360);
  const drawn = clamp((t - PORTAL.draw.start) / (PORTAL.draw.end - PORTAL.draw.start));
  const straighten = motionProgress(t, PORTAL.straighten.start, PORTAL.straighten.end);
  const zoom = motionProgress(t, PORTAL.zoom.start, PORTAL.zoom.end);
  const clear = motionProgress(t, PORTAL.clear.start, PORTAL.clear.end);

  // Outgoing layout: fully visible through the hold, then dimmed to a sliver during the zoom.
  if (t < PORTAL.locked) {
    outgoingScene(c);
    if (zoom > 0) {
      c.fillStyle = `rgba(16, 20, 24, ${(0.82 * zoom).toFixed(3)})`;
      c.fillRect(0, 0, 640, 360);
    }
  }
  const points = markPoints(t);
  if (straighten > 0) {
    const box = frameBox(t);
    // The lassoed content, clipped by the current frame and scaled UNIFORMLY (cover) about
    // the region centre, so the re-crop crops rather than stretches (the sun stays round).
    if (clear < 1) {
      const k = regionCoverScale(box);
      c.save();
      c.beginPath();
      c.rect(box.cx - box.a, box.cy - box.b, box.a * 2, box.b * 2);
      c.clip();
      c.globalAlpha = 1 - clear;
      c.translate(box.cx, box.cy);
      c.scale(k, k);
      c.translate(-REGION.w / 2, -REGION.h / 2);
      regionArt(c);
      c.restore();
    }
    // Faint trail of the rounded lasso during the re-crop peak.
    const trail = straighten * (1 - motionProgress(t, PORTAL.zoom.start, PORTAL.zoom.start + 0.3));
    if (trail > 0.01) {
      c.globalAlpha = 0.28 * trail;
      strokeMark(c, DRAWN_LASSO, CUMULATIVE[CONNECTOR_POINTS]!, TOTAL);
      c.globalAlpha = 1;
    }
    // Once fully straight, mitred joins keep the four exact corners square.
    strokeMark(c, points, 0, TOTAL, straighten >= 1 ? "miter" : "round");
  } else if (drawn > 0) {
    strokeMark(c, points, 0, TOTAL * drawn);
  }

  // data-reveal-after="annotation-frame": ornaments and title wait for the locked frame.
  if (t >= PORTAL.locked) {
    const ticks = motionProgress(t, PORTAL.ticks.start, PORTAL.ticks.end);
    if (ticks > 0) {
      c.strokeStyle = TICK;
      c.lineWidth = 4;
      c.lineCap = "round";
      const inset = 18,
        len = 22 * ticks;
      const left = FRAME.cx - FRAME.a + inset,
        right = FRAME.cx + FRAME.a - inset,
        top = FRAME.cy - FRAME.b + inset,
        bottom = FRAME.cy + FRAME.b - inset;
      for (const [x, y, dx, dy] of [
        [left, top, 1, 1],
        [right, top, -1, 1],
        [left, bottom, 1, -1],
        [right, bottom, -1, -1],
      ] as const) {
        c.beginPath();
        c.moveTo(x + dx * len, y);
        c.lineTo(x, y);
        c.lineTo(x, y + dy * len);
        c.stroke();
      }
    }
    const title = motionProgress(t, PORTAL.title.start, PORTAL.title.end);
    if (title > 0) {
      c.globalAlpha = title;
      c.fillStyle = WHITE;
      c.textAlign = "center";
      c.font = "800 40px sans-serif";
      c.fillText("03  REFERENCE VIDEO", 320, 178 + (1 - title) * 10);
      c.font = "700 19px sans-serif";
      c.fillStyle = SUN;
      c.fillText("the marked asset leads the next chapter", 320, 212);
      c.globalAlpha = 1;
    }
  }
}
