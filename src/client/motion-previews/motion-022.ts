import { ink, accent, warm, motionDrawing } from "./drawing";

/**
 * Terminal Typing.
 * A terminal window frames a prompt. The cursor blinks during a lead-in, then grapheme
 * clusters appear in reading order on a fixed monospace grid, with the cursor parked in
 * the next cell. Keystroke timing is authored (pauses after spaces and before the
 * final word). The completed command holds, its output prints, and the cursor blinks.
 */

const PHRASE = "Ideas take flight.";
const PROMPT = "$ ";
const FONT_SIZE = 30;
const ADVANCE = FONT_SIZE * 0.6; // monospace cell width
const ORIGIN = { x: 92, y: 186 };
const WINDOW = { x: 60, y: 92, w: 520, h: 176 };
const TYPE_START = 0.9;

// Split into grapheme clusters so joined characters are never split mid-cluster.
type GraphemeSegmenter = new (
  locale?: string,
  options?: { granularity: "grapheme" },
) => { segment(input: string): Iterable<{ segment: string }> };
function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: GraphemeSegmenter }).Segmenter;
  if (!Segmenter) return Array.from(text); // code points as a fallback
  return Array.from(
    new Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (part) => part.segment,
  );
}
const GLYPHS = graphemes(PHRASE);
// Authored keystroke times: base cadence plus pauses after spaces and before "flight".
const KEY_TIMES = GLYPHS.reduce<number[]>((times, _glyph, i) => {
  const previous = i === 0 ? TYPE_START : times[i - 1]!;
  const gap = i === 0 ? 0 : GLYPHS[i - 1] === " " ? 0.2 : 0.09 + ((i * 37) % 5) * 0.012;
  const hesitation = i === 11 ? 0.25 : 0; // beat before the last word
  times.push(previous + gap + hesitation);
  return times;
}, []);
const TYPE_END = KEY_TIMES[KEY_TIMES.length - 1]!;

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  const typed = KEY_TIMES.filter((time) => t >= time).length;

  // Window chrome.
  c.fillStyle = "#0B141A";
  c.beginPath();
  c.roundRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, 12);
  c.fill();
  c.fillStyle = "#1C2B35";
  c.beginPath();
  c.roundRect(WINDOW.x, WINDOW.y, WINDOW.w, 30, [12, 12, 0, 0]);
  c.fill();
  ["#FF6B5F", "#FFBE45", "#3FCB6A"].forEach((color, i) =>
    circle(WINDOW.x + 20 + i * 18, WINDOW.y + 15, 5, color),
  );
  text("zsh — 80×24", 320, WINDOW.y + 20, 12, "#7F93A1");

  c.font = `600 ${FONT_SIZE}px monospace`;
  c.textAlign = "left";
  c.fillStyle = accent;
  c.fillText(PROMPT, ORIGIN.x, ORIGIN.y);
  c.fillStyle = ink;
  const start = ORIGIN.x + PROMPT.length * ADVANCE;
  for (let i = 0; i < typed; i++) c.fillText(GLYPHS[i]!, start + i * ADVANCE, ORIGIN.y);

  // Cursor: solid while keys are arriving, blinking (0.5 s period) while idle.
  const typing = t >= TYPE_START && t < TYPE_END + 0.35;
  const visible = typing || Math.floor(t / 0.5) % 2 === 0;
  const done = t >= TYPE_END + 0.7;
  if (visible && !done) {
    c.fillStyle = warm;
    c.fillRect(
      start + typed * ADVANCE + 2,
      ORIGIN.y - FONT_SIZE + 4,
      ADVANCE * 0.55,
      FONT_SIZE + 2,
    );
  }
  // Command output, then a fresh prompt with the idle cursor.
  if (done) {
    c.font = "500 16px monospace";
    c.fillStyle = "#7F93A1";
    c.fillText(`✓ ${GLYPHS.length} characters typed`, ORIGIN.x, ORIGIN.y + 34);
    c.font = `600 ${FONT_SIZE}px monospace`;
    c.fillStyle = accent;
    c.fillText(PROMPT, ORIGIN.x, ORIGIN.y + 72);
    if (Math.floor(t / 0.5) % 2 === 0) {
      c.fillStyle = warm;
      c.fillRect(start + 2, ORIGIN.y + 72 - FONT_SIZE + 4, ADVANCE * 0.55, FONT_SIZE + 2);
    }
  }
}
