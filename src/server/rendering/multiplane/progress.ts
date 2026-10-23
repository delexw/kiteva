import type { RendererProgressAdapter } from "../../../shared/render-progress";

const shotCounter = / \((\d+)\/(\d+): /;
const frameCounter = /^(capture|encode|finalize): (\d+)\/(\d+) frames$/;
const phases = [
  "Rendering the Multiplane shot",
  "Reusing the validated Multiplane shot",
  "Checking the Multiplane shot:",
  "Checking that every frame depends only on time",
  "Joining the Multiplane shots and continuous soundtrack",
];

/** Multiplane owns shot validation, segmented rendering and frame progress. */
export const multiplaneProgressAdapter: RendererProgressAdapter = {
  matches: (event) =>
    phases.some((prefix) => event.message.startsWith(prefix)) ||
    (event.type === "render_progress" && frameCounter.test(event.message)),
  update(event, previous) {
    const shot = event.message.match(shotCounter);
    if (shot) {
      const index = Number(shot[1]);
      const count = Number(shot[2]);
      if (count > 0 && index > 0 && index <= count)
        return {
          shot: index,
          shots: count,
          percent:
            ((index - (event.message.startsWith("Reusing the validated Multiplane shot") ? 0 : 1)) /
              count) *
            100,
        };
    }
    if (event.message.startsWith("Reusing the validated Multiplane shot"))
      return { shot: 1, shots: 1, percent: 100 };
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
