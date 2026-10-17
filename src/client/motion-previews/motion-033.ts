import { ink, accent, warm, dark, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Build Assembly.
 * A dashed blueprint marks where every part goes. Parts then arrive in construction
 * order along their real axes: the slab slides in horizontally, walls grow upward
 * from the slab, the roof descends and lands, the door and window slot in, and the
 * chimney drops onto the roof. Contacts flash a brief tick; the label comes last.
 */

const GROUND = 276;
const SLAB = { x: 200, y: GROUND - 16, w: 240, h: 16 };
const WALLS = { x: 216, y: 160, w: 208, h: SLAB.y - 160 };
const ROOF = { left: 196, right: 444, eave: 160, peak: 96 };
const DOOR = { x: 300, y: 196, w: 40, h: WALLS.y + WALLS.h - 196 };
const WINDOW = { x: 244, y: 184, w: 36, h: 30 };
const CHIMNEY = { x: 384, y: 92, w: 20, h: 52 };
const STAGES = {
  blueprint: [0.1, 0.7],
  slab: [0.7, 1.25],
  walls: [1.3, 2.0],
  roof: [2.05, 2.65],
  door: [2.75, 3.15],
  window: [2.95, 3.35],
  chimney: [3.4, 3.75],
  label: [3.95, 4.35],
} as const;
const stage = (t: number, key: keyof typeof STAGES) =>
  motionProgress(t, STAGES[key][0], STAGES[key][1]);
// Landing: fast approach then a 2 px settle bounce at contact.
const land = (p: number) =>
  p < 0.85 ? ease(p / 0.85) : 1 + Math.sin(((p - 0.85) / 0.15) * Math.PI) * 0.04;

function contactTick(
  c: CanvasRenderingContext2D,
  t: number,
  at: number,
  x: number,
  y: number,
  w: number,
) {
  const k = clamp((t - at) / 0.3);
  if (k <= 0 || k >= 1) return;
  c.strokeStyle = ink;
  c.globalAlpha = 1 - k;
  c.lineWidth = 2;
  for (const side of [-1, 1]) {
    const ex = side < 0 ? x : x + w;
    c.beginPath();
    c.moveTo(ex + side * 4, y);
    c.lineTo(ex + side * (12 + k * 10), y - 6 - k * 6);
    c.stroke();
  }
  c.globalAlpha = 1;
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  c.fillStyle = "#22343F";
  c.fillRect(60, GROUND, 520, 3);

  // Blueprint outline draws first and stays as the plan underneath.
  const plan = stage(t, "blueprint");
  if (plan > 0) {
    c.save();
    c.setLineDash([6, 6]);
    c.strokeStyle = "#4E7A9A";
    c.lineWidth = 2;
    c.globalAlpha = plan;
    c.strokeRect(WALLS.x, WALLS.y, WALLS.w, WALLS.h);
    c.beginPath();
    c.moveTo(ROOF.left, ROOF.eave);
    c.lineTo(320, ROOF.peak);
    c.lineTo(ROOF.right, ROOF.eave);
    c.stroke();
    c.restore();
  }

  // Slab slides in along the ground axis.
  const slab = stage(t, "slab");
  if (slab > 0) {
    c.fillStyle = "#566A7C";
    c.fillRect(SLAB.x - (1 - ease(slab)) * 260, SLAB.y, SLAB.w, SLAB.h);
  }
  contactTick(c, t, STAGES.slab[1], SLAB.x, GROUND, SLAB.w);
  // Walls grow upward from the slab (rising construction, anchored at the base).
  const walls = stage(t, "walls");
  if (walls > 0) {
    const h = WALLS.h * walls;
    c.fillStyle = ink;
    c.fillRect(WALLS.x, WALLS.y + WALLS.h - h, WALLS.w, h);
    c.fillStyle = "#C9D6DE";
    for (let row = 0; row * 12 < h; row++)
      c.fillRect(WALLS.x, WALLS.y + WALLS.h - row * 12 - 1, WALLS.w, 1);
  }
  // Openings are cut once the walls are up; door and window slide/slot into them.
  const door = stage(t, "door"),
    windowIn = stage(t, "window");
  if (walls >= 1) {
    c.fillStyle = "#0E1A22";
    c.fillRect(DOOR.x, DOOR.y, DOOR.w, DOOR.h);
    c.fillRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
  }
  if (door > 0) {
    c.fillStyle = warm;
    c.fillRect(DOOR.x + (1 - ease(door)) * 70, DOOR.y, DOOR.w, DOOR.h);
  }
  if (windowIn > 0) {
    const s = ease(windowIn);
    c.fillStyle = accent;
    c.fillRect(
      WINDOW.x + (WINDOW.w * (1 - s)) / 2,
      WINDOW.y + (WINDOW.h * (1 - s)) / 2,
      WINDOW.w * s,
      WINDOW.h * s,
    );
  }
  // Chimney drops behind the roof plane, so the roof slope hides its base on landing.
  const chimney = stage(t, "chimney");
  if (chimney > 0) {
    c.fillStyle = "#9FB0BC";
    c.fillRect(CHIMNEY.x, CHIMNEY.y - (1 - land(chimney)) * 90, CHIMNEY.w, CHIMNEY.h);
  }
  // Roof descends vertically and lands on the wall tops.
  const roof = stage(t, "roof");
  if (roof > 0) {
    const drop = (1 - land(roof)) * 120;
    c.fillStyle = dark;
    c.strokeStyle = warm;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(ROOF.left, ROOF.eave - drop);
    c.lineTo(320, ROOF.peak - drop);
    c.lineTo(ROOF.right, ROOF.eave - drop);
    c.closePath();
    c.fill();
    c.stroke();
  }
  contactTick(c, t, STAGES.roof[1] - 0.08, WALLS.x, WALLS.y, WALLS.w);

  const label = stage(t, "label");
  if (label > 0) {
    c.globalAlpha = label;
    c.fillStyle = accent;
    c.beginPath();
    c.roundRect(250, 296, 140, 34, 17);
    c.fill();
    text("ASSEMBLED", 320, 319, 18, dark);
    c.globalAlpha = 1;
  }
  text("PLAN · SLAB · WALLS · ROOF · FIT-OUT", 320, 44, 15, "#9FB0BC");
}
