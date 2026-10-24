import { clamp } from "./drawing";

/**
 * Step-Tick Slot Refill.
 * A fixed set of slot lanes advances on one discrete step clock. On every tick each
 * active lane gains exactly one token and the STEP counter increments. On the tick a
 * lane's request reaches its length, its strip clears, the lane shows the completion
 * fill for that one step and the finished request icon exits right past the lane end.
 * On the next tick a new request takes that same lane with its first token, while every
 * other lane keeps its own progress. Lanes never reorder and no waiting queue is drawn:
 * the order of new requests is authored data, not on-screen content. The schedule is
 * recomputed from step 0 for every query, so any frame is a pure function of time.
 */

export const LANE_COUNT = 4;
/** Tick instants: first tick, interval and count; the remaining time is a reading hold. */
export const TICKS = { first: 0.6, interval: 0.4, count: 11 } as const;
/** Duration of the finished icon's exit to the right (shorter than one step). */
export const EXIT_DURATION = 0.3;
/** Exit travel is stepped in whole logical pixels of this size. */
export const EXIT_STEP_PX = 4;
export const FINAL_TICK_TIME = TICKS.first + (TICKS.count - 1) * TICKS.interval;

export interface WorkItem {
  id: string;
  length: number;
  color: string;
}
/** Requests already in the lanes at step 0, with the tokens they have already produced. */
export const INITIAL: readonly { item: WorkItem; progress: number }[] = [
  { item: { id: "A", length: 4, color: "#F28A2E" }, progress: 2 },
  { item: { id: "B", length: 6, color: "#3DB3A6" }, progress: 1 },
  { item: { id: "C", length: 3, color: "#F7C948" }, progress: 1 },
  { item: { id: "D", length: 5, color: "#9C7BEA" }, progress: 2 },
];
/**
 * Authored order of new requests. They are never drawn before they take a freed lane;
 * every length is at least 2 so a running request is visible after its first token.
 */
export const ARRIVALS: readonly WorkItem[] = [
  { id: "E", length: 4, color: "#E5484D" },
  { id: "F", length: 3, color: "#5DC26A" },
  { id: "G", length: 5, color: "#F28A2E" },
  { id: "H", length: 3, color: "#3DB3A6" },
  { id: "I", length: 4, color: "#F7C948" },
  { id: "J", length: 3, color: "#9C7BEA" },
  { id: "K", length: 6, color: "#E5484D" },
  { id: "L", length: 5, color: "#5DC26A" },
  { id: "M", length: 4, color: "#F28A2E" },
  { id: "N", length: 5, color: "#3DB3A6" },
];

export type LanePhase = "running" | "done" | "entered" | "idle";
export interface LaneState {
  item: WorkItem | null;
  progress: number;
  phase: LanePhase;
}
export interface Snapshot {
  step: number;
  lanes: LaneState[];
  /** Requests taken from ARRIVALS so far. */
  arrived: number;
  /** Requests that have finished and exited. */
  served: number;
}

/** Number of ticks that have fired by `time` (0 before the first tick). */
export function stepAt(time: number) {
  if (time < TICKS.first) return 0;
  return Math.min(TICKS.count, Math.floor((time - TICKS.first) / TICKS.interval + 1e-9) + 1);
}
export function tickTime(step: number) {
  return TICKS.first + (step - 1) * TICKS.interval;
}

/** Pure schedule: replays the authored rules from step 0 to `step` with no retained state. */
export function snapshot(step: number): Snapshot {
  let lanes: LaneState[] = INITIAL.map(({ item, progress }) => ({
    item,
    progress,
    phase: progress >= item.length ? "done" : "running",
  }));
  let arrived = 0;
  let served = 0;
  for (let s = 1; s <= step; s++) {
    lanes = lanes.map((lane) => {
      if (lane.phase === "done" || lane.phase === "idle") {
        const next = ARRIVALS[arrived];
        if (!next) return { item: null, progress: 0, phase: "idle" };
        arrived++;
        return { item: next, progress: 1, phase: "entered" };
      }
      const item = lane.item!;
      const progress = lane.progress + 1;
      if (progress >= item.length) {
        served++;
        return { item, progress: item.length, phase: "done" };
      }
      return { item, progress, phase: "running" };
    });
  }
  return { step, lanes, arrived, served };
}

/** Lane geometry of the 640 × 360 study. */
export const LAYOUT = {
  laneX: 112,
  laneY: 92,
  laneW: 432,
  laneH: 46,
  gap: 12,
  cell: 26,
  cellGap: 4,
  tokenX: 76,
  exitEndX: 652,
} as const;
export const laneTop = (lane: number) => LAYOUT.laneY + lane * (LAYOUT.laneH + LAYOUT.gap);
export const cellLeft = (index: number) =>
  LAYOUT.laneX + 64 + index * (LAYOUT.cell + LAYOUT.cellGap);
export const tokenY = (lane: number) => laneTop(lane) + LAYOUT.laneH / 2 - 14;

/** Whole-pixel exit position of a finished icon, or null once it has left the frame. */
export function exitX(since: number) {
  if (since < 0 || since >= EXIT_DURATION) return null;
  const p = clamp(since / EXIT_DURATION);
  // Accelerate out of the lane head (ease-in), snapped to the logical pixel step.
  const x = LAYOUT.tokenX + (LAYOUT.exitEndX - LAYOUT.tokenX) * p * p;
  return Math.round(x / EXIT_STEP_PX) * EXIT_STEP_PX;
}

