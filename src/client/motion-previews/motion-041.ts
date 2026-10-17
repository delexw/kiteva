import { ink, accent, clamp, ease, motionProgress, motionDrawing } from "./drawing";

/**
 * Ranked Bar Race (fictional demo data).
 * One precomputed dataset (weekly running totals) drives bar length, value label,
 * rank position, cutoff visibility and the period stamp. Hue is bound to category
 * identity, never to rank.
 * Rank changes are decomposed into pairwise neighbour swaps: each pair swaps in its
 * own short window centred where its interpolated values actually cross, and swaps
 * sharing a row are sequenced so at most two rows ever share a lane. While crossing,
 * the falling row is drawn as a thinner bar on top of the rising one so both stay
 * visible; only the falling row's label briefly yields. The final week holds.
 */

type Flavor = { name: string; hue: string; votes: [number, number, number, number] };
const FLAVORS: Flavor[] = [
  { name: "Mint", hue: "#4FD1C5", votes: [38, 70, 112, 150] },
  { name: "Mango", hue: "#F2B33D", votes: [42, 78, 110, 138] },
  { name: "Blueberry", hue: "#6FA8F5", votes: [24, 44, 80, 130] },
  { name: "Plum", hue: "#B48CF2", votes: [55, 80, 104, 126] },
  { name: "Berry", hue: "#F27A9B", votes: [30, 52, 74, 92] },
  { name: "Lime", hue: "#A6D85B", votes: [34, 50, 62, 70] },
];
// Transition windows between weeks 1→2, 2→3, 3→4; holds in between and after.
const STEPS: [number, number][] = [
  [0.5, 1.5],
  [1.9, 2.9],
  [3.3, 4.3],
];
const CHART = {
  visibleRows: 5,
  maxVotes: 160,
  barLeft: 150,
  barSpan: 380,
  labelRight: 140,
  rowTop: 100,
  rowPitch: 42,
  barHeight: 30,
};
const rowCenter = (rank: number) => CHART.rowTop + rank * CHART.rowPitch;
const CUTOFF_Y = (rowCenter(CHART.visibleRows - 1) + rowCenter(CHART.visibleRows)) / 2;
const barWidth = (votes: number) => Math.max(2, (votes / CHART.maxVotes) * CHART.barSpan);
/** 1 when `other` ranks above `row` in the given week (same strict rule as the rank). */
const ahead = (other: Flavor, row: Flavor, week: number) =>
  other.votes[week]! > row.votes[week]! ? 1 : 0;

// ---------------------------------------------------------------------------
// Precomputed pairwise swap schedule (in step-progress space, 0…1).
// ---------------------------------------------------------------------------
type Swap = { riser: number; faller: number; start: number };
const SWAP_SPAN = 0.28;
const SWAPS: Swap[][] = STEPS.map((_, step) => {
  const from = step,
    to = step + 1;
  const crossings: { riser: number; faller: number; at: number }[] = [];
  for (let i = 0; i < FLAVORS.length; i++)
    for (let j = i + 1; j < FLAVORS.length; j++) {
      const before = FLAVORS[i]!.votes[from]! - FLAVORS[j]!.votes[from]!;
      const after = FLAVORS[i]!.votes[to]! - FLAVORS[j]!.votes[to]!;
      if (Math.sign(before) === Math.sign(after)) continue;
      // Values interpolate linearly in step progress, so the difference crosses zero once.
      const at = before / (before - after);
      crossings.push(after > 0 ? { riser: i, faller: j, at } : { riser: j, faller: i, at });
    }
  crossings.sort((a, b) => a.at - b.at);
  const busyUntil = FLAVORS.map(() => 0);
  return crossings.map(({ riser, faller, at }) => {
    let start = Math.max(0, at - SWAP_SPAN / 2, busyUntil[riser]!, busyUntil[faller]!);
    start = Math.min(start, 1 - SWAP_SPAN);
    busyUntil[riser] = busyUntil[faller] = start + SWAP_SPAN;
    return { riser, faller, start };
  });
});
const swapProgress = (swap: Swap, progress: number) => ease((progress - swap.start) / SWAP_SPAN);

type Row = Flavor & {
  rankPosition: number;
  value: number;
  priority: 0 | 1 | 2; // 2 rising through a swap, 1 steady, 0 falling through a swap
  squeeze: number; // 0…1, peaks at the middle of the row's active swap
  rowAlpha: number;
  y: number;
};

