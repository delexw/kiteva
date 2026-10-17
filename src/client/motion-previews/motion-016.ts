import { dark, warm, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Cinematic Manga Opening.
 * Panel borders ink in first, then narrative beats: the eye opens under focus lines,
 * "ZAP!" punches in on the action beat, a comet streaks into the second panel and
 * stops with an impact ring, and finally a speech bubble forms before its line appears.
 */

const PAPER = "#F2F5F7";
const PANELS = [
  { x: 34, y: 34, w: 262, h: 292, at: 0.0 },
  { x: 310, y: 34, w: 296, h: 140, at: 0.12 },
  { x: 310, y: 188, w: 296, h: 138, at: 0.24 },
];

function inkBorder(
  c: CanvasRenderingContext2D,
  p: { x: number; y: number; w: number; h: number },
  progress: number,
) {
  // Stroke reveal of an unfilled border path, clockwise from the top-left corner.
  const perimeter = 2 * (p.w + p.h);
  c.setLineDash([perimeter, perimeter]);
  c.lineDashOffset = perimeter * (1 - progress);
  c.strokeStyle = dark;
  c.lineWidth = 4;
  c.strokeRect(p.x, p.y, p.w, p.h);
  c.setLineDash([]);
  c.lineDashOffset = 0;
}

function starburst(c: CanvasRenderingContext2D, x: number, y: number, r: number, spikes: number) {
  c.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.62 : r;
    const px = x + Math.cos(a) * rr,
      py = y + Math.sin(a) * rr * 0.72;
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  c.closePath();
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  c.fillStyle = PAPER;
  c.fillRect(20, 20, 600, 320);
  const [left, top, bottom] = PANELS;

  // Beat 1 — the eye opens inside the left panel under radial focus lines.
  const open = motionProgress(t, 0.45, 1.05);
  const focusLines = motionProgress(t, 0.95, 1.4);
  const eye = { x: 165, y: 214 };
  c.save();
  c.beginPath();
  c.rect(left!.x, left!.y, left!.w, left!.h);
  c.clip();
  // Screentone dots: printed texture of the panel background.
  for (let row = 0; row < 20; row++)
    for (let col = 0; col < 18; col++)
      circle(left!.x + 8 + col * 15 + (row % 2) * 7, left!.y + 8 + row * 15, 1.6, "#C9D3DA");
  if (focusLines > 0) {
    c.strokeStyle = dark;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const inner = 150 - focusLines * 50;
      c.lineWidth = 1 + (i % 3);
      c.beginPath();
      c.moveTo(eye.x + Math.cos(a) * 240, eye.y + Math.sin(a) * 240);
      c.lineTo(eye.x + Math.cos(a) * inner, eye.y + Math.sin(a) * inner);
      c.stroke();
    }
  }
  if (open > 0) {
    c.fillStyle = PAPER;
    c.beginPath();
    c.ellipse(eye.x, eye.y, 86, 42 * open, 0, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.clip();
    circle(eye.x + 4, eye.y, 32, dark);
    circle(eye.x + 15, eye.y - 11, 9, PAPER);
    c.restore();
    c.strokeStyle = dark;
    c.lineWidth = 5;
    c.beginPath();
    c.ellipse(eye.x, eye.y, 86, 42 * open, 0, 0, Math.PI * 2);
    c.stroke();
  } else {
    c.strokeStyle = dark;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(eye.x - 86, eye.y);
    c.quadraticCurveTo(eye.x, eye.y + 18, eye.x + 86, eye.y);
    c.stroke();
  }
  c.restore();

  // Beat 2 — sound effect punches in on the eye-opening action beat.
  const punch = motionProgress(t, 1.3, 1.62);
  if (punch > 0) {
    const settle = motionProgress(t, 1.62, 1.95);
    const scale = 0.4 + punch * 1.0 - settle * 0.15;
    c.save();
    c.translate(165, 98);
    c.rotate(-0.12);
    c.scale(scale, scale);
    c.fillStyle = warm;
    starburst(c, 0, 0, 72, 10);
    c.fill();
    c.strokeStyle = dark;
    c.lineWidth = 4;
    c.stroke();
    c.lineWidth = 8;
    c.font = "900 46px sans-serif";
    c.textAlign = "center";
    c.strokeStyle = PAPER;
    c.strokeText("ZAP!", 0, 16);
    c.fillStyle = dark;
    c.fillText("ZAP!", 0, 16);
    c.restore();
  }

  // Beat 3 — a comet streaks into the top-right panel and stops with an impact ring.
  const streak = motionProgress(t, 2.0, 2.55);
  const impact = motionProgress(t, 2.5, 3.0);
  c.save();
  c.beginPath();
  c.rect(top!.x, top!.y, top!.w, top!.h);
  c.clip();
  if (streak > 0) {
    const cx = top!.x + top!.w + 40 - streak * 200,
      cy = top!.y + 76;
    c.strokeStyle = dark;
    for (let i = 0; i < 7; i++) {
      c.lineWidth = 2 + (i % 2);
      const y = cy - 30 + i * 10;
      const length = (1 - impact) * 150 + 30;
      c.beginPath();
      c.moveTo(cx + 26, y);
      c.lineTo(cx + 26 + length, y);
      c.stroke();
    }
    if (impact > 0 && impact < 1) {
      c.lineWidth = 3;
      c.globalAlpha = 1 - impact;
      c.beginPath();
      c.arc(cx, cy, 26 + impact * 46, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }
    circle(cx, cy, 24, dark);
    circle(cx - 7, cy - 8, 7, PAPER);
  }
  c.restore();

  // Beat 4 — the bubble forms, then its dialogue (labels wait for their container).
  const bubble = motionProgress(t, 3.3, 3.75);
  if (bubble > 0) {
    const b = { x: bottom!.x + bottom!.w / 2 + 20, y: bottom!.y + 64 };
    c.save();
    c.translate(b.x, b.y);
    c.scale(0.6 + 0.4 * ease(bubble), 0.6 + 0.4 * ease(bubble));
    c.globalAlpha = clamp(bubble * 2);
    c.fillStyle = "#FFFFFF";
    c.strokeStyle = dark;
    c.lineWidth = 6; // half is hidden by the fill: a clean outline around body + tail
    c.beginPath();
    c.ellipse(0, 0, 118, 48, 0, 0, Math.PI * 2);
    c.moveTo(-70, 30);
    c.lineTo(-108, 60);
    c.lineTo(-44, 40);
    c.closePath();
    c.stroke();
    c.fill();
    c.restore();
  }
  const dialogue = motionProgress(t, 3.8, 4.15);
  if (dialogue > 0) {
    c.globalAlpha = dialogue;
    text("IT ALL", bottom!.x + bottom!.w / 2 + 20, bottom!.y + 58, 22, dark);
    text("CONNECTS!", bottom!.x + bottom!.w / 2 + 20, bottom!.y + 86, 22, dark);
    c.globalAlpha = 1;
  }

  // Borders are inked last so every beat sits inside a crisp frame.
  PANELS.forEach((panel) => inkBorder(c, panel, motionProgress(t, panel.at, panel.at + 0.45)));
}