/** Visible frame state: snapshot plus the in-flight exit of each icon finished on this tick. */
export function refillState(time: number) {
  const step = stepAt(time);
  const now = snapshot(step);
  const since = step === 0 ? Infinity : time - tickTime(step);
  const exiting = now.lanes.map((lane) =>
    lane.phase === "done" && lane.item ? exitX(since) : null,
  );
  return { ...now, exiting };
}

/** Number of tokens drawn in a lane: a finished lane's strip is already cleared. */
export function visibleCells(state: ReturnType<typeof refillState>, lane: number) {
  const current = state.lanes[lane];
  return current.phase === "done" || current.phase === "idle" ? 0 : current.progress;
}

export const C = {
  ground: "#1C1F2E",
  grid: "#232739",
  lane: "#2A2E44",
  doneLane: "#3F6E4C",
  ink: "#11121B",
  cream: "#F4EEDC",
  label: "#C9CCDC",
  muted: "#8D90A6",
  accent: "#F28A2E",
} as const;
const FONT = (size: number, weight = 700) => `${weight} ${size}px ui-monospace, Menlo, monospace`;

/** Draw text with explicit fill, font and alignment so no state leaks between rows. */
function text(
  c: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  color: string,
  size: number,
  align: CanvasTextAlign,
  weight = 700,
) {
  c.save();
  c.fillStyle = color;
  c.font = FONT(size, weight);
  c.textAlign = align;
  c.fillText(value, x, y);
  c.restore();
}

function token(c: CanvasRenderingContext2D, x: number, y: number, color: string, id: string) {
  const px = Math.round(x);
  const py = Math.round(y);
  c.save();
  c.fillStyle = C.ink;
  c.fillRect(px - 2, py - 2, 28, 32);
  c.fillStyle = C.cream;
  c.fillRect(px, py, 24, 28);
  c.fillStyle = color;
  c.fillRect(px, py, 24, 8);
  c.restore();
  text(c, id, px + 12, py + 23, C.ink, 13, "center");
}

/** Cleared lane head: an empty outline where the finished icon stood. */
function emptyHead(c: CanvasRenderingContext2D, x: number, y: number) {
  c.save();
  c.fillStyle = C.muted;
  c.fillRect(x, y, 24, 2);
  c.fillRect(x, y + 26, 24, 2);
  c.fillRect(x, y, 2, 28);
  c.fillRect(x + 22, y, 2, 28);
  c.restore();
}

export function caption(state: ReturnType<typeof refillState>) {
  if (state.step === 0) return "ONE TICK = ONE TOKEN PER SLOT";
  if (state.lanes.some((lane) => lane.phase === "done")) return "A FINISHED REQUEST LEAVES AT ONCE";
  if (state.lanes.some((lane) => lane.phase === "entered"))
    return "A NEW REQUEST TAKES THE FREED SLOT";
  return "EVERY ACTIVE SLOT GAINS ONE TOKEN";
}

export default function motion049(c: CanvasRenderingContext2D, time: number) {
  const state = refillState(time);
  c.save();
  c.fillStyle = C.ground;
  c.fillRect(0, 0, 640, 360);
  c.fillStyle = C.grid;
  for (let x = 0; x < 640; x += 16) c.fillRect(x, 0, 1, 360);
  for (let y = 0; y < 360; y += 16) c.fillRect(0, y, 640, 1);
  c.restore();

  const right = LAYOUT.laneX + LAYOUT.laneW;
  text(c, "SLOTS", LAYOUT.laneX, 72, C.cream, 15, "left");
  text(c, `STEP ${String(state.step).padStart(2, "0")}`, right, 72, C.accent, 15, "right");
  text(c, `SERVED ${String(state.served).padStart(2, "0")}`, right, 40, C.label, 12, "right");

  state.lanes.forEach((lane, index) => {
    const top = laneTop(index);
    const done = lane.phase === "done";
    c.save();
    c.fillStyle = done ? C.doneLane : C.lane;
    c.fillRect(LAYOUT.laneX, top, LAYOUT.laneW, LAYOUT.laneH);
    c.restore();
    // Every lane label sets its own colour: identical, light and readable in every phase.
    text(c, `SLOT ${index + 1}`, 24, top + 28, C.label, 11, "left");
    const headY = tokenY(index);
    if (done || !lane.item) emptyHead(c, LAYOUT.tokenX, headY);
    else token(c, LAYOUT.tokenX, headY, lane.item.color, lane.item.id);
    const cells = visibleCells(state, index);
    for (let i = 0; i < cells; i++) {
      c.save();
      c.fillStyle = lane.item!.color;
      c.fillRect(cellLeft(i), top + 10, LAYOUT.cell, LAYOUT.laneH - 20);
      c.restore();
    }
    if (done) text(c, "DONE", right - 12, top + 29, C.cream, 14, "right");
  });

  // Finished icons travel out past the lane end on top of everything else.
  state.exiting.forEach((x, index) => {
    const item = state.lanes[index].item;
    if (x !== null && item) token(c, x, tokenY(index), item.color, item.id);
  });

  text(c, caption(state), 320, 338, C.cream, 13, "center", 600);
}