/** Interpolated chart state for time t: everything below reads from this. */
function chartState(t: number) {
  const step = STEPS.reduce((current, [start], index) => (t >= start ? index : current), 0);
  const [start, end] = STEPS[step]!;
  const progress = motionProgress(t, start, end);
  const fromWeek = step,
    toWeek = step + 1;
  const swaps = SWAPS[step]!.map((swap) => ({ ...swap, k: swapProgress(swap, progress) }));
  const rows: Row[] = FLAVORS.map((flavor, index) => {
    // Continuous rank: count of rows above, with each swapping pair handing over smoothly.
    let rankPosition = 0;
    FLAVORS.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      const swap = swaps.find(
        (s) =>
          (s.riser === index && s.faller === otherIndex) ||
          (s.riser === otherIndex && s.faller === index),
      );
      if (!swap) rankPosition += ahead(other, flavor, fromWeek);
      else rankPosition += swap.riser === otherIndex ? swap.k : 1 - swap.k;
    });
    const active = swaps.find(
      (s) => (s.riser === index || s.faller === index) && s.k > 0 && s.k < 1,
    );
    const from = flavor.votes[fromWeek]!,
      to = flavor.votes[toWeek]!;
    return {
      ...flavor,
      rankPosition,
      value: from + (to - from) * progress,
      priority: !active ? 1 : active.riser === index ? 2 : 0,
      squeeze: active ? Math.sin(Math.PI * active.k) : 0,
      // Rows below the visible top five recede at the cutoff.
      rowAlpha: 1 - 0.75 * clamp(rankPosition - (CHART.visibleRows - 1)),
      y: rowCenter(rankPosition),
    };
  });
  return { rows, week: progress >= 0.5 ? toWeek : fromWeek };
}

/** Labels yield in priority order: a label fades when a higher-priority readable label is near. */
function labelAlphas(rows: Row[]) {
  const order = [...rows].sort(
    (a, b) => b.priority - a.priority || a.rankPosition - b.rankPosition,
  );
  return new Map(
    order.map((row, index) => {
      const nearest = Math.min(
        Infinity,
        ...order
          .slice(0, index)
          .filter((other) => other.rowAlpha > 0.3)
          .map((other) => Math.abs(other.y - row.y)),
      );
      return [row.name, row.rowAlpha * clamp((nearest - 16) / 14)] as const;
    }),
  );
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { circle, line } = motionDrawing(c);
  const label = (
    copy: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign,
  ) => {
    c.fillStyle = color;
    c.font = `600 ${size}px sans-serif`;
    c.textAlign = align;
    c.fillText(copy, x, y);
  };
  const { rows, week } = chartState(t);

  label("Smoothie Flavor Race", 30, 32, 22, ink, "left");
  label("DEMO DATA · fictional votes, running total", 30, 56, 16, "#9FB0BC", "left");
  for (const tick of [0, 50, 100, 150]) {
    const x = CHART.barLeft + (tick / CHART.maxVotes) * CHART.barSpan;
    line(x, 84, x, CUTOFF_Y, "#2A3B47", 1);
    label(String(tick), x, 78, 16, "#7F93A1", "center");
  }
  line(30, CUTOFF_Y, 610, CUTOFF_Y, "#3C5262", 1);
  label("top 5 shown", 610, CUTOFF_Y - 6, 16, "#7F93A1", "right");

  // Bars: rising rows first, falling rows last as a thinner bar on top, so a
  // crossing pair always shows both hues instead of one bar hiding the other.
  const drawOrder = [...rows].sort(
    (a, b) => b.priority - a.priority || b.rankPosition - a.rankPosition,
  );
  for (const row of drawOrder) {
    const height = CHART.barHeight * (1 - (row.priority === 0 ? 0.5 : 0.15) * row.squeeze);
    c.globalAlpha = row.rowAlpha;
    c.fillStyle = row.hue;
    c.beginPath();
    c.roundRect(CHART.barLeft, row.y - height / 2, barWidth(row.value), height, 6);
    c.fill();
    if (row.priority === 0 && row.squeeze > 0) {
      // Thin dark keyline keeps the falling bar's edge legible over the rising bar.
      c.strokeStyle = "#14212B";
      c.lineWidth = 1.5;
      c.stroke();
    }
  }
  // Labels after every bar, so no bar paints over a readable label.
  const alphas = labelAlphas(rows);
  for (const row of rows) {
    const alpha = alphas.get(row.name) ?? 0;
    if (alpha <= 0.01) continue;
    c.globalAlpha = alpha;
    label(row.name, CHART.labelRight, row.y + 6, 16, ink, "right");
    label(
      String(Math.round(row.value)),
      CHART.barLeft + barWidth(row.value) + 8,
      row.y + 6,
      16,
      row.hue,
      "left",
    );
  }
  c.globalAlpha = 1;
  // Period stamp and step dots advance with the same dataset index.
  label(`WEEK ${week + 1}`, 610, 340, 34, ink, "right");
  for (let step = 0; step < 4; step++)
    circle(552 + step * 18, 302, 4, step <= week ? accent : "#3C5262");
  label("Source: invented sample for this demo", 30, 340, 12, "#7F93A1", "left");
}
