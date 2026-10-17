import { ink, accent, warm, clamp, ease, motionDrawing } from "./drawing";

/**
 * Cursor Wipe.
 * One block object throughout: it is the typing cursor beside "CREATE", grows into a
 * full-stage occluder, hides the scene swap, then collapses back into a cursor at the
 * end of the incoming headline. Glitch accents appear only while the block is moving
 * and are gone before the reading hold.
 */

const TYPED = "CREATE";
const MONO = 44,
  ADVANCE = MONO * 0.6;
const TYPE_X = 320 - (TYPED.length * ADVANCE) / 2;
const BASELINE = 193;
const TYPE = { start: 0.35, step: 0.19 };
const EXPAND = { start: 1.8, end: 2.55 };
const SWAP = 2.7; // scenes change only while the block covers everything
const COLLAPSE = { start: 2.95, end: 3.55 };
const CURSOR_H = 46;
const INCOMING_CURSOR_X = 456; // just past the right edge of "TAKE FLIGHT"

type Rect = { x: number; y: number; w: number; h: number };
const FULL: Rect = { x: 0, y: 0, w: 640, h: 360 };
const lerpRect = (a: Rect, b: Rect, p: number): Rect =>
  p >= 1
    ? b
    : {
        x: a.x + (b.x - a.x) * p,
        y: a.y + (b.y - a.y) * p,
        w: a.w + (b.w - a.w) * p,
        h: a.h + (b.h - a.h) * p,
      };

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  const typedCount = Math.max(
    0,
    Math.min(TYPED.length, Math.floor((t - TYPE.start) / TYPE.step) + 1),
  );
  const typingCursor: Rect = {
    x: TYPE_X + typedCount * ADVANCE + 4,
    y: BASELINE - 37,
    w: 16,
    h: CURSOR_H,
  };
  const landingCursor: Rect = { x: INCOMING_CURSOR_X, y: BASELINE - 37, w: 16, h: CURSOR_H };
  const expand = ease((t - EXPAND.start) / (EXPAND.end - EXPAND.start));
  const collapse = ease((t - COLLAPSE.start) / (COLLAPSE.end - COLLAPSE.start));

  if (t < SWAP) {
    // Outgoing scene: the typed word on the studio slate.
    c.fillStyle = "#22343F";
    c.fillRect(40, 236, 560, 2);
    text("STUDIO NOTES", 320, 90, 14, "#7F93A1");
    c.font = `700 ${MONO}px monospace`;
    c.textAlign = "left";
    c.fillStyle = ink;
    for (let i = 0; i < typedCount && t >= TYPE.start; i++)
      c.fillText(TYPED[i]!, TYPE_X + i * ADVANCE, BASELINE);
  } else {
    // Incoming scene, already complete when the block starts to clear.
    c.fillStyle = "#0F3A3C";
    c.fillRect(0, 0, 640, 360);
    circle(520, 250, 40, "#FFB27A");
    c.fillStyle = "#0A2A2C";
    c.fillRect(0, 250, 640, 110);
    text("TAKE FLIGHT", 320, 193, 40, ink);
    text("chapter two begins", 320, 226, 15, accent);
  }

  // The block: cursor → occluder → cursor.
  let block: Rect;
  if (t < EXPAND.start) block = typingCursor;
  else if (t < COLLAPSE.start) block = lerpRect(typingCursor, FULL, expand);
  else block = lerpRect(FULL, landingCursor, collapse);
  const blinking = t < TYPE.start || t > COLLAPSE.end + 0.2;
  const on = !blinking || Math.floor(t / 0.45) % 2 === 0;
  const fade = 1 - clamp((t - 4.6) / 0.4); // the cursor bows out after the reading hold begins
  if (on && fade > 0) {
    c.globalAlpha = fade;
    c.fillStyle = warm;
    c.fillRect(block.x, block.y, block.w, block.h);
    c.globalAlpha = 1;
  }
  // Brief glitch slivers trail the block edges only while it is in motion.
  const moving = (expand > 0 && expand < 1) || (collapse > 0 && collapse < 1);
  if (moving) {
    const frame = Math.floor(t * 20);
    for (let i = 0; i < 3; i++) {
      const y = block.y + ((frame * 37 + i * 53) % Math.max(8, block.h - 6));
      const offset = ((frame + i) % 2 ? 1 : -1) * (6 + ((frame * 13 + i * 7) % 14));
      c.fillStyle = i % 2 ? accent : warm;
      c.fillRect(block.x + (offset > 0 ? block.w : offset), y, Math.abs(offset), 3);
    }
  }
}
