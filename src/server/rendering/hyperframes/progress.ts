import type { RenderProgress, RendererProgressAdapter } from "../../../shared/render-progress";

/** HyperFrames owns its native progress records and completion display format. */
export const hyperframesProgress: RendererProgressAdapter = {
  matches: (event) =>
    event.type === "render_progress" && /@hf-progress |100%\s+Render complete/.test(event.message),
  update(event, previous) {
    const current = previous || { shot: 1, shots: 1, percent: 0 };
    let result: RenderProgress | undefined;
    for (const line of event.message.split(/[\r\n]+/)) {
      const machine = line.match(/@hf-progress (\{.*\})/);
      if (machine) {
        try {
          const progress: { pct?: unknown } = JSON.parse(machine[1]);
          if (
            typeof progress.pct === "number" &&
            Number.isFinite(progress.pct) &&
            progress.pct >= 0 &&
            progress.pct <= 100
          )
            result = {
              ...current,
              percent: Math.max(current.percent, result?.percent ?? 0, progress.pct),
            };
        } catch {
          /* Incomplete chunks are followed by later native updates. */
        }
      }
      if (/100%\s+Render complete/.test(line)) result = { ...current, percent: 100 };
    }
    return result;
  },
};
