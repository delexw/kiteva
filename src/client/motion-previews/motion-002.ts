import { ink, accent, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Scroll-Driven Vortex Transit.
 * A camera travels down a tunnel of cloud bands. Bands sit at fixed depths; only the
 * camera depth changes, so near bands expand past the frame edges while the dark far
 * opening grows until it covers the view and the next chapter resolves inside it.
 */

const CENTER_X = 320,
  CENTER_Y = 180;
const FOCAL = 230;
const BAND_DEPTHS = Array.from({ length: 16 }, (_, i) => 1 + i);
const EXIT_DEPTH = 17;
const BAND_RADIUS = 1.4; // world radius of every cloud band
const EXIT_RADIUS = 1; // world radius of the dark opening at the tunnel end
const CAMERA_END = EXIT_DEPTH - 0.3; // close enough for the opening to overfill 640×360

// Scroll schedule: hero hold, camera passage, then the incoming chapter.
const cameraDepth = (t: number) => {
  const p = clamp((t - 0.8) / 3.4);
  // Ease in, then accelerate into the opening: travel feels like being drawn in.
  const travel = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  return travel * CAMERA_END;
};

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  const cam = cameraDepth(t);
  c.save();
  c.beginPath();
  c.rect(0, 0, 640, 360);
  c.clip();
  c.fillStyle = "#18303C";
  c.fillRect(0, 0, 640, 360);

  // Far-to-near so nearer bands overlap farther ones.
  const exitDistance = EXIT_DEPTH - cam;
  const exitRadius = (EXIT_RADIUS * FOCAL) / Math.max(0.05, exitDistance);
  circle(CENTER_X, CENTER_Y, exitRadius, "#060B10");
  for (let i = BAND_DEPTHS.length - 1; i >= 0; i--) {
    const z = BAND_DEPTHS[i]!;
    const distance = z - cam;
    if (distance < 0.12) continue; // the band has passed behind the camera
    const scale = FOCAL / distance;
    const radius = BAND_RADIUS * scale;
    if (radius > 900) continue;
    const fog = clamp(1 - distance / 15);
    // The spiral twist is a property of depth; turning only appears as the camera moves.
    const twist = z * 0.55;
    c.lineWidth = Math.max(1.5, 0.32 * scale);
    for (let s = 0; s < 6; s++) {
      const start = twist + (s * Math.PI) / 3;
      c.globalAlpha = 0.25 + 0.65 * fog;
      c.strokeStyle = (s + i) % 2 ? accent : ink;
      c.beginPath();
      c.ellipse(CENTER_X, CENTER_Y, radius, radius * 0.82, 0, start, start + Math.PI / 4.2);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  // Opening hero: fades as soon as the camera starts to move.
  const heroAlpha = 1 - motionProgress(t, 0.85, 1.6);
  if (heroAlpha > 0) {
    c.globalAlpha = heroAlpha;
    c.fillStyle = "rgba(6, 11, 16, 0.55)";
    c.beginPath();
    c.roundRect(170, 136, 300, 92, 16);
    c.fill();
    text("INTO THE STORM", 320, 180, 34, ink);
    text("scroll to enter", 320, 210, 15, accent);
    c.globalAlpha = 1;
  }

  // Next chapter resolves only after the dark opening covers the whole frame.
  const reveal = motionProgress(t, 4.25, 4.95);
  if (reveal > 0) {
    c.fillStyle = "#060B10";
    c.fillRect(0, 0, 640, 360);
    c.globalAlpha = reveal;
    for (let i = 0; i < 24; i++)
      circle(30 + ((i * 263) % 580), 30 + ((i * 131) % 190), 1.2 + (i % 3) * 0.5, ink);
    circle(320, 262, 40 + reveal * 8, "#FFB27A");
    c.fillStyle = "#0E2230";
    c.fillRect(0, 262, 640, 98);
    const rise = (1 - ease(reveal)) * 16;
    text("CHAPTER 02", 320, 132 + rise, 15, accent);
    text("The Calm Beyond", 320, 174 + rise, 36, ink);
    c.globalAlpha = 1;
  }
  c.restore();
}
