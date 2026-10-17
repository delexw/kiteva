import { ink, accent, warm, dark, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Gallery Focus.
 * A 3×2 grid of illustrated studies. The selected tile is clicked, supporting copy
 * clears, neighbours yield outward, and the same tile (same artwork function, scaled)
 * grows into the focus frame. Its caption appears after the frame arrives.
 *
 * Burst-hub zoom-through option (frame finding f976–1027): the studies are first flung
 * from the title hub by a starburst to their slots; thin spokes are drawn only after
 * every tile has landed. After the focus hold the same tile (same artwork, accent
 * border and folded corner) zooms toward the camera through a near-white frame and
 * recedes to the hero position of the next section instead of returning to the grid.
 */

type Rect = { x: number; y: number; w: number; h: number };
const TILE = { w: 160, h: 96 };
const GRID_ORIGIN = { x: 60, y: 92 };
const GAP = { x: 30, y: 24 };
const SELECTED = 1;
// Same 5:3 aspect as TILE (160×96) so the artwork scales uniformly; bottom edge (276)
// leaves a clear band for the caption below.
const FOCUS: Rect = { x: 125, y: 42, w: 390, h: 234 };
const STUDIES = ["Summit", "Coastline", "City", "Forest", "Dunes", "Aurora"];
const slot = (i: number): Rect => ({
  x: GRID_ORIGIN.x + (i % 3) * (TILE.w + GAP.x),
  y: GRID_ORIGIN.y + Math.floor(i / 3) * (TILE.h + GAP.y),
  ...TILE,
});

// Each study is drawn in a 160×96 local frame so identity holds at any scale.
function artwork(c: CanvasRenderingContext2D, i: number) {
  const skies = ["#284B63", "#9FD3E8", "#22343F", "#2F5D50", "#F2C48D", "#0E1A2B"];
  c.fillStyle = skies[i]!;
  c.fillRect(0, 0, TILE.w, TILE.h);
  c.fillStyle = dark;
  c.beginPath();
  if (i === 0) {
    c.moveTo(0, 96);
    c.lineTo(60, 30);
    c.lineTo(90, 58);
    c.lineTo(120, 20);
    c.lineTo(160, 96);
    c.fill();
    c.fillStyle = ink;
    c.beginPath();
    c.moveTo(110, 33);
    c.lineTo(120, 20);
    c.lineTo(130, 36);
    c.fill();
  } else if (i === 1) {
    c.fillStyle = "#2D7FA6";
    c.fillRect(0, 56, 160, 40);
    c.fillStyle = "#F2E2C4";
    c.moveTo(0, 70);
    c.quadraticCurveTo(70, 52, 160, 86);
    c.lineTo(160, 96);
    c.lineTo(0, 96);
    c.fill();
    c.fillStyle = "#FFFFFF";
    c.beginPath();
    c.arc(120, 26, 12, 0, Math.PI * 2);
    c.fill();
  } else if (i === 2) {
    for (let b = 0; b < 7; b++) c.fillRect(8 + b * 22, 30 + ((b * 23) % 40), 18, 66);
    c.fillStyle = "#FFD27A";
    for (let b = 0; b < 7; b++) c.fillRect(13 + b * 22, 44 + ((b * 23) % 40), 4, 4);
  } else if (i === 3) {
    for (let k = 0; k < 6; k++) {
      c.moveTo(14 + k * 26, 30 + (k % 2) * 10);
      c.lineTo(28 + k * 26, 90);
      c.lineTo(0 + k * 26, 90);
    }
    c.fill();
  } else if (i === 4) {
    c.fillStyle = "#D9965C";
    c.moveTo(0, 70);
    c.quadraticCurveTo(50, 40, 100, 66);
    c.quadraticCurveTo(130, 80, 160, 60);
    c.lineTo(160, 96);
    c.lineTo(0, 96);
    c.fill();
  } else {
    c.strokeStyle = accent;
    c.lineWidth = 6;
    c.moveTo(0, 40);
    c.quadraticCurveTo(80, 0, 160, 34);
    c.stroke();
    c.fillStyle = "#08111A";
    c.fillRect(0, 76, 160, 20);
  }
}

// Focus timeline: fling → spokes → click → clear copy and yield → grow → caption →
// hold → zoom-through → hero of the next section.
// The complete hub (all tiles landed, spokes drawn) holds 0.92–1.38 s before the click.
const CLICK = 1.28;
export const HUB = {
  center: { x: 320, y: 60 },
  fling: { start: 0, end: 0.55 },
  // The last tile lands at 0.55 + 5 × 0.03 = 0.70 s; spokes start after that.
  spokes: { start: 0.72, end: 0.92 },
};
export const ZOOM_THROUGH = {
  start: 3.9,
  peak: 4.4,
  land: 4.9,
  title: { start: 4.95, end: 5.25 },
  hero: { x: 40, y: 92, w: 300, h: 180 } as Rect,
  through: { x: -140, y: -112, w: 920, h: 552 } as Rect,
};
const grow = (t: number) => motionProgress(t, 1.55, 2.5);
const copyFade = (t: number) => motionProgress(t, 1.38, 1.68);
/** The last tile (index 5, staggered 0.03 s each) lands at fling.end + 0.15 s. */
export const LAST_TILE_LANDS = 0.7;
export const HERO_COPY_X = 362;
export const HERO_SUBTITLE = ["the chosen study", "leads the chapter"];
const BURST_RAYS = Array.from({ length: 12 }, (_, i) => ({
  angle: (i / 12) * Math.PI * 2 + 0.2,
  length: 120 + ((i * 29) % 60),
}));
const mixRect = (a: Rect, b: Rect, p: number): Rect => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  w: a.w + (b.w - a.w) * p,
  h: a.h + (b.h - a.h) * p,
});
const flung = (i: number, t: number): Rect => {
  const r = slot(i);
  const p = ease(clamp((t - HUB.fling.start - i * 0.03) / (HUB.fling.end - HUB.fling.start)));
  const from = { x: HUB.center.x - r.w / 2, y: HUB.center.y, w: r.w * 0.3, h: r.h * 0.3 };
  return mixRect(from, r, p);
};

