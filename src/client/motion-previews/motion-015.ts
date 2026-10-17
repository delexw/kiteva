import { ink, accent, warm, dark, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Scroll-Driven Storytelling.
 * A sticky graphic (right) and step copy (left) share one story state. Four steps:
 * premise → context → mechanism → outcome. The network grows from that state, the
 * framing pulls back as it grows, and the counter reads the same node set.
 */

const STEPS = [
  { start: 0, kicker: "01 · QUESTION", copy: ["How does one idea", "spread?"] },
  { start: 1.3, kicker: "02 · CONTEXT", copy: ["It finds a few", "early allies."] },
  { start: 2.6, kicker: "03 · MECHANISM", copy: ["Each ally invites", "two more."] },
  { start: 3.9, kicker: "04 · OUTCOME", copy: ["One idea becomes", "a system."] },
];
// Nodes in graph space, the step that introduces them and their parent link.
const NODES = [
  { x: 0, y: 0, step: 0, parent: -1 },
  { x: -70, y: -60, step: 1, parent: 0 },
  { x: 80, y: -48, step: 1, parent: 0 },
  { x: -140, y: -10, step: 2, parent: 1 },
  { x: -90, y: -140, step: 2, parent: 1 },
  { x: 150, y: -110, step: 2, parent: 2 },
  { x: 140, y: 30, step: 2, parent: 2 },
];
// Closing links that turn the tree into a connected system in the outcome step.
const LOOP_LINKS: [number, number][] = [
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 3],
];

const stepIndex = (t: number) =>
  STEPS.reduce((current, step, i) => (t >= step.start ? i : current), 0);
// Within-step growth: a link draws, then its child node appears.
const stepGrowth = (t: number, step: number) =>
  step === 0 ? 1 : motionProgress(t, STEPS[step]!.start + 0.1, STEPS[step]!.start + 0.8);

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, text } = motionDrawing(c);
  const current = stepIndex(t);
  // Framing pulls back as the network grows (one camera owner, keyed to the story).
  const framing = 1.45 - 0.15 * motionProgress(t, 1.3, 2.0) - 0.25 * motionProgress(t, 2.6, 3.3);
  const graph = { x: 455, y: 218 };
  const toScreen = (n: { x: number; y: number }) => ({
    x: graph.x + n.x * framing * 0.72,
    y: graph.y + n.y * framing * 0.72,
  });

  // Sticky panel.
  c.fillStyle = "#162733";
  c.beginPath();
  c.roundRect(290, 40, 330, 280, 18);
  c.fill();
  c.save();
  c.beginPath();
  c.roundRect(290, 40, 330, 280, 18);
  c.clip();
  let visibleNodes = 0;
  for (let i = 1; i < NODES.length; i++) {
    const node = NODES[i]!;
    if (node.step > current) continue;
    const g = node.step < current ? 1 : stepGrowth(t, node.step);
    const a = toScreen(NODES[node.parent]!),
      b = toScreen(node);
    const link = clamp(g / 0.6);
    c.strokeStyle = ink;
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(a.x + (b.x - a.x) * link, a.y + (b.y - a.y) * link);
    c.stroke();
  }
  const loop = current === 3 ? motionProgress(t, STEPS[3]!.start + 0.1, STEPS[3]!.start + 0.9) : 0;
  if (loop > 0) {
    c.strokeStyle = accent;
    c.lineWidth = 3;
    LOOP_LINKS.forEach(([from, to], i) => {
      const local = clamp(loop * LOOP_LINKS.length - i);
      if (local <= 0) return;
      const a = toScreen(NODES[from]!),
        b = toScreen(NODES[to]!);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(a.x + (b.x - a.x) * local, a.y + (b.y - a.y) * local);
      c.stroke();
    });
  }
  NODES.forEach((node, i) => {
    if (node.step > current) return;
    const g = node.step < current ? 1 : stepGrowth(t, node.step);
    const pop = clamp((g - 0.6) / 0.4); // node exists only after its link arrives
    if (i > 0 && pop <= 0) return;
    if (i === 0 || pop > 0.5) visibleNodes++;
    const p = toScreen(node);
    const size = i === 0 ? 17 : 12 * ease(pop);
    circle(p.x, p.y, size, i === 0 ? warm : loop >= 1 ? accent : ink);
    if (i === 0) circle(p.x, p.y, 6, dark);
  });
  c.restore();
  text(`${visibleNodes} ${visibleNodes === 1 ? "node" : "nodes"}`, 455, 304, 14, "#9FB0BC");

  // Step copy: crossfades only at step boundaries; holds fully legible in between.
  const step = STEPS[current]!;
  const enter = clamp((t - step.start) / 0.3);
  c.globalAlpha = current === 0 ? 1 : enter;
  c.textAlign = "left";
  c.fillStyle = accent;
  c.font = "600 14px sans-serif";
  c.fillText(step.kicker, 34, 140 + (1 - enter) * 10 * (current ? 1 : 0));
  c.fillStyle = ink;
  c.font = "700 24px sans-serif";
  step.copy.forEach((line, i) =>
    c.fillText(line, 34, 176 + i * 32 + (1 - enter) * 10 * (current ? 1 : 0)),
  );
  c.globalAlpha = 1;
  STEPS.forEach((_, i) => {
    c.fillStyle = i === current ? accent : i < current ? "#5C7C8E" : "#2E4757";
    c.fillRect(34 + i * 40, 268, 32, 4);
  });
}
