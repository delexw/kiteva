import { ink, accent, warm, dark, clamp, ease, motionDrawing } from "./drawing";

/**
 * Swipe Card Carousel.
 * One owner of track position: an authored offset (in card units) evaluated from time.
 * A drag gesture moves the track with the finger, the release settles on the next snap,
 * a "next" button press advances again, and a final swipe lands on the last card.
 */

const CARDS = [
  { title: "Plan", note: "Define the goal", color: accent },
  { title: "Sketch", note: "Explore options", color: ink },
  { title: "Build", note: "Make it real", color: warm },
  { title: "Test", note: "Learn from users", color: "#B6C9E8" },
];
const CARD_W = 220,
  GAP = 26,
  PITCH = CARD_W + GAP;
const VIEW = { x: 30, y: 54, w: 580, h: 220 };

// Track offset keys [time, position]; positions between integers are mid-gesture.
const TRACK_KEYS: [number, number, "drag" | "settle" | "hold"][] = [
  [0, 0, "hold"],
  [0.9, 0, "hold"],
  [1.5, 0.42, "drag"], // finger drags the track left
  [1.95, 1, "settle"], // release: snaps to card 2
  [3.0, 1, "hold"],
  [3.55, 2, "settle"], // next-button press
  [4.5, 2, "hold"],
  [5.0, 2.38, "drag"],
  [5.4, 3, "settle"],
  [6, 3, "hold"],
];

function track(t: number) {
  for (let i = 1; i < TRACK_KEYS.length; i++) {
    const [t1, p1, mode] = TRACK_KEYS[i]!;
    const [t0, p0] = TRACK_KEYS[i - 1]!;
    if (t <= t1) {
      const u = clamp((t - t0) / (t1 - t0));
      // Drags follow the finger linearly; settles decelerate into the snap.
      const shaped = mode === "drag" ? u : mode === "settle" ? 1 - Math.pow(1 - u, 3) : ease(u);
      return { position: p0 + (p1 - p0) * shaped, mode };
    }
  }
  return { position: 3, mode: "hold" as const };
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text, cursor } = motionDrawing(c);
  const { position } = track(t);
  const selected = Math.round(position);

  c.save();
  c.beginPath();
  c.roundRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h, 18);
  c.clip();
  c.fillStyle = "#1A2C38";
  c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
  CARDS.forEach((card, index) => {
    const offset = index - position;
    const x = 320 + offset * PITCH;
    const focus = 1 - clamp(Math.abs(offset));
    const scale = 0.86 + 0.14 * focus;
    c.save();
    c.translate(x, VIEW.y + VIEW.h / 2);
    c.scale(scale, scale);
    c.globalAlpha = 0.45 + 0.55 * focus;
    c.fillStyle = card.color;
    c.beginPath();
    c.roundRect(-CARD_W / 2, -90, CARD_W, 180, 16);
    c.fill();
    c.fillStyle = "rgba(20, 33, 43, 0.18)";
    c.beginPath();
    c.roundRect(-CARD_W / 2 + 18, -72, CARD_W - 36, 70, 10);
    c.fill();
    text(String(index + 1).padStart(2, "0"), 0, -26, 28, dark);
    c.textAlign = "left";
    c.fillStyle = dark;
    c.font = "700 22px sans-serif";
    c.fillText(card.title, -CARD_W / 2 + 20, 36);
    c.font = "500 15px sans-serif";
    c.fillText(card.note, -CARD_W / 2 + 20, 62);
    c.restore();
  });
  c.restore();

  // Navigation affordances: prev/next buttons and position dots.
  const press = clamp(1 - Math.abs(t - 3.05) / 0.15);
  for (const [x, label, enabled] of [
    [262, "‹", selected > 0],
    [378, "›", selected < CARDS.length - 1],
  ] as const) {
    const pressed = label === "›" ? press : 0;
    c.fillStyle = pressed > 0 ? accent : enabled ? "#2E4757" : "#1E2F3A";
    c.beginPath();
    c.arc(x, 306, 17 - pressed * 2, 0, Math.PI * 2);
    c.fill();
    text(label, x, 314, 24, pressed > 0 ? dark : enabled ? ink : "#4C6172");
  }
  CARDS.forEach((_, i) => circle(296 + i * 16, 306, 4, i === selected ? accent : "#4C6172"));
  text(`${CARDS[selected]!.title} · ${selected + 1} of ${CARDS.length}`, 320, 340, 15, ink);

  // Visible finger only during swipe gestures; it moves exactly with the track.
  const gestureStart = t >= 0.75 && t <= 1.5 ? 0 : t >= 4.35 && t <= 5.0 ? 2 : -1;
  if (gestureStart >= 0) cursor(430 - (position - gestureStart) * PITCH, 200);
  else if (t > 2.85 && t < 3.2) cursor(384, 312);
}
