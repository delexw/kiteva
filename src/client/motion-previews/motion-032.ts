import { ink, accent, motionDrawing } from "./drawing";

/**
 * Flock Flow.
 * Each agent sits on a lattice slot (lag along a shared figure-eight path × lateral
 * offset across it). The lattice spacing stretches and compresses with time, and the
 * path crossing makes the group coil through itself. Agents point along their own
 * velocity. Every term is periodic over the 6 s clip, so the loop closes exactly.
 */

const LOOP = 6;
const TAU = Math.PI * 2;
const ROWS = 14,
  LANES = 7;

/** Shared flow path (figure-eight), parameter u in cycles. */
function path(u: number) {
  const a = u * TAU;
  return { x: 320 + Math.sin(a) * 220, y: 188 + Math.sin(a * 2) * 92 };
}

function agent(row: number, lane: number, t: number) {
  const w = (TAU * t) / LOOP;
  // Stretch/compress: lag between rows breathes twice per loop.
  const spacing = 0.012 + 0.009 * (0.5 + 0.5 * Math.sin(w * 2));
  const u = t / LOOP - row * spacing;
  const p = path(u),
    q = path(u + 0.002);
  const heading = Math.atan2(q.y - p.y, q.x - p.x);
  // Lateral offset across the path, narrowing as the group compresses.
  const width = 7 + 4 * (0.5 + 0.5 * Math.cos(w * 2));
  const lateral = (lane - (LANES - 1) / 2) * width;
  // Small bounded individual wobble (keeps separation, adds life), periodic in the loop.
  const wobble = Math.sin(w * 3 + row * 1.7 + lane * 2.3) * 2;
  return {
    x: p.x - Math.sin(heading) * (lateral + wobble),
    y: p.y + Math.cos(heading) * (lateral + wobble),
    heading,
  };
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  // Faint guide of the shared flow.
  c.strokeStyle = "#22343F";
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i <= 120; i++) {
    const p = path(i / 120);
    if (i) c.lineTo(p.x, p.y);
    else c.moveTo(p.x, p.y);
  }
  c.stroke();
  for (let row = ROWS - 1; row >= 0; row--)
    for (let lane = 0; lane < LANES; lane++) {
      const a = agent(row, lane, t);
      const leader = row === 0 && lane === (LANES - 1) / 2;
      c.save();
      c.translate(a.x, a.y);
      c.rotate(a.heading);
      c.fillStyle = leader ? accent : row % 4 === 0 ? accent : ink;
      c.beginPath();
      c.moveTo(6, 0);
      c.lineTo(-4, -3.2);
      c.lineTo(-2, 0);
      c.lineTo(-4, 3.2);
      c.closePath();
      c.fill();
      c.restore();
    }
  text("COLLECTIVE FLOW", 320, 40, 20, ink);
  text(`${ROWS * LANES} agents · one shared current`, 320, 336, 14, "#9FB0BC");
}
