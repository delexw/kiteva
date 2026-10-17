import { ink, accent, warm, dark, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Scroll-Driven Section Reveal and Card Stacking.
 * Card 1 is anchored at the sticky line. Each next card rises over the previous one;
 * covered cards step back (scale + dim) but keep their headers visible. At the end the
 * whole stack releases upward as one group, revealing the following content.
 *
 * One-card-to-deck option (frame finding f1117–1156, fan-to-stack portion only): the
 * revealed content is a single reference card. Sibling cards hidden exactly behind it
 * fan out about one shared bottom pivot, then rotate into a flat offset stack and
 * hold — a count change from one to several. No smear morph is attempted.
 */

const ANCHOR_Y = 58;
const CARD = { x: 130, w: 380, h: 214 };
const SECTIONS = [
  {
    title: "SECTION 1",
    body: ["Research the problem", "Interview five users"],
    color: ink,
    arrive: -1,
  },
  {
    title: "SECTION 2",
    body: ["Sketch the solution", "Pick one direction"],
    color: accent,
    arrive: 0.8,
  },
  {
    title: "SECTION 3",
    body: ["Build the prototype", "Ship it to testers"],
    color: warm,
    arrive: 1.9,
  },
];
const ARRIVE_DURATION = 0.7;
const RELEASE = { start: 3.2, end: 3.9 };
export const DECK = {
  pivot: { x: 320, y: 300 },
  card: { w: 132, h: 92 },
  appear: { start: 3.6, end: 3.9 },
  fan: { start: 4.25, end: 4.75 },
  stack: { start: 4.85, end: 5.3 },
  angles: [-0.42, -0.14, 0.14, 0.42],
  colors: ["#F2E6C9", accent, warm, ink],
};

/** Rotation and offset of deck card k (0 = the original front card, drawn last). */
export function deckPose(k: number, t: number) {
  const fan = motionProgress(t, DECK.fan.start, DECK.fan.end);
  const stack = motionProgress(t, DECK.stack.start, DECK.stack.end);
  const order = DECK.angles.length - 1 - k; // the front card keeps the rightmost slot
  // "+ 0" normalises -0 (negative fan angle × zero progress) so a collapsed card is exactly 0.
  const angle = DECK.angles[order]! * fan * (1 - stack) + 0;
  return { angle, dx: (order - 1.5) * 16 * stack + 0, dy: -order * 9 * stack + 0 };
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  const release = motionProgress(t, RELEASE.start, RELEASE.end);
  const groupLift = release * 330;

  // Content that follows the stack, uncovered by the group release.
  const after = motionProgress(t, RELEASE.start + 0.3, RELEASE.end + 0.2);
  c.globalAlpha = after;
  text("ALL SECTIONS READ", 320, 92, 26, ink);
  // Short, 19 px subtitle: legible at card size.
  text("one reference becomes four", 320, 124, 19, accent);
  c.globalAlpha = 1;

  // Revealed deck: one card, then its hidden siblings fan out and restack.
  const appear = motionProgress(t, DECK.appear.start, DECK.appear.end);
  if (appear > 0) {
    for (let k = DECK.angles.length - 1; k >= 0; k--) {
      // Siblings exist only behind the front card until the fan begins.
      if (k > 0 && t < DECK.fan.start) continue;
      const pose = deckPose(k, t);
      c.save();
      c.globalAlpha = appear;
      c.translate(DECK.pivot.x + pose.dx, DECK.pivot.y + pose.dy + (1 - appear) * 30);
      c.rotate(pose.angle);
      c.fillStyle = "rgba(0, 0, 0, 0.3)";
      c.fillRect(-DECK.card.w / 2 + 4, -DECK.card.h + 5, DECK.card.w, DECK.card.h);
      c.fillStyle = DECK.colors[k]!;
      c.fillRect(-DECK.card.w / 2, -DECK.card.h, DECK.card.w, DECK.card.h);
      c.fillStyle = dark;
      c.font = "700 13px sans-serif";
      c.textAlign = "left";
      c.fillText(`REF ${k + 1}`, -DECK.card.w / 2 + 12, -DECK.card.h + 22);
      c.fillStyle = "rgba(20, 33, 43, 0.3)";
      c.fillRect(-DECK.card.w / 2 + 12, -DECK.card.h + 36, DECK.card.w - 24, 30);
      c.restore();
    }
  }

  // Sticky line marker.
  c.fillStyle = "#2E4757";
  c.fillRect(CARD.x - 24, ANCHOR_Y - groupLift, 10, 3);

  SECTIONS.forEach((section, index) => {
    const arrival =
      section.arrive < 0 ? 1 : motionProgress(t, section.arrive, section.arrive + ARRIVE_DURATION);
    if (arrival <= 0) return;
    // How many later cards have covered this one (continuous during their arrival).
    const covered = SECTIONS.slice(index + 1).reduce(
      (sum, later) => sum + motionProgress(t, later.arrive, later.arrive + ARRIVE_DURATION),
      0,
    );
    const restY = ANCHOR_Y + index * 18;
    const y = 400 + (restY - 400) * ease(arrival) - groupLift;
    if (y + CARD.h < -10) return; // fully released off-frame
    const scale = 1 - covered * 0.05;
    c.save();
    c.translate(320, y);
    c.scale(scale, scale);
    c.translate(-320, 0);
    c.shadowColor = "rgba(0, 0, 0, 0.4)";
    c.shadowBlur = 18;
    c.shadowOffsetY = -4;
    c.fillStyle = section.color;
    c.beginPath();
    c.roundRect(CARD.x, 0, CARD.w, CARD.h, 16);
    c.fill();
    c.shadowColor = "transparent";
    c.textAlign = "left";
    c.fillStyle = dark;
    c.font = "700 15px sans-serif";
    c.fillText(section.title, CARD.x + 24, 13 + 0);
    c.font = "600 22px sans-serif";
    c.fillText(section.body[0]!, CARD.x + 24, 70);
    c.font = "500 16px sans-serif";
    c.fillText(section.body[1]!, CARD.x + 24, 100);
    c.fillStyle = "rgba(20, 33, 43, 0.25)";
    c.fillRect(CARD.x + 24, 130, CARD.w - 48, 8);
    c.fillRect(CARD.x + 24, 150, CARD.w - 120, 8);
    // Covered cards dim so the active card is the clear focal layer.
    if (covered > 0) {
      c.fillStyle = `rgba(20, 33, 43, ${Math.min(0.55, covered * 0.35)})`;
      c.beginPath();
      c.roundRect(CARD.x, 0, CARD.w, CARD.h, 16);
      c.fill();
    }
    c.restore();
  });

  // Scroll progress indicator: page progress continues while the stack is anchored.
  c.fillStyle = "#22343F";
  c.fillRect(600, 40, 6, 280);
  c.fillStyle = accent;
  c.fillRect(600, 40 + Math.min(1, t / RELEASE.end) * 230, 6, 50);
}
