import { ink, accent, warm, dark, clamp, ease, motionDrawing } from "./drawing";

/**
 * Swipe Gallery Carousel (curved).
 * Image cards sit on an arc around a virtual cylinder: angle → x, depth scale, a tilt
 * that follows the arc and a slight drop at the edges. A drag moves the arc with the
 * finger, release settles on the next item, a keyboard → advances again. The caption
 * and dots update with the settled selection.
 */

type Kind = "loft" | "courtyard" | "hilltop" | "pavilion" | "cabin";
const ITEMS: { name: string; kind: Kind; color: string }[] = [
  { name: "Harbor Loft", kind: "loft", color: "#B6C9E8" },
  { name: "Courtyard House", kind: "courtyard", color: ink },
  { name: "Hilltop Studio", kind: "hilltop", color: warm },
  { name: "Garden Pavilion", kind: "pavilion", color: accent },
  { name: "Lake Cabin", kind: "cabin", color: "#F4BA73" },
];
const START_INDEX = 1; // Courtyard House is selected first
const STEP_ANGLE = 0.5; // radians between neighbours on the arc
const ARC_RADIUS = 330;

// Arc offset keys [time, selection]; the drag phase follows the finger linearly.
const KEYS: [number, number, "drag" | "settle" | "hold"][] = [
  [0, 0, "hold"],
  [0.8, 0, "hold"],
  [1.45, 0.38, "drag"],
  [2.0, 1, "settle"],
  [3.2, 1, "hold"],
  [3.85, 2, "settle"], // keyboard → press
  [6, 2, "hold"],
];
function selection(t: number) {
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, v1, mode] = KEYS[i]!;
    const [t0, v0] = KEYS[i - 1]!;
    if (t <= t1) {
      const u = clamp((t - t0) / (t1 - t0));
      return (
        v0 +
        (v1 - v0) * (mode === "drag" ? u : mode === "settle" ? 1 - Math.pow(1 - u, 3) : ease(u))
      );
    }
  }
  return 2;
}

function building(c: CanvasRenderingContext2D, kind: Kind) {
  c.fillStyle = dark;
  c.strokeStyle = dark;
  c.lineWidth = 6;
  if (kind === "courtyard") {
    c.fillRect(-72, -14, 52, 56);
    c.fillRect(20, -14, 52, 56);
    c.fillRect(-72, 26, 144, 16);
    c.fillStyle = accent;
    c.fillRect(-14, 4, 28, 22);
  } else if (kind === "hilltop") {
    c.beginPath();
    c.moveTo(-86, 46);
    c.quadraticCurveTo(0, -30, 86, 46);
    c.fill();
    c.fillRect(-30, -40, 60, 30);
    c.fillStyle = accent;
    c.fillRect(-20, -32, 40, 12);
  } else if (kind === "pavilion") {
    c.beginPath();
    c.moveTo(-80, -22);
    c.lineTo(0, -54);
    c.lineTo(80, -22);
    c.closePath();
    c.fill();
    for (let i = 0; i < 5; i++) c.fillRect(-66 + i * 32, -18, 8, 58);
    c.fillRect(-80, 38, 160, 6);
  } else if (kind === "cabin") {
    c.beginPath();
    c.moveTo(-60, -6);
    c.lineTo(-20, -46);
    c.lineTo(20, -6);
    c.closePath();
    c.fill();
    c.fillRect(-54, -6, 68, 34);
    c.fillStyle = "#5FA7D6";
    c.fillRect(-86, 32, 172, 14);
  } else {
    c.fillRect(-46, -50, 92, 96);
    c.fillStyle = accent;
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 3; k++) c.fillRect(-34 + k * 26, -40 + r * 28, 16, 16);
  }
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text, cursor } = motionDrawing(c);
  const s = selection(t);
  const selected = START_INDEX + Math.round(s);
  text("ARCHITECTURE GALLERY", 320, 40, 20, ink);

  c.save();
  c.beginPath();
  c.rect(0, 58, 640, 236);
  c.clip();
  // Depth order: farthest (largest |angle|) first so the selected card is on top.
  const placed = ITEMS.map((item, index) => {
    const angle = (index - START_INDEX - s) * STEP_ANGLE;
    return { item, angle, depth: Math.cos(angle) };
  }).sort((a, b) => a.depth - b.depth);
  for (const { item, angle, depth } of placed) {
    if (depth < 0.2) continue;
    const x = 320 + Math.sin(angle) * ARC_RADIUS;
    const y = 172 + (1 - depth) * 60;
    const scale = 0.55 + 0.45 * depth;
    c.save();
    c.translate(x, y);
    c.rotate(angle * 0.35); // tilt follows the arc tangent
    c.scale(scale * (0.75 + 0.25 * depth), scale);
    c.globalAlpha = 0.4 + 0.6 * depth;
    c.fillStyle = item.color;
    c.beginPath();
    c.roundRect(-104, -76, 208, 152, 14);
    c.fill();
    building(c, item.kind);
    c.restore();
  }
  c.restore();

  // Caption and dots change together with the settled selection.
  const settled = Math.abs(s - Math.round(s)) < 0.02;
  c.globalAlpha = settled ? 1 : 0.55;
  text(ITEMS[selected]!.name, 320, 312, 19, ink);
  c.globalAlpha = 1;
  ITEMS.forEach((_, i) => circle(288 + i * 16, 337, 5, i === selected ? accent : "#4C6172"));

  // Finger during the drag; key cap during the keyboard advance.
  if (t >= 0.7 && t <= 1.45) cursor(420 - Math.sin(s * STEP_ANGLE) * ARC_RADIUS, 250);
  const key = clamp(1 - Math.abs(t - 3.25) / 0.25);
  if (key > 0) {
    c.globalAlpha = key;
    c.fillStyle = "#2E4757";
    c.beginPath();
    c.roundRect(560, 300, 44, 36, 7);
    c.fill();
    text("→", 582, 326, 22, accent);
    c.globalAlpha = 1;
  }
}