/** Selected-tile rect through focus, zoom-through and hero landing. */
export function selectedRect(t: number): Rect {
  const home = slot(SELECTED);
  if (t < ZOOM_THROUGH.start)
    return mixRect(t < HUB.fling.end + 0.2 ? flung(SELECTED, t) : home, FOCUS, ease(grow(t)));
  if (t < ZOOM_THROUGH.peak)
    return mixRect(
      FOCUS,
      ZOOM_THROUGH.through,
      motionProgress(t, ZOOM_THROUGH.start, ZOOM_THROUGH.peak),
    );
  return mixRect(
    ZOOM_THROUGH.through,
    ZOOM_THROUGH.hero,
    motionProgress(t, ZOOM_THROUGH.peak, ZOOM_THROUGH.land),
  );
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text, cursor } = motionDrawing(c);
  const g = grow(t);
  const supporting = 1 - copyFade(t);
  const fling = motionProgress(t, HUB.fling.start, HUB.fling.end);
  // Starburst behind the hub while the studies are flung out.
  const rays = fling * (1 - motionProgress(t, 0.45, 0.8));
  if (rays > 0) {
    c.fillStyle = "#2E4757";
    for (const ray of BURST_RAYS) {
      c.beginPath();
      c.moveTo(
        HUB.center.x + Math.cos(ray.angle - 0.08) * 20,
        HUB.center.y + Math.sin(ray.angle - 0.08) * 20,
      );
      c.lineTo(
        HUB.center.x + Math.cos(ray.angle) * (20 + ray.length * rays),
        HUB.center.y + Math.sin(ray.angle) * (20 + ray.length * rays),
      );
      c.lineTo(
        HUB.center.x + Math.cos(ray.angle + 0.08) * 20,
        HUB.center.y + Math.sin(ray.angle + 0.08) * 20,
      );
      c.closePath();
      c.fill();
    }
  }
  // Spokes appear only after every tile has landed, and clear with the copy.
  const spokes = motionProgress(t, HUB.spokes.start, HUB.spokes.end) * supporting;
  if (spokes > 0) {
    c.strokeStyle = "#4C6172";
    c.lineWidth = 1.5;
    for (let i = 0; i < STUDIES.length; i++) {
      const r = slot(i);
      const tx = r.x + r.w / 2,
        ty = r.y;
      c.beginPath();
      c.moveTo(HUB.center.x, HUB.center.y + 18);
      c.lineTo(
        HUB.center.x + (tx - HUB.center.x) * spokes,
        HUB.center.y + 18 + (ty - HUB.center.y - 18) * spokes,
      );
      c.stroke();
    }
  }
  // Supporting copy clears before the focus move.
  c.globalAlpha = supporting;
  text("SIX FIELD STUDIES", 320, 48, 20, ink);
  text("select a study to focus", 320, 72, 14, "#9FB0BC");
  c.globalAlpha = 1;

  const tile = (i: number, r: Rect, alpha: number) => {
    c.save();
    c.globalAlpha = alpha;
    c.beginPath();
    c.roundRect(r.x, r.y, r.w, r.h, 10);
    c.clip();
    // Uniform scale, centred (letterboxed) in the rect, so artwork is never distorted.
    const k = Math.min(r.w / TILE.w, r.h / TILE.h);
    c.translate(r.x + (r.w - TILE.w * k) / 2, r.y + (r.h - TILE.h * k) / 2);
    c.scale(k, k);
    artwork(c, i);
    c.restore();
  };
  // Neighbours yield away from the selected tile and fade, keeping their order.
  const home = slot(SELECTED);
  for (let i = 0; i < STUDIES.length; i++) {
    if (i === SELECTED) continue;
    const r = t < HUB.fling.end + 0.2 ? flung(i, t) : slot(i);
    const dx = r.x - home.x,
      dy = r.y - home.y;
    const away = g * 40;
    const len = Math.hypot(dx, dy) || 1;
    // Neighbours fade out completely, so nothing sits under the focus caption during the hold.
    tile(i, { ...r, x: r.x + (dx / len) * away, y: r.y + (dy / len) * away }, 1 - g);
    if (g < 0.2 && t >= LAST_TILE_LANDS) {
      c.globalAlpha = 1 - g * 5;
      text(STUDIES[i]!, r.x + r.w / 2, r.y + r.h + 16, 12, "#9FB0BC");
      c.globalAlpha = 1;
    }
  }
  // The selected tile itself grows (FLIP-style rect interpolation, aspect-correct art),
  // then zooms through the camera and lands as the next section's hero.
  const rect = selectedRect(t);
  const press = clamp(1 - Math.abs(t - CLICK) / 0.12) * 0.05;
  const pressed = {
    x: rect.x + (rect.w * press) / 2,
    y: rect.y + (rect.h * press) / 2,
    w: rect.w * (1 - press),
    h: rect.h * (1 - press),
  };
  tile(SELECTED, pressed, 1);
  const through =
    motionProgress(t, ZOOM_THROUGH.start, ZOOM_THROUGH.peak) *
    (1 - motionProgress(t, ZOOM_THROUGH.peak, ZOOM_THROUGH.land));
  // Near-white frame thickens as the card passes the camera.
  c.strokeStyle = through > 0 ? "#F4F7F2" : accent;
  c.lineWidth = 3 + through * 22;
  c.beginPath();
  c.roundRect(pressed.x, pressed.y, pressed.w, pressed.h, 10);
  c.stroke();
  // Identity mark: a folded corner that persists at every scale.
  const fold = Math.min(pressed.w, pressed.h) * 0.12;
  c.fillStyle = "#F4F7F2";
  c.beginPath();
  c.moveTo(pressed.x + pressed.w - fold, pressed.y + pressed.h);
  c.lineTo(pressed.x + pressed.w, pressed.y + pressed.h - fold);
  c.lineTo(pressed.x + pressed.w - fold, pressed.y + pressed.h - fold);
  c.closePath();
  c.fill();
  if (g < 0.2 && t >= LAST_TILE_LANDS) {
    c.globalAlpha = 1 - g * 5;
    text(STUDIES[SELECTED]!, home.x + home.w / 2, home.y + home.h + 16, 12, accent);
    c.globalAlpha = 1;
  }
  // Brief near-white flash at the pass-through peak.
  const flash = 1 - clamp(Math.abs(t - ZOOM_THROUGH.peak) / 0.08);
  if (flash > 0) {
    c.fillStyle = `rgba(244, 247, 242, ${(0.85 * flash).toFixed(3)})`;
    c.fillRect(0, 0, 640, 360);
  }
  // data-reveal-after="hero": the next section's copy waits for the landed card.
  const heroTitle = motionProgress(t, ZOOM_THROUGH.title.start, ZOOM_THROUGH.title.end);
  if (t >= ZOOM_THROUGH.land && heroTitle > 0) {
    c.globalAlpha = heroTitle;
    c.textAlign = "left";
    c.fillStyle = ink;
    c.font = "800 30px sans-serif";
    c.fillText("02  COASTLINE", HERO_COPY_X, 156);
    // Two short subtitle lines keep the copy well inside the right edge.
    c.fillStyle = warm;
    c.font = "600 17px sans-serif";
    HERO_SUBTITLE.forEach((line, i) => c.fillText(line, HERO_COPY_X, 186 + i * 22));
    c.fillStyle = "#4C6172";
    c.fillRect(HERO_COPY_X, 230, 200, 8);
    c.fillRect(HERO_COPY_X, 248, 150, 8);
    c.globalAlpha = 1;
  }
  // Focus caption waits until the frame has arrived and clears before the zoom-through.
  const caption =
    clamp((g - 0.9) / 0.1) *
    motionProgress(t, 2.5, 2.85) *
    (1 - motionProgress(t, ZOOM_THROUGH.start - 0.15, ZOOM_THROUGH.start));
  if (caption > 0) {
    c.globalAlpha = caption;
    // Dark backing plate keeps the caption legible regardless of what is behind it.
    c.fillStyle = "#101B23";
    c.beginPath();
    c.roundRect(200, 288, 240, 56, 10);
    c.fill();
    text("Coastline — Study 02", 320, 312, 20, ink);
    text("morning fog over the bay", 320, 334, 14, warm);
    c.globalAlpha = 1;
  }
  if (t > 0.9 && t < 1.55) cursor(home.x + 120 - (1 - clamp((t - 0.9) / 0.35)) * 120, home.y + 70);
}
