import { ink, accent, warm, dark, clamp, motionDrawing } from "./drawing";

/**
 * Scroll-Driven Glitch Cut.
 * Two clean, readable chapter scenes. Only inside a narrow scroll window do ten
 * horizontal slices offset and swap scene ownership (with a red/cyan channel echo on
 * the headline). Offsets step in discrete glitch frames, are bounded, and fall to zero
 * at both window edges, so the endpoints contain no clipping and no distortion.
 */

const WINDOW = { start: 1.9, end: 2.9 };
const SLICES = 10;
const STAGE = { x: 25, y: 65, w: 590, h: 220 };
const SLICE_H = STAGE.h / SLICES;

function scene(c: CanvasRenderingContext2D, incoming: boolean, echo = 0) {
  const { circle, text } = motionDrawing(c);
  c.fillStyle = incoming ? warm : ink;
  c.fillRect(STAGE.x, STAGE.y, STAGE.w, STAGE.h);
  if (incoming)
    for (let i = 0; i < 9; i++) {
      c.fillStyle = "rgba(20, 33, 43, 0.12)";
      c.fillRect(STAGE.x + i * 70, STAGE.y, 26, STAGE.h);
    }
  else for (let i = 0; i < 12; i++) circle(STAGE.x + 30 + i * 48, STAGE.y + 22, 3, "#B6C9E8");
  const title = incoming ? "IDEAS IN MOTION" : "DESIGN STUDIO";
  if (echo > 0) {
    text(title, 320 - echo, 147, 34, "#E83A20");
    text(title, 320 + echo, 147, 34, "#1FB9C9");
  }
  text(title, 320, 147, 34, dark);
  text(incoming ? "CHAPTER 02" : "CHAPTER 01", 320, 195, 18, dark);
  for (let i = 0; i < 4; i++) circle(250 + i * 45, 240, 10, incoming ? dark : accent);
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  const p = clamp((t - WINDOW.start) / (WINDOW.end - WINDOW.start));
  const inCut = p > 0 && p < 1;
  // Clean endpoints: whichever scene owns the frame outside the window.
  scene(c, p >= 0.5);
  if (inCut) {
    const frame = Math.floor(p * 12); // discrete glitch frames, not continuous wobble
    const strength = Math.sin(p * Math.PI); // zero at both edges of the window
    for (let i = 0; i < SLICES; i++) {
      const offset = Math.sin(i * 7.3 + frame * 2.1) * 54 * strength;
      // Slices hand over to the incoming scene in a scattered order as p advances.
      const threshold = ((i * 7) % SLICES) / SLICES;
      c.save();
      c.beginPath();
      c.rect(STAGE.x, STAGE.y + i * SLICE_H, STAGE.w, SLICE_H);
      c.clip();
      c.translate(offset, 0);
      scene(c, p > threshold * 0.8 + 0.1, 6 * strength);
      c.restore();
    }
  }
  // Scroll scrubber: shows the narrow window where distortion is allowed.
  c.fillStyle = "#22343F";
  c.fillRect(120, 306, 400, 4);
  c.fillStyle = "#5C3A44";
  c.fillRect(120 + (WINDOW.start / 6) * 400, 304, ((WINDOW.end - WINDOW.start) / 6) * 400, 8);
  c.fillStyle = accent;
  c.beginPath();
  c.arc(120 + clamp(t / 6) * 400, 308, 7, 0, Math.PI * 2);
  c.fill();
  text(
    inCut ? "GLITCH WINDOW" : p >= 1 ? "CHAPTER 02 · CLEAN" : "CHAPTER 01 · CLEAN",
    320,
    336,
    14,
    inCut ? warm : ink,
  );
}
