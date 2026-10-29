import type { AgentProgressEvent } from "./contracts";

export interface RenderProgress {
  shot: number;
  shots: number;
  percent: number;
  aggregate?: boolean;
}

/** Pure adapters can normalize saved events in the browser without renderer runtimes. */
export interface RendererProgressAdapter {
  matches(event: AgentProgressEvent): boolean;
  update(event: AgentProgressEvent, previous?: RenderProgress): RenderProgress | undefined;
}
