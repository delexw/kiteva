import { ink, accent, warm, dark, motionDrawing } from "./drawing";

/**
 * Travel Loop.
 * Ground speed, wheel spin and pedalling share one kinematic chain: the wheel turns by
 * distance / radius (no slip), the crank turns at a fixed gear ratio, and the legs are
 * solved with two-bone IK onto the pedals. Scenery layers move at 1×, ½× and ⅕×.
 * Every period divides the 6 s clip, so the loop closes exactly.
 */

const LOOP = 6;
const SPEED = 160; // px / s of ground travel
const DASH = 80; // ground pattern period (960 px per loop = 12 dashes)
const WHEEL_R = (SPEED * LOOP) / (5 * Math.PI * 2); // exactly 5 wheel turns per loop
const GEAR = 2.5; // wheel turns per crank turn → 2 crank turns per loop
const CRANK_R = 13;
const THIGH = 46,
  SHIN = 46;
const REAR = { x: 250, y: 262 },
  FRONT = { x: 372, y: 262 };
const BB = { x: 304, y: 268 };
const GROUND_Y = REAR.y + WHEEL_R;
const wrap = (value: number, period: number) => ((value % period) + period) % period;

type P = { x: number; y: number };
function knee(hip: P, foot: P): P {
  const dx = foot.x - hip.x,
    dy = foot.y - hip.y;
  const d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.5);
  const base = Math.atan2(dy, dx);
  const bend = Math.acos((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d));
  // Choose the solution with the knee in front of the rider.
  const a = { x: hip.x + Math.cos(base - bend) * THIGH, y: hip.y + Math.sin(base - bend) * THIGH };
  const b = { x: hip.x + Math.cos(base + bend) * THIGH, y: hip.y + Math.sin(base + bend) * THIGH };
  return a.x > b.x ? a : b;
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, line, text } = motionDrawing(c);
  const distance = SPEED * t;
  const wheelAngle = distance / WHEEL_R;
  const crank = wheelAngle / GEAR;
  const bob = Math.sin(crank * 2) * 1.6;

  // Sun is effectively at infinity: it does not move.
  circle(520, 82, 26, "#FFD27A");
  // Hills at ⅕ speed (period 192 px), trees at ½ speed (spacing 160 px).
  const hillShift = wrap(distance * 0.2, 192);
  c.fillStyle = "#1F3A48";
  c.beginPath();
  c.moveTo(0, 230);
  for (let x = 0; x <= 640; x += 8) {
    const u = ((x + hillShift) / 192) * Math.PI * 2;
    c.lineTo(x, 196 - Math.sin(u) * 18 - Math.sin(u * 2 + 1) * 8);
  }
  c.lineTo(640, 230);
  c.closePath();
  c.fill();
  const treeShift = wrap(distance * 0.5, 160);
  for (let i = -1; i < 6; i++) {
    const x = i * 160 - treeShift + 60;
    c.fillStyle = "#2F6E5A";
    c.beginPath();
    c.moveTo(x, 172);
    c.lineTo(x + 22, 236);
    c.lineTo(x - 22, 236);
    c.closePath();
    c.fill();
    line(x, 236, x, 246, "#5A4636", 5);
  }
  // Road at 1× speed: dashes move exactly with the tyre contact point.
  c.fillStyle = "#16252F";
  c.fillRect(0, GROUND_Y, 640, 360 - GROUND_Y);
  const dashShift = wrap(distance, DASH);
  for (let i = -1; i < 10; i++)
    line(i * DASH - dashShift, GROUND_Y + 22, i * DASH - dashShift + 40, GROUND_Y + 22, warm, 4);

  const hip = { x: 292, y: 214 + bob };
  const pedal = (offset: number) => ({
    x: BB.x + Math.cos(crank + offset) * CRANK_R,
    y: BB.y + Math.sin(crank + offset) * CRANK_R,
  });
  const leg = (offset: number, color: string, width: number) => {
    const foot = pedal(offset);
    const k = knee(hip, foot);
    line(hip.x, hip.y, k.x, k.y, color, width);
    line(k.x, k.y, foot.x, foot.y, color, width - 1);
    line(foot.x - 7, foot.y, foot.x + 7, foot.y, color, 4);
  };
  // Far leg behind the frame.
  leg(Math.PI, "#7F93A1", 7);
  // Wheels with rotating spokes (5 turns per loop).
  for (const hub of [REAR, FRONT]) {
    circle(hub.x, hub.y, WHEEL_R + 3, ink);
    circle(hub.x, hub.y, WHEEL_R - 2, dark);
    for (let s = 0; s < 6; s++) {
      const a = wheelAngle + (s * Math.PI) / 3;
      line(
        hub.x,
        hub.y,
        hub.x + Math.cos(a) * (WHEEL_R - 3),
        hub.y + Math.sin(a) * (WHEEL_R - 3),
        "#7F93A1",
        1.5,
      );
    }
    circle(hub.x, hub.y, 3, ink);
  }
  // Frame.
  const seat = { x: 290, y: 222 },
    head = { x: 356, y: 220 };
  for (const [a, b] of [
    [REAR, BB],
    [BB, seat],
    [seat, REAR],
    [seat, head],
    [head, BB],
    [head, FRONT],
  ] as const)
    line(a.x, a.y, b.x, b.y, accent, 5);
  line(head.x, head.y, head.x - 2, head.y - 14, accent, 4);
  line(head.x - 8, head.y - 14, head.x + 10, head.y - 14, ink, 4);
  line(seat.x - 12, seat.y - 4, seat.x + 8, seat.y - 4, ink, 5);
  // Crank arm and chainring.
  circle(BB.x, BB.y, 8, "#9FB0BC");
  const near = pedal(0);
  line(BB.x, BB.y, near.x, near.y, ink, 3);
  // Rider torso, head and arm, bobbing with the pedal stroke.
  const shoulder = { x: 324, y: 166 + bob };
  line(hip.x, hip.y, shoulder.x, shoulder.y, warm, 10);
  circle(338, 146 + bob, 14, "#F4D3BC");
  line(shoulder.x, shoulder.y, head.x + 4, head.y - 14, warm, 6);
  // Near leg in front of the frame.
  leg(0, ink, 8);

  text("ground 1× · trees ½× · hills ⅕×", 320, 338, 14, "#9FB0BC");
}
