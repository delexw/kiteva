import { ink, accent, warm, dark, clamp, motionProgress, motionDrawing } from "./drawing";

/**
 * Data Build.
 * One authored data state drives everything: nodes appear first at stable positions,
 * then each link draws in order (its arrowhead only once the shaft has arrived), and
 * the percentage, link count and per-node degree badges are all read from the same
 * link-completion values. The conclusion holds without decorative motion.
 */

const NODES = [
  // label offsets keep names clear of the links that touch each node
  // bx/by place each degree badge on the side away from its incoming/outgoing links
  { id: "USER", x: 150, y: 190, lx: 0, ly: 37, bx: -30, by: -28 },
  { id: "APP", x: 320, y: 110, lx: 52, ly: 4, bx: 10, by: -28 },
  { id: "API", x: 490, y: 190, lx: 0, ly: 37, bx: 10, by: -28 },
  { id: "DB", x: 320, y: 260, lx: 0, ly: 37, bx: -30, by: -28 },
];
const LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [1, 3],
];
const NODE_R = 17;
const LINK_WINDOW = { start: 1.4, end: 3.4 };

/** Completion 0…1 of every link at time t — the single source of truth. */
function linkState(t: number) {
  const p = clamp((t - LINK_WINDOW.start) / (LINK_WINDOW.end - LINK_WINDOW.start));
  return LINKS.map((_, i) => clamp(p * LINKS.length - i));
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, line, text } = motionDrawing(c);
  const links = linkState(t);
  const complete = links.filter((value) => value >= 1).length;
  const percent = Math.floor((links.reduce((sum, value) => sum + value, 0) / LINKS.length) * 100);

  // Links (only after their nodes exist): shaft first, head after the shaft lands.
  LINKS.forEach(([from, to], i) => {
    const progress = links[i]!;
    if (progress <= 0) return;
    const a = NODES[from]!,
      b = NODES[to]!;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const sx = a.x + Math.cos(angle) * (NODE_R + 4),
      sy = a.y + Math.sin(angle) * (NODE_R + 4);
    const ex = b.x - Math.cos(angle) * (NODE_R + 6),
      ey = b.y - Math.sin(angle) * (NODE_R + 6);
    line(sx, sy, sx + (ex - sx) * progress, sy + (ey - sy) * progress, ink, 3);
    if (progress >= 1) {
      c.fillStyle = ink;
      c.beginPath();
      c.moveTo(ex + Math.cos(angle) * 4, ey + Math.sin(angle) * 4);
      c.lineTo(ex - Math.cos(angle - 0.5) * 12, ey - Math.sin(angle - 0.5) * 12);
      c.lineTo(ex - Math.cos(angle + 0.5) * 12, ey - Math.sin(angle + 0.5) * 12);
      c.closePath();
      c.fill();
    }
  });

  // Nodes: always four circles at fixed positions; they grow in a short stagger.
  NODES.forEach((node, i) => {
    const grow = motionProgress(t, 0.3 + i * 0.1, 0.85 + i * 0.1);
    circle(node.x, node.y, NODE_R * grow, accent);
    if (grow > 0) {
      c.globalAlpha = grow;
      text(node.id, node.x + node.lx, node.y + node.ly, 14, ink);
      c.globalAlpha = 1;
    }
    // Degree badge from the same link state (counted only for completed links).
    const degree = LINKS.filter(([f, to], k) => (f === i || to === i) && links[k]! >= 1).length;
    if (degree > 0) {
      c.fillStyle = warm;
      c.beginPath();
      c.roundRect(node.x + node.bx, node.y + node.by, 20, 18, 9);
      c.fill();
      text(String(degree), node.x + node.bx + 10, node.y + node.by + 14, 12, dark);
    }
  });

  text(`${percent}% connected`, 320, 54, 22, ink);
  text(`${complete} of ${LINKS.length} links`, 320, 76, 13, "#9FB0BC");
  const conclusion = motionProgress(t, 3.6, 4.0);
  if (conclusion > 0) {
    c.globalAlpha = conclusion;
    text("Every service is reachable", 320, 332, 17, accent);
    c.globalAlpha = 1;
  }
}
