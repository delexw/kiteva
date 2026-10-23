import type { AgentProgressEvent } from "../../shared/contracts";
import type { RenderProgress, RendererProgressAdapter } from "../../shared/render-progress";
import { hyperframesProgress } from "./hyperframes/progress";
import { multiplaneProgressAdapter } from "./multiplane/progress";
import { remotionProgress } from "./remotion/progress";

const adapters: readonly RendererProgressAdapter[] = [
  hyperframesProgress,
  multiplaneProgressAdapter,
  remotionProgress,
];
const startsRender = (event: AgentProgressEvent) =>
  event.type === "phase" &&
  ["Rendering preview", "Rendering validated composition"].includes(event.message);

/** Dispatch only: renderer output formats belong to the individual adapters. */
export function isRendererProgressEvent(event: AgentProgressEvent): boolean {
  return (
    event.type === "render_progress" ||
    startsRender(event) ||
    adapters.some((adapter) => adapter.matches(event))
  );
}

export function renderProgressUpdate(
  event: AgentProgressEvent,
  previous?: RenderProgress,
): RenderProgress | undefined {
  if (startsRender(event)) return { shot: 1, shots: 1, percent: 0 };
  if (event.type === "render_progress" && event.message.trim() === "Render complete")
    return { ...(previous || { shot: 1, shots: 1 }), percent: 100 };
  for (const adapter of adapters) {
    if (!adapter.matches(event)) continue;
    const progress = adapter.update(event, previous);
    if (progress) return progress;
  }
  return previous;
}
