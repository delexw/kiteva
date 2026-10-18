import { TAU, clamp, ease, motionProgress, seeded } from "./drawing";

/**
 * Rotating Sonar-Sweep Reveal.
 * One sector-shaped beam rotates clockwise at a constant rate around one fixed pivot.
 * Inside the beam the illustration is clear and slightly brightened; outside it the
 * same illustration is dimmed and then resolved into a dark LED dot matrix (the image
 * is seen only through a fixed grid of small square LED-cell apertures). The beam angle is a closed-form
 * function of absolute time and the mask is rebuilt from that angle alone, so there is
 * no persistence trail or accumulated reveal history and every seek is exact.
 * The underwater scene is an original code drawing made for this study.
 */

export const SONAR = {
  pivot: { x: 316, y: 172 },
  /** Seconds per revolution (clockwise). */
  period: 4,
  /** Absolute time at which the beam starts rotating from its start angle. */
  start: 0.5,
  /** Canvas angle (radians, y down) of the beam centre at `start`: bottom-left. */
  startAngle: (3 * Math.PI) / 4,
  /** Angular width of the beam. */
  width: (52 * Math.PI) / 180,
  beamIn: { start: 0.5, end: 0.85 },
  /** LED cells: a fixed 8px grid of 5px apertures separated by dark gap bars. */
  dots: { start: 1.4, end: 2.6, pitch: 8, aperture: 5 },
  dim: { establish: 0.5, settle: 0.9, floor: 5.2, first: 0.66, last: 0.5 },
  reach: 900,
} as const;

