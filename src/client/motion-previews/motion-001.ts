import { ink, accent, warm, dark, clamp, ease, motionDrawing } from "./drawing";

/**
 * Hover-Triggered Door Bloom.
 * One reversible progress value drives both the hinge and the bloom. The authored
 * hover schedule includes an interrupted opening (hover leaves at 55 % and returns),
 * so the reversal is shown continuing from the current pose rather than resetting.
 */

// [time, progress] keys of the authored hover session. Each segment eases, so turning
// points have zero velocity, exactly like a timeline reversing from where it is.
const HOVER_KEYS: [number, number][] = [
  [0, 0],
  [0.7, 0], // cursor arrives: closed door held
  [1.6, 0.55], // hover: opening + first blossoms
  [2.2, 0.25], // pointer slips out: both actions retrace from 0.55
  [3.3, 1], // pointer returns: full open and bloom
  [4.3, 1], // hold while hover stays active
  [5.4, 0], // exit: flowers withdraw, then the door closes
  [6, 0],
];
// Authored pointer path; hover state is derived from it so cursor and door agree.
const POINTER_KEYS: [number, number][] = [
  [0, 560],
  [0.65, 352],
  [1.5, 352],
  [1.75, 440],
  [2.05, 440],
  [2.25, 352],
  [4.2, 352],
  [4.5, 520],
  [6, 520],
];
const HOVER_RIGHT_EDGE = 394;

function keyed(keys: [number, number][], t: number) {
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]!;
    const [t0, v0] = keys[i - 1]!;
    if (t <= t1) return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1]![1];
}

const DOOR = { x: 260, top: 86, bottom: 296, width: 120 };
// Each blossom: final offset from the doorway centre, size and stagger inside the bloom.
const FLOWERS = [
  { dx: -70, dy: -40, size: 0.9, delay: 0.0 },
  { dx: 86, dy: -62, size: 1.0, delay: 0.08 },
  { dx: 112, dy: 14, size: 0.8, delay: 0.16 },
  { dx: -108, dy: 30, size: 0.75, delay: 0.24 },
  { dx: 30, dy: -92, size: 0.85, delay: 0.3 },
  { dx: 60, dy: 70, size: 0.9, delay: 0.36 },
  { dx: -40, dy: 78, size: 0.7, delay: 0.42 },
];

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text, cursor, flower } = motionDrawing(c);
  const p = keyed(HOVER_KEYS, t);
  // The hinge leads; the bloom follows inside the same progress so reversal is shared.
  const hinge = clamp(p / 0.7);
  const bloom = clamp((p - 0.18) / 0.82);
  const centerX = DOOR.x + DOOR.width / 2,
    centerY = (DOOR.top + DOOR.bottom) / 2 + 20;

  // Wall and floor that hold the opening.
  c.fillStyle = "#1F3340";
  c.fillRect(60, 40, 520, 270);
  c.fillStyle = "#2A4352";
  c.fillRect(60, 296, 520, 14);
  // Doorway interior: dark room with warm light that grows as the door opens.
  c.fillStyle = "#081016";
  c.fillRect(DOOR.x, DOOR.top, DOOR.width, DOOR.bottom - DOOR.top);
  c.globalAlpha = 0.5 * hinge;
  c.fillStyle = warm;
  c.beginPath();
  c.ellipse(centerX, DOOR.bottom - 10, 50, 14, 0, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;

  // Flowers start inside the opening; stems stay rooted at the threshold.
  for (const f of FLOWERS) {
    const local = ease((bloom - f.delay) / (1 - f.delay * 0.9));
    if (local <= 0) continue;
    const x = centerX + f.dx * local,
      y = centerY + f.dy * local;
    c.strokeStyle = accent;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(centerX + f.dx * 0.15, DOOR.bottom);
    c.quadraticCurveTo(centerX + f.dx * 0.4, centerY + 30, x, y);
    c.stroke();
    flower(x, y, f.size * (0.35 + 0.65 * local));
  }

  // The door is hinged on its left edge and swings toward the viewer, so its free edge
  // foreshortens toward the hinge and grows slightly taller in perspective.
  const angle = hinge * 1.35;
  const freeX = DOOR.x + DOOR.width * Math.cos(angle);
  const lift = Math.sin(angle) * 16;
  c.fillStyle = ink;
  c.beginPath();
  c.moveTo(DOOR.x, DOOR.top);
  c.lineTo(freeX, DOOR.top - lift);
  c.lineTo(freeX, DOOR.bottom + lift);
  c.lineTo(DOOR.x, DOOR.bottom);
  c.closePath();
  c.fill();
  // The turned door face receives less light; shading follows the hinge angle.
  c.fillStyle = `rgba(20, 33, 43, ${0.28 * Math.sin(angle)})`;
  c.fill();
  c.strokeStyle = dark;
  c.lineWidth = 2;
  c.stroke();
  // Two inset panels and the knob ride the same foreshortened door plane.
  const along = (u: number) => DOOR.x + (freeX - DOOR.x) * u;
  for (const [v0, v1] of [
    [0.1, 0.45],
    [0.55, 0.9],
  ]) {
    c.beginPath();
    for (const [u, v] of [
      [0.18, v0],
      [0.82, v0],
      [0.82, v1],
      [0.18, v1],
    ] as [number, number][]) {
      const h = DOOR.bottom - DOOR.top + lift * 2 * u;
      const y = DOOR.top - lift * u + h * v;
      c.lineTo(along(u), y);
    }
    c.closePath();
    c.stroke();
  }
  circle(along(0.86), (DOOR.top + DOOR.bottom) / 2 + 4, 5, dark);

  // Authored pointer: hover zone outline and the pointer itself.
  const pointerX = keyed(POINTER_KEYS, t),
    pointerY = 232 + (pointerX - 352) * 0.12;
  const inside = pointerX < HOVER_RIGHT_EDGE;
  c.setLineDash([6, 6]);
  c.strokeStyle = inside ? accent : "#3D5666";
  c.lineWidth = 2;
  c.strokeRect(DOOR.x - 14, DOOR.top - 14, DOOR.width + 28, DOOR.bottom - DOOR.top + 28);
  c.setLineDash([]);
  cursor(pointerX, pointerY);

  const phase = inside
    ? p >= 0.999
      ? "HOVER · OPEN AND BLOOMING"
      : "HOVER · OPENING"
    : p > 0.001
      ? "EXIT · REVERSING FROM CURRENT POSE"
      : "CLOSED · WAITING FOR HOVER";
  text(phase, 320, 338, 16, inside ? accent : ink);
}
