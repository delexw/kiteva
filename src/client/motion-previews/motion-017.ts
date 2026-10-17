import { ink, accent, warm, dark, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Cursor-Driven Hotspot Exploded Reveal.
 * A puck-shaped device is drawn as stacked isometric discs. Hovering its hotspot
 * separates the layers along the shared vertical assembly axis; each label is attached
 * to its layer's anchor and appears only after the layer has separated. Leaving the
 * hotspot reverses the same progress back to the assembled state.
 */

const AXIS_X = 280;
const BASE_Y = 210; // assembled bottom of the stack
const RX = 110,
  RY = 30;
const HOTSPOT_REST_Y = 152; // assembled top-shell surface, where the pointer hovers
// Bottom → top. thickness in px, explode offset (negative = upward) along the axis.
const LAYERS = [
  {
    name: "BASE",
    note: "weighted rubber foot",
    thick: 16,
    offset: 44,
    top: "#3F5566",
    side: "#2A3B47",
  },
  { name: "BATTERY", note: "2-day cell", thick: 18, offset: 12, top: "#FF926C", side: "#C96B4C" },
  {
    name: "CIRCUIT",
    note: "mic + speaker driver",
    thick: 10,
    offset: -22,
    top: "#78DEC8",
    side: "#4FA894",
  },
  {
    name: "TOP SHELL",
    note: "touch surface",
    thick: 14,
    offset: -58,
    top: "#EAF1F5",
    side: "#AEBBC4",
  },
];

// Hover progress: approach, explode, hold, leave, reassemble.
const explodeProgress = (t: number) => motionProgress(t, 1.0, 2.0) - motionProgress(t, 4.0, 5.0);

function disc(c: CanvasRenderingContext2D, y: number, thick: number, top: string, side: string) {
  c.fillStyle = side;
  c.beginPath();
  c.ellipse(AXIS_X, y, RX, RY, 0, 0, Math.PI);
  c.lineTo(AXIS_X - RX, y - thick);
  c.ellipse(AXIS_X, y - thick, RX, RY, 0, Math.PI, 0, true);
  c.closePath();
  c.fill();
  c.fillStyle = top;
  c.beginPath();
  c.ellipse(AXIS_X, y - thick, RX, RY, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = dark;
  c.lineWidth = 1.5;
  c.stroke();
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text, cursor } = motionDrawing(c);
  const p = explodeProgress(t);
  text("EXPLORE THE ASSEMBLY", 320, 40, 20, ink);
  // Assembly axis guide appears with the explosion.
  c.globalAlpha = p * 0.6;
  c.setLineDash([4, 6]);
  c.strokeStyle = "#5C7C8E";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(AXIS_X, 70);
  c.lineTo(AXIS_X, 300);
  c.stroke();
  c.setLineDash([]);
  c.globalAlpha = 1;

  let stackY = BASE_Y;
  const anchors: { y: number; layer: (typeof LAYERS)[number]; local: number }[] = [];
  LAYERS.forEach((layer, index) => {
    // Stagger: outer layers lead, inner layers follow, all on the same axis.
    const local = ease(clamp(p * 1.3 - index * 0.1));
    const y = stackY + layer.offset * local;
    disc(c, y, layer.thick, layer.top, layer.side);
    if (layer.name === "CIRCUIT")
      for (let i = 0; i < 4; i++) {
        c.fillStyle = dark;
        c.fillRect(AXIS_X - 50 + i * 26, y - layer.thick - 6 + (i % 2) * 8, 16, 8);
      }
    anchors.push({ y: y - layer.thick, layer, local });
    stackY -= layer.thick;
  });

  // Hotspot on the top shell (it travels with the shell it belongs to).
  const shell = anchors[anchors.length - 1]!;
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  c.globalAlpha = 0.35 + 0.35 * pulse * (1 - p);
  circle(AXIS_X + 40, shell.y, 16 + pulse * 5, warm);
  c.globalAlpha = 1;
  circle(AXIS_X + 40, shell.y, 7, warm);

  // Leader lines from each layer's right rim to a fixed label column.
  anchors.forEach(({ y, layer }) => {
    const reveal = clamp((p - 0.65) / 0.35);
    if (reveal <= 0) return;
    const ax = AXIS_X + RX,
      lx = 440;
    c.strokeStyle = warm;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(ax, y);
    c.lineTo(ax + (lx - 8 - ax) * reveal, y);
    c.stroke();
    if (reveal > 0.8) {
      c.globalAlpha = clamp((reveal - 0.8) / 0.2);
      c.textAlign = "left";
      c.fillStyle = ink;
      c.font = "700 14px sans-serif";
      c.fillText(layer.name, lx, y + 1);
      c.fillStyle = "#9FB0BC";
      c.font = "500 12px sans-serif";
      c.fillText(layer.note, lx, y + 17);
      c.globalAlpha = 1;
    }
  });

  // Authored pointer: approaches the hotspot, hovers, then leaves.
  const approach = motionProgress(t, 0.2, 0.95),
    leave = motionProgress(t, 3.8, 4.4);
  const px = 560 + (AXIS_X + 44 - 560) * approach + (560 - AXIS_X - 44) * leave;
  // While hovering, the pointer tip tracks the hotspot on the moving top shell
  // (shell.y equals HOTSPOT_REST_Y when assembled), so it stays on target when exploded.
  const hotspotY = Number.isFinite(shell.y) ? shell.y : HOTSPOT_REST_Y;
  const py = 300 + (hotspotY + 4 - 300) * approach * (1 - leave);
  cursor(px, py);
  text(
    p > 0.5 ? "4 parts · one assembly axis" : "Hover the hotspot to explode",
    320,
    336,
    16,
    p > 0.5 ? accent : ink,
  );
}
