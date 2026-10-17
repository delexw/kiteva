import { ink, accent, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Cursor-Driven Luminous Flow.
 * A luminous doorway is the fixed focal destination on a horizon. The scene advances
 * slowly toward the viewer (depth-weighted scale about the doorway), mist rises from
 * the ground on a closed loop, and an authored pointer path adds bounded parallax.
 */

const HORIZON_Y = 208;
const DOOR_X = 320,
  DOOR_BASE = 236;

// Authored pointer path in normalised units (-1…1). Neutral at both ends.
function pointer(t: number) {
  const active = motionProgress(t, 1.2, 1.8) * (1 - motionProgress(t, 4.8, 5.5));
  const phase = clamp((t - 1.2) / 3.6) * Math.PI * 2;
  return { x: Math.sin(phase) * active, y: Math.sin(phase * 2) * 0.5 * active, active };
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  const advance = ease(t / 6); // slow, continuous approach
  const ptr = pointer(t);
  // depth: 0 = horizon (doorway plane), 1 = nearest foreground.
  const layer = (depth: number, draw: () => void) => {
    const scale = 1 + advance * (0.12 + depth * 0.5);
    c.save();
    c.translate(DOOR_X - ptr.x * depth * 26, DOOR_BASE - ptr.y * depth * 12);
    c.scale(scale, scale);
    c.translate(-DOOR_X, -DOOR_BASE);
    draw();
    c.restore();
  };

  c.save();
  c.beginPath();
  c.rect(0, 0, 640, 360);
  c.clip();
  // Sky bands (flat treatment, no gradients) brighten toward the horizon glow.
  const sky = ["#0D1A24", "#112230", "#152B3A", "#1A3446", "#203E52"];
  sky.forEach((color, i) => {
    c.fillStyle = color;
    c.fillRect(0, i * 44, 640, 45);
  });
  // Far ridges barely move; they anchor the horizon.
  layer(0.08, () => {
    c.fillStyle = "#1B3141";
    c.beginPath();
    c.moveTo(-200, HORIZON_Y);
    for (let x = -200; x <= 840; x += 40)
      c.lineTo(x, HORIZON_Y - 28 - Math.abs(Math.sin(x * 0.013)) * 34);
    c.lineTo(840, HORIZON_Y + 4);
    c.lineTo(-200, HORIZON_Y + 4);
    c.closePath();
    c.fill();
  });
  // Ground plane with converging guide lines toward the door.
  layer(0.35, () => {
    c.fillStyle = "#132430";
    c.fillRect(-300, HORIZON_Y, 1240, 400);
    c.strokeStyle = "#24404F";
    c.lineWidth = 1.5;
    for (let i = -7; i <= 7; i++) {
      c.beginPath();
      c.moveTo(DOOR_X + i * 14, HORIZON_Y + 8);
      c.lineTo(DOOR_X + i * 140, 420);
      c.stroke();
    }
    // Light spill from the doorway onto the ground.
    c.fillStyle = "rgba(120, 222, 200, 0.16)";
    c.beginPath();
    c.moveTo(DOOR_X - 26, DOOR_BASE);
    c.lineTo(DOOR_X + 26, DOOR_BASE);
    c.lineTo(DOOR_X + 120, 380);
    c.lineTo(DOOR_X - 120, 380);
    c.closePath();
    c.fill();
  });
  // The doorway: stable focal destination with a restrained glow.
  layer(0.15, () => {
    c.save();
    c.shadowColor = accent;
    c.shadowBlur = 30;
    c.fillStyle = "#BFF5E8";
    c.beginPath();
    c.roundRect(DOOR_X - 26, DOOR_BASE - 92, 52, 92, [26, 26, 0, 0]);
    c.fill();
    c.restore();
    c.strokeStyle = accent;
    c.lineWidth = 5;
    c.beginPath();
    c.roundRect(DOOR_X - 33, DOOR_BASE - 99, 66, 99, [33, 33, 0, 0]);
    c.stroke();
  });
  // Rising mist: each puff loops from ground to dissolution; seeks need no history.
  for (let i = 0; i < 9; i++) {
    const depth = 0.3 + (i % 3) * 0.25;
    const cycle = (((t * 0.22 + i * 0.37) % 1) + 1) % 1;
    layer(depth, () => {
      c.globalAlpha = 0.16 * Math.sin(cycle * Math.PI);
      c.fillStyle = ink;
      c.beginPath();
      c.ellipse(
        80 + ((i * 173) % 480),
        330 - cycle * 110,
        70 + cycle * 30,
        12 + cycle * 6,
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.globalAlpha = 1;
    });
  }
  // Foreground stones move most, revealing depth against the doorway.
  layer(1, () => {
    c.fillStyle = "#0A141B";
    for (const [x, w, h] of [
      [70, 120, 46],
      [560, 150, 60],
      [250, 70, 22],
    ] as [number, number, number][]) {
      c.beginPath();
      c.ellipse(x, 352, w, h, 0, Math.PI, Math.PI * 2);
      c.fill();
    }
  });
  c.restore();

  // Optional authored pointer marker, visible only while it drives the parallax.
  if (ptr.active > 0.05) {
    c.globalAlpha = ptr.active;
    c.strokeStyle = ink;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(320 + ptr.x * 200, 180 + ptr.y * 90, 9, 0, Math.PI * 2);
    c.stroke();
    circle(320 + ptr.x * 200, 180 + ptr.y * 90, 2.5, ink);
    c.globalAlpha = 1;
  }
  text("THE THRESHOLD", 320, 40, 18, ink);
}
