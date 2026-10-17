import { ink, accent, warm, dark, clamp, motionProgress, motionDrawing } from "./drawing";

/**
 * Cloth Response (schematic, analytic — not a physics simulation).
 * A banner hangs from two fixed pins. A gust enters from the left at t = 0.8: a
 * damped fold wave travels across the sheet (amplitude grows with distance from the
 * top edge and vanishes at the pins), then relaxes to rest by 5.6 s. The printed
 * "HI" letters and stripe live in surface (u, v) space, so they deform with the sheet.
 */

const PIN_L = { x: 160, y: 85 },
  PIN_R = { x: 480, y: 85 };
const WIDTH = PIN_R.x - PIN_L.x,
  HEIGHT = 190;
const GUST = 0.8;
const COLS = 20,
  ROWS = 10;

function disturbance(t: number) {
  if (t < GUST) return 0;
  const s = t - GUST;
  return (1 - Math.exp(-s * 5)) * Math.exp(-s * 0.85) * (1 - motionProgress(t, 4.6, 5.6));
}

/** Surface point for (u, v) in [0,1]²; u across, v down. Pins are (0,0) and (1,0). */
function surface(u: number, v: number, t: number) {
  const a = disturbance(t);
  const s = Math.max(0, t - GUST);
  const travel = Math.sin(s * 5.2 - u * 7); // fold wave moving left → right
  const edge = Math.sin(u * Math.PI); // zero at both pins
  const sag = 10 * edge; // static catenary-like droop of the free top edge
  return {
    x: PIN_L.x + u * WIDTH + a * 34 * v * edge * travel,
    y:
      PIN_L.y +
      sag * (1 - v) * 0.6 +
      v * HEIGHT +
      v * sag * 0.4 +
      a * 16 * v * edge * Math.cos(s * 5.2 - u * 7 + v * 2),
    slope: a * travel * v * edge, // for shading the folds
  };
}

function uvStroke(
  c: CanvasRenderingContext2D,
  t: number,
  points: [number, number][],
  color: string,
  width: number,
) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  points.forEach(([u, v], i) => {
    const p = surface(u, v, t);
    if (i) c.lineTo(p.x, p.y);
    else c.moveTo(p.x, p.y);
  });
  c.stroke();
}
const densify = (a: [number, number], b: [number, number], n = 10): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [
    a[0] + ((b[0] - a[0]) * i) / n,
    a[1] + ((b[1] - a[1]) * i) / n,
  ]);

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  text("PINNED CLOTH · SCHEMATIC MESH", 320, 38, 18, ink);

  // Shaded cells: brightness follows the local fold slope.
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      const corners = [
        surface(i / COLS, j / ROWS, t),
        surface((i + 1) / COLS, j / ROWS, t),
        surface((i + 1) / COLS, (j + 1) / ROWS, t),
        surface(i / COLS, (j + 1) / ROWS, t),
      ];
      const light = clamp(0.62 + corners[0]!.slope * 0.9);
      c.fillStyle = `rgb(${Math.round(60 + 60 * light)}, ${Math.round(150 + 72 * light)}, ${Math.round(140 + 60 * light)})`;
      c.beginPath();
      corners.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.fill();
    }
  // Printed artwork in surface space: a stripe and the letters "HI".
  uvStroke(c, t, densify([0.06, 0.82], [0.94, 0.82], 24), warm, 6);
  for (const stroke of [
    [
      [0.3, 0.25],
      [0.3, 0.65],
    ],
    [
      [0.46, 0.25],
      [0.46, 0.65],
    ],
    [
      [0.3, 0.45],
      [0.46, 0.45],
    ],
    [
      [0.62, 0.25],
      [0.62, 0.65],
    ],
  ] as [number, number][][])
    uvStroke(c, t, densify(stroke[0]!, stroke[1]!), dark, 9);
  // Mesh lines over the cells keep the deformation readable at card size.
  for (let j = 0; j <= ROWS; j += 2)
    uvStroke(c, t, densify([0, j / ROWS], [1, j / ROWS], COLS), "rgba(20,33,43,0.35)", 1);
  for (let i = 0; i <= COLS; i += 4)
    uvStroke(c, t, densify([i / COLS, 0], [i / COLS, 1], ROWS), "rgba(20,33,43,0.35)", 1);

  // Gust streaks pass once, left to right, at the moment of the disturbance.
  const gust = motionProgress(t, GUST - 0.3, GUST + 0.5);
  if (gust > 0 && gust < 1) {
    c.strokeStyle = accent;
    c.lineWidth = 2;
    c.globalAlpha = Math.sin(gust * Math.PI);
    for (let k = 0; k < 3; k++) {
      const x = 40 + gust * 520;
      c.beginPath();
      c.moveTo(x - 60, 150 + k * 40);
      c.lineTo(x, 150 + k * 40);
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  // Fixed attachment points.
  circle(160, 85, 7, warm);
  circle(480, 85, 7, warm);
  text(
    disturbance(t) > 0.02 ? "GUST · FOLDS TRAVEL" : t < GUST ? "AT REST" : "RELAXED",
    320,
    330,
    15,
    "#9FB0BC",
  );
}
