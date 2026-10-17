import { ink, accent, warm, dark, ease, motionDrawing } from "./drawing";

/**
 * Scroll-Driven Chaptered Scene Transition.
 * One normalised scroll progress drives a diagonal mask wipe between two complete
 * chapter layers, including each chapter's copy. The authored scroll scrubs forward,
 * back a little (the wipe retraces), then forward to resolve Chapter Two.
 */

const SCROLL_KEYS: [number, number][] = [
  [0, 0],
  [1.2, 0], // read chapter one
  [2.2, 0.6], // scroll down into the handoff
  [2.7, 0.35], // scroll back up: the same wipe retraces
  [3.8, 1], // continue to chapter two
  [6, 1],
];
function scroll(t: number) {
  for (let i = 1; i < SCROLL_KEYS.length; i++) {
    const [t1, p1] = SCROLL_KEYS[i]!;
    const [t0, p0] = SCROLL_KEYS[i - 1]!;
    if (t <= t1) return p0 + (p1 - p0) * ease((t - t0) / (t1 - t0));
  }
  return 1;
}
const SLANT = 0.45;
// Wipe edge x at height y for progress p (fully off-frame at p = 0 and p = 1).
const edgeX = (p: number, y: number) => -100 + p * (740 + 360 * SLANT) - (y - 180) * SLANT;

function chapterOne(c: CanvasRenderingContext2D, shift: number) {
  const { circle } = motionDrawing(c);
  c.fillStyle = "#102231";
  c.fillRect(0, 0, 640, 360);
  for (let i = 0; i < 18; i++) circle(30 + ((i * 211) % 590), 24 + ((i * 97) % 150), 1.5, ink);
  circle(520, 78, 22, "#DCE6F5");
  c.fillStyle = "#1B3A3F";
  c.fillRect(0, 262, 640, 98);
  // A seedling: the subject of chapter one.
  c.strokeStyle = accent;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(470, 262);
  c.lineTo(470, 230);
  c.stroke();
  c.fillStyle = accent;
  c.beginPath();
  c.ellipse(459, 230, 11, 5, -0.5, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(481, 226, 11, 5, 0.5, 0, Math.PI * 2);
  c.fill();
  c.textAlign = "left";
  c.fillStyle = accent;
  c.font = "600 15px sans-serif";
  c.fillText("CHAPTER ONE", 56 - shift, 140);
  c.fillStyle = ink;
  c.font = "700 44px sans-serif";
  c.fillText("The Seed", 56 - shift, 190);
  c.font = "500 16px sans-serif";
  c.fillText("Everything starts small.", 56 - shift, 222);
}

function chapterTwo(c: CanvasRenderingContext2D, shift: number) {
  const { circle } = motionDrawing(c);
  c.fillStyle = "#F2B48A";
  c.fillRect(0, 0, 640, 360);
  circle(500, 150, 46, "#FFE3A3");
  c.fillStyle = "#6E9F6A";
  c.fillRect(0, 262, 640, 98);
  // The same plant position, now in bloom.
  c.strokeStyle = "#2F6E43";
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(470, 262);
  c.lineTo(470, 196);
  c.stroke();
  for (let i = 0; i < 6; i++)
    circle(470 + Math.cos(i * 1.047) * 13, 190 + Math.sin(i * 1.047) * 13, 10, warm);
  circle(470, 190, 8, "#FFF4D6");
  c.textAlign = "left";
  c.fillStyle = "#8A3B1E";
  c.font = "600 15px sans-serif";
  c.fillText("CHAPTER TWO", 56 + shift, 140);
  c.fillStyle = dark;
  c.font = "700 44px sans-serif";
  c.fillText("The Bloom", 56 + shift, 190);
  c.font = "500 16px sans-serif";
  c.fillText("Then it opens to the light.", 56 + shift, 222);
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const p = scroll(t);
  // Copy shares the same progress: outgoing slides left, incoming settles from the right.
  chapterOne(c, p * 40);
  if (p > 0) {
    c.save();
    c.beginPath();
    c.moveTo(-10, -10);
    c.lineTo(edgeX(p, -10), -10);
    c.lineTo(edgeX(p, 370), 370);
    c.lineTo(-10, 370);
    c.closePath();
    c.clip();
    chapterTwo(c, (1 - p) * 40);
    c.restore();
    if (p < 1) {
      c.strokeStyle = ink;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(edgeX(p, -10), -10);
      c.lineTo(edgeX(p, 370), 370);
      c.stroke();
    }
  }
  // Scroll indicator with two chapter stops.
  c.fillStyle = "rgba(20, 33, 43, 0.6)";
  c.beginPath();
  c.roundRect(590, 60, 10, 240, 5);
  c.fill();
  c.fillStyle = ink;
  c.beginPath();
  c.arc(595, 70 + p * 220, 7, 0, Math.PI * 2);
  c.fill();
}
