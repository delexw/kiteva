import type { RenderProgress, RendererProgressAdapter } from "../../../shared/render-progress";

const frameCounter =
  /\b(Rendered|Rendering|Encoded|Encoding|Muxed|Muxing)\s+(?:(?:frames|video|audio|GIF|still)\s+)?[^\r\n]*?(\d+)\/(\d+)/;

/** Remotion owns both its non-TTY subtitles and terminal frame counters. */
export const remotionProgress: RendererProgressAdapter = {
  matches: (event) => event.type === "render_progress" && frameCounter.test(event.message),
  update(event, previous) {
    const current = previous || { shot: 1, shots: 1, percent: 0 };
    let result: RenderProgress | undefined;
    for (const line of event.message.split(/[\r\n]+/)) {
      const frames = line.match(frameCounter);
      if (!frames) continue;
      const done = Number(frames[2]);
      const total = Number(frames[3]);
      if (total <= 0 || done > total) continue;
      const percent = /^(Encoded|Muxed)$/.test(frames[1])
        ? (done / total) * 100
        : Math.min(99, (done / total) * 100);
      result = { ...current, percent: Math.max(current.percent, result?.percent ?? 0, percent) };
    }
    return result;
  },
};
