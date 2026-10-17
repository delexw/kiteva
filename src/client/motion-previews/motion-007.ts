import { ink, accent, warm, dark, motionProgress, motionDrawing } from "./drawing";

/**
 * Scroll-Driven Pinned Hero Recomposition.
 * The hero stage frame stays pinned while the scroll thumb keeps moving. Inside it,
 * two hands part from their meeting point, a ring grows, the centred headline clears,
 * and supporting copy settles into the corners. Finally the pin releases upward.
 */

const STAGE = { x: 36, y: 34, w: 548, h: 292 };
const CX = STAGE.x + STAGE.w / 2,
  CY = STAGE.y + STAGE.h / 2 + 6;

function hand(c: CanvasRenderingContext2D, tipX: number, side: -1 | 1) {
  // A forearm reaching in from the stage edge, index finger extended toward the centre.
  const wristX = tipX + side * 58;
  c.fillStyle = side < 0 ? ink : "#F4D3BC";
  c.beginPath();
  c.roundRect(Math.min(wristX, wristX + side * 220), CY - 4, 220, 30, 15);
  c.fill();
  c.beginPath();
  c.roundRect(Math.min(tipX + side * 22, wristX + side * 4), CY - 10, 42, 40, 14);
  c.fill();
  c.beginPath();
  c.roundRect(Math.min(tipX, tipX + side * 34), CY - 10, 34, 12, 6);
  c.fill();
  c.strokeStyle = dark;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(tipX + side * 30, CY + 8);
  c.lineTo(tipX + side * 48, CY + 8);
  c.moveTo(tipX + side * 30, CY + 18);
  c.lineTo(tipX + side * 48, CY + 18);
  c.stroke();
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  const scroll = Math.min(1, Math.max(0, t / 5.6)); // the page keeps scrolling
  const part = motionProgress(t, 0.9, 2.6);
  const ring = motionProgress(t, 1.2, 3.0);
  const headline = motionProgress(t, 1.0, 1.7);
  const corners = motionProgress(t, 2.7, 3.5);
  const release = motionProgress(t, 4.9, 5.6);
  const lift = release * 70;

  // Scrollbar: the thumb moves throughout, proving the stage is pinned, not frozen.
  c.fillStyle = "#22343F";
  c.beginPath();
  c.roundRect(606, 34, 8, 292, 4);
  c.fill();
  c.fillStyle = accent;
  c.beginPath();
  c.roundRect(606, 34 + scroll * 232, 8, 60, 4);
  c.fill();

  // Next section rises into view only when the pin releases.
  c.fillStyle = "#203440";
  c.fillRect(STAGE.x, STAGE.y + STAGE.h + 12 - lift, STAGE.w, 120);
  c.save();
  c.globalAlpha = release;
  text("NEXT SECTION", CX, STAGE.y + STAGE.h + 50 - lift, 18, ink);
  c.restore();

  c.save();
  c.translate(0, -lift);
  c.beginPath();
  c.roundRect(STAGE.x, STAGE.y, STAGE.w, STAGE.h, 14);
  c.fillStyle = "#0E1A22";
  c.fill();
  c.save();
  c.clip();
  // Focal ring grows behind the hands.
  c.strokeStyle = accent;
  c.lineWidth = 10 + ring * 4;
  c.beginPath();
  c.arc(CX, CY + 4, 34 + ring * 92, 0, Math.PI * 2);
  c.stroke();
  // Hands begin fingertip to fingertip at the centre and separate outward.
  hand(c, CX - 6 - part * 104, -1);
  hand(c, CX + 6 + part * 104, 1);
  // Centred headline clears upward before the corners claim the copy.
  if (headline < 1) {
    c.globalAlpha = 1 - headline;
    text("ONE IDEA", CX, STAGE.y + 70 - headline * 18, 36, ink);
    c.globalAlpha = 1;
  }
  // Corner copy: each block slides in from its own corner and holds aligned.
  c.globalAlpha = corners;
  const slide = (1 - corners) * 24;
  c.textAlign = "left";
  c.fillStyle = accent;
  c.font = "600 13px sans-serif";
  c.fillText("01 · CONTEXT", STAGE.x + 24 - slide, STAGE.y + 36);
  c.fillStyle = ink;
  c.font = "600 18px sans-serif";
  c.fillText("Where it starts", STAGE.x + 24 - slide, STAGE.y + 60);
  c.textAlign = "right";
  c.fillStyle = warm;
  c.font = "600 13px sans-serif";
  c.fillText("02 · RESULT", STAGE.x + STAGE.w - 24 + slide, STAGE.y + STAGE.h - 46);
  c.fillStyle = ink;
  c.font = "600 18px sans-serif";
  c.fillText("Where it lands", STAGE.x + STAGE.w - 24 + slide, STAGE.y + STAGE.h - 22);
  c.globalAlpha = 1;
  c.restore();
  c.strokeStyle = "#2E4757";
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(STAGE.x, STAGE.y, STAGE.w, STAGE.h, 14);
  c.stroke();
  // Pin state badge belongs to the stage: it sits just above the frame and rides the
  // same release lift, so it can never overprint the stage's own corner copy.
  c.textAlign = "left";
  c.fillStyle = release > 0 ? "#9FB0BC" : accent;
  c.font = "600 12px sans-serif";
  c.fillText(release > 0 ? "PIN RELEASED" : "PINNED", STAGE.x, STAGE.y - 10);
  c.restore();
}
