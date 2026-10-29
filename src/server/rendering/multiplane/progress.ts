import { z } from "zod";
import type { RendererProgressAdapter } from "../../../shared/render-progress";

const ShotProgressSchema = z
  .object({
    renderer: z.literal("multiplane"),
    phase: z.literal("shots"),
    completed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    completedFrames: z.number().int().nonnegative().optional(),
    totalFrames: z.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      value.completed <= value.total &&
      (value.completedFrames === undefined
        ? value.totalFrames === undefined
        : value.totalFrames !== undefined && value.completedFrames <= value.totalFrames),
  );

/** Measured shot completion, shared by fresh renders and checkpoint restores. */
export function multiplaneShotProgress(completed: number, total: number) {
  const data = ShotProgressSchema.parse({
    renderer: "multiplane",
    phase: "shots",
    completed,
    total,
  });
  return { message: `Processed ${completed}/${total} Multiplane shots`, data };
}

const shotCounter = / \((\d+)\/(\d+): /;
const frameCounter = /^(capture|encode|finalize): (\d+)\/(\d+) frames$/;
export const multiplaneCheckpointReusePhase = "Reusing the Multiplane shot checkpoint";
const reusePhases = [multiplaneCheckpointReusePhase, "Reusing the validated Multiplane shot"];
const phases = [
  "Rendering the Multiplane shot",
  ...reusePhases,
  "Checking the Multiplane shot:",
  "Checking that every frame depends only on time",
  "Joining the Multiplane shots and continuous soundtrack",
];

/** Multiplane owns shot validation, segmented rendering and frame progress. */
export const multiplaneProgressAdapter: RendererProgressAdapter = {
  matches: (event) =>
    (event.type === "render_progress" && ShotProgressSchema.safeParse(event.data).success) ||
    phases.some((prefix) => event.message.startsWith(prefix)) ||
    (event.type === "render_progress" && frameCounter.test(event.message)),
  update(event, previous) {
    const measured = event.type === "render_progress" && ShotProgressSchema.safeParse(event.data);
    if (measured && measured.success) {
      const { completed, total, completedFrames, totalFrames } = measured.data;
      return {
        shot: Math.max(1, completed),
        shots: total,
        percent:
          totalFrames !== undefined && completedFrames !== undefined
            ? Math.min(99, (completedFrames / totalFrames) * 100)
            : (completed / total) * 100,
        ...(totalFrames !== undefined ? { aggregate: true } : {}),
      };
    }
    if (previous?.aggregate) return previous;
    const reused = reusePhases.some((prefix) => event.message.startsWith(prefix));
    const shot = event.message.match(shotCounter);
    if (shot) {
      const index = Number(shot[1]);
      const count = Number(shot[2]);
      if (count > 0 && index > 0 && index <= count)
        return {
          shot: index,
          shots: count,
          percent: ((index - (reused ? 0 : 1)) / count) * 100,
        };
    }
    if (reused) return { shot: 1, shots: 1, percent: 100 };
    if (event.type !== "render_progress") return previous;
    const frames = event.message.match(frameCounter);
    if (!frames) return previous;
    const done = Number(frames[2]);
    const total = Number(frames[3]);
    if (total <= 0 || done > total) return previous;
    const current = previous || { shot: 1, shots: 1, percent: 0 };
    const fraction = frames[1] === "finalize" ? done / total : Math.min(0.99, done / total);
    return {
      ...current,
      percent: Math.max(current.percent, ((current.shot - 1 + fraction) / current.shots) * 100),
    };
  },
};

export function multiplaneProgress(line: string) {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      phase?: string;
      done?: number;
      total?: number | null;
    };
    if (event.type !== "progress" || typeof event.done !== "number") return undefined;
    return event.total
      ? `${event.phase}: ${event.done}/${event.total} frames`
      : `${event.phase}: ${event.done} frames`;
  } catch {
    return undefined;
  }
}

/** Track each shot independently; frame weighting is stable when tasks finish out of order. */
export function createMultiplaneShotProgress(frameCounts: readonly number[]) {
  z.array(z.number().int().positive()).min(1).parse(frameCounts);
  const frames = frameCounts.map(() => 0);
  const completed = new Set<number>();
  const totalFrames = frameCounts.reduce((total, count) => total + count, 0);
  const snapshot = () => ({
    message: `Processed ${completed.size}/${frameCounts.length} Multiplane shots`,
    data: {
      renderer: "multiplane" as const,
      phase: "shots" as const,
      completed: completed.size,
      total: frameCounts.length,
      completedFrames: frames.reduce((total, count) => total + count, 0),
      totalFrames,
    },
  });
  const checkIndex = (index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= frames.length)
      throw Error("Invalid shot progress index");
  };
  return {
    snapshot,
    frame(index: number, line: string) {
      checkIndex(index);
      const match = line.match(frameCounter);
      if (!match) return undefined;
      const done = Number(match[2]),
        total = Number(match[3]);
      if (total <= 0 || done > total) return undefined;
      // Encoding completion is not yet a successful, validated shot export.
      const count = Math.min(
        frameCounts[index] - 1,
        Math.floor((done / total) * frameCounts[index]),
      );
      frames[index] = Math.max(frames[index], count);
      return snapshot();
    },
    complete(index: number) {
      checkIndex(index);
      completed.add(index);
      frames[index] = frameCounts[index];
      return snapshot();
    },
  };
}