/** Beam-centre angle in canvas radians. Increasing angle is clockwise on screen. */
export function sweepAngle(time: number) {
  return SONAR.startAngle + (TAU * (time - SONAR.start)) / SONAR.period;
}
/** Compass bearing of the beam centre in degrees: 0 = up, 90 = right, clockwise. */
export function sweepBearing(time: number) {
  const degrees = (sweepAngle(time) * 180) / Math.PI + 90;
  return ((degrees % 360) + 360) % 360;
}
/** 0 before the beam appears, 1 once it is fully established. */
export function beamStrength(time: number) {
  return motionProgress(time, SONAR.beamIn.start, SONAR.beamIn.end);
}
/** How far the outside region has turned into dot matrix (0 = clear, 1 = full LED grid). */
export function dotMatrixMix(time: number) {
  return motionProgress(time, SONAR.dots.start, SONAR.dots.end);
}
/** Brightness multiplier of the region outside the beam. */
export function outsideBrightness(time: number) {
  const d = SONAR.dim;
  if (time < d.establish) return 1;
  if (time < d.settle)
    return 1 - (1 - d.first) * ease((time - d.establish) / (d.settle - d.establish));
  return d.first + (d.last - d.first) * clamp((time - d.settle) / (d.floor - d.settle));
}
/** Whether a stage point lies inside the beam sector at this time (pure, no history). */
export function beamContains(x: number, y: number, time: number) {
  if (beamStrength(time) <= 0) return false;
  const { pivot, width } = SONAR;
  if (x === pivot.x && y === pivot.y) return true;
  const delta = Math.atan2(y - pivot.y, x - pivot.x) - sweepAngle(time);
  const wrapped = ((((delta + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return Math.abs(wrapped) <= width / 2;
}

// ---------------------------------------------------------------------------
// Original code-drawn scene: a manta ray over a kelp reef with a small submersible.
// ---------------------------------------------------------------------------

const fishRandom = seeded(4701);
const FISH = Array.from({ length: 24 }, () => ({
  x: 452 + fishRandom() * 150,
  y: 54 + fishRandom() * 90,
  size: 4 + fishRandom() * 4,
}));
const bubbleRandom = seeded(4702);
const BUBBLES = Array.from({ length: 11 }, (_, i) => ({
  x: 506 + Math.sin(i * 1.7) * 7,
  y: 228 - i * 17,
  r: 2 + bubbleRandom() * 3,
}));
const KELP = [
  [36, 6],
  [64, -9],
  [92, 4],
  [146, -6],
  [404, 7],
  [432, -5],
  [604, 6],
] as const;
const BANDS = ["#4E8FC4", "#3872AE", "#285894", "#1B3F74", "#122C55", "#0B1D3A"];

function drawScene(c: CanvasRenderingContext2D) {
  BANDS.forEach((color, i) => {
    c.fillStyle = color;
    c.fillRect(0, i * 60, 640, 61);
  });
  // Flat light shafts from the surface.
  c.fillStyle = "rgba(232, 242, 255, 0.11)";
  for (const [x, w, lean] of [
    [90, 46, 120],
    [220, 30, 90],
    [350, 56, 140],
    [500, 34, 100],
  ] as const) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + w, 0);
    c.lineTo(x + w + lean, 300);
    c.lineTo(x + lean - w * 0.4, 300);
    c.closePath();
    c.fill();
  }
  // Fish school.
  c.fillStyle = "#F1E8D2";
  for (const fish of FISH) {
    c.beginPath();
    c.ellipse(fish.x, fish.y, fish.size * 1.6, fish.size * 0.62, -0.12, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(fish.x - fish.size * 1.4, fish.y);
    c.lineTo(fish.x - fish.size * 2.5, fish.y - fish.size * 0.7);
    c.lineTo(fish.x - fish.size * 2.5, fish.y + fish.size * 0.7);
    c.closePath();
    c.fill();
  }
  // Manta ray: dark back, cream wing edges and back spots.
  c.fillStyle = "#0D1A31";
  c.beginPath();
  c.moveTo(252, 92);
  c.bezierCurveTo(206, 96, 150, 120, 92, 168);
  c.bezierCurveTo(156, 162, 204, 172, 236, 196);
  c.lineTo(262, 198);
  c.bezierCurveTo(296, 168, 352, 146, 418, 132);
  c.bezierCurveTo(360, 108, 300, 92, 252, 92);
  c.closePath();
  c.fill();
  c.strokeStyle = "#0D1A31";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(249, 197);
  c.bezierCurveTo(246, 240, 230, 262, 204, 282);
  c.stroke();
  for (const [x, y, angle] of [
    [236, 96, -0.5],
    [268, 94, 0.4],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, 14, 5, angle, 0, TAU);
    c.fill();
  }
  c.strokeStyle = "#F1E8D2";
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(96, 166);
  c.bezierCurveTo(158, 160, 206, 170, 236, 194);
  c.moveTo(262, 196);
  c.bezierCurveTo(298, 168, 352, 146, 414, 133);
  c.stroke();
  c.fillStyle = "#F1E8D2";
  for (const [x, y, r] of [
    [222, 132, 5],
    [244, 122, 4],
    [272, 128, 5],
    [296, 136, 3.5],
    [198, 146, 3.5],
    [256, 146, 3],
  ] as const) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  // Reef and seabed silhouette.
  c.fillStyle = "#081325";
  c.beginPath();
  c.moveTo(0, 360);
  c.lineTo(0, 300);
  c.bezierCurveTo(60, 284, 120, 318, 180, 300);
  c.bezierCurveTo(240, 282, 300, 312, 360, 306);
  c.bezierCurveTo(430, 300, 480, 278, 540, 292);
  c.bezierCurveTo(590, 302, 620, 290, 640, 296);
  c.lineTo(640, 360);
  c.closePath();
  c.fill();
  c.strokeStyle = "#2E8C7A";
  c.lineWidth = 5;
  for (const [x, sway] of KELP) {
    c.beginPath();
    c.moveTo(x, 330);
    c.bezierCurveTo(x + sway * 2, 280, x - sway * 2, 240, x + sway, 196);
    c.stroke();
  }
  // Fan coral.
  c.strokeStyle = "#F1E8D2";
  c.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const angle = -Math.PI / 2 + (i - 3) * 0.22;
    c.beginPath();
    c.moveTo(300, 318);
    c.lineTo(300 + Math.cos(angle) * 44, 318 + Math.sin(angle) * 44);
    c.stroke();
  }
  // Small submersible with a lit porthole.
  c.fillStyle = "#E8C35A";
  c.beginPath();
  c.roundRect(470, 236, 96, 44, 22);
  c.fill();
  c.fillStyle = "#0D1A31";
  c.fillRect(556, 248, 18, 20);
  c.fillRect(498, 226, 30, 12);
  c.fillStyle = "#F1E8D2";
  c.beginPath();
  c.arc(494, 258, 11, 0, TAU);
  c.fill();
  c.strokeStyle = "#0D1A31";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(494, 258, 11, 0, TAU);
  c.stroke();
  c.strokeStyle = "rgba(241, 232, 210, 0.75)";
  c.lineWidth = 1.5;
  for (const bubble of BUBBLES) {
    c.beginPath();
    c.arc(bubble.x, bubble.y, bubble.r, 0, TAU);
    c.stroke();
  }
}

function sector(c: CanvasRenderingContext2D, angle: number) {
  const { pivot, width, reach } = SONAR;
  c.moveTo(pivot.x, pivot.y);
  c.arc(pivot.x, pivot.y, reach, angle - width / 2, angle + width / 2);
  c.closePath();
}

function hud(c: CanvasRenderingContext2D, time: number) {
  const strength = beamStrength(time);
  c.fillStyle = "rgba(5, 8, 15, 0.72)";
  c.fillRect(14, 12, 196, 24);
  c.fillRect(468, 12, 158, 24);
  c.font = "600 12px ui-monospace, Menlo, monospace";
  c.textAlign = "left";
  c.fillStyle = "#F1E8D2";
  c.fillText(`SONAR SWEEP · ${SONAR.period.toFixed(1)} s/rev`, 24, 28);
  c.textAlign = "right";
  c.fillText(
    strength > 0
      ? `BRG ${String(Math.round(sweepBearing(time)) % 360).padStart(3, "0")}° CW`
      : "BRG ---",
    616,
    28,
  );
  c.textAlign = "right";
  c.fillStyle = "rgba(241, 232, 210, 0.7)";
  c.font = "500 10px ui-monospace, Menlo, monospace";
  c.fillText("ILLUSTRATIVE SCENE · CODE-DRAWN", 626, 350);
  // Fixed pivot marker.
  if (strength > 0) {
    const { x, y } = SONAR.pivot;
    c.strokeStyle = `rgba(241, 232, 210, ${0.8 * strength})`;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x, y, 6, 0, TAU);
    c.moveTo(x - 11, y);
    c.lineTo(x - 3, y);
    c.moveTo(x + 3, y);
    c.lineTo(x + 11, y);
    c.stroke();
  }
}

export default function motion047(c: CanvasRenderingContext2D, time: number) {
  drawScene(c);
  const strength = beamStrength(time);
  if (strength > 0) {
    const angle = sweepAngle(time);
    const { pivot, reach, width, dots } = SONAR;
    // Outside the beam: dim, then resolve to a dark dot matrix of the same image.
    c.save();
    c.beginPath();
    c.rect(0, 0, 640, 360);
    sector(c, angle);
    c.clip("evenodd");
    c.fillStyle = `rgba(4, 7, 14, ${(1 - outsideBrightness(time)) * strength})`;
    c.fillRect(0, 0, 640, 360);
    const mix = dotMatrixMix(time) * strength;
    if (mix > 0) {
      // One path of gap bars (union, nonzero) leaves square LED apertures showing the image.
      const gap = dots.pitch - dots.aperture;
      c.fillStyle = `rgba(4, 7, 14, ${0.8 * mix})`;
      c.beginPath();
      for (let y = 0; y <= 360; y += dots.pitch) c.rect(0, y - gap / 2, 640, gap);
      for (let x = 0; x <= 640; x += dots.pitch) c.rect(x - gap / 2, 0, gap, 360);
      c.fill();
    }
    c.restore();
    // Inside the beam: the clear image, slightly brightened.
    c.save();
    c.beginPath();
    sector(c, angle);
    c.clip();
    c.globalCompositeOperation = "lighter";
    c.fillStyle = `rgba(150, 190, 255, ${0.16 * strength})`;
    c.fillRect(0, 0, 640, 360);
    c.restore();
    // Sharp bright leading edge (clockwise side) and a softer trailing edge.
    const edge = (theta: number, alpha: number, lineWidth: number) => {
      c.strokeStyle = `rgba(226, 238, 255, ${alpha * strength})`;
      c.lineWidth = lineWidth;
      c.beginPath();
      c.moveTo(pivot.x, pivot.y);
      c.lineTo(pivot.x + Math.cos(theta) * reach, pivot.y + Math.sin(theta) * reach);
      c.stroke();
    };
    edge(angle + width / 2, 0.9, 2.2);
    edge(angle - width / 2, 0.35, 1);
  }
  hud(c, time);
}
