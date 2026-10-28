import {
  projectActivityEvent,
  summaryEventLimit,
  mergeActivityEvents,
} from "../../shared/project-activity";
import type { AgentProgressEvent } from "../../shared/contracts";
import { normalizeSubtitleFields } from "../../shared/subtitle-compatibility";

/** Batch history separately; commit live bursts on the next paint without per-event state copies. */
export function subscribeProjectEvents(
  runId: string,
  receive: (events: AgentProgressEvent[]) => void,
  refresh: () => void,
  options: { view?: "summary" | "activity"; after?: number } = {},
) {
  const query = new URLSearchParams({ batch: "1" });
  if (options.view) query.set("view", options.view);
  if (options.after !== undefined) query.set("after", String(options.after));
  const stream = new EventSource(`/api/runs/${runId}/events?${query}`);
  const seen = new Set<number>();
  let pending: AgentProgressEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let frame: number | undefined;
  let connected = false;
  let disposed = false;
  const flush = () => {
    clearTimeout(timer);
    if (frame !== undefined) cancelAnimationFrame(frame);
    timer = undefined;
    frame = undefined;
    if (disposed) return;
    const batch = pending;
    pending = [];
    if (batch.length) receive(batch);
  };
  const enqueue = (events: AgentProgressEvent[], history = false) => {
    if (disposed) return;
    let added = false;
    for (const incoming of events) {
      const event = options.view ? projectActivityEvent(incoming) : incoming;
      if (!event) continue;
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      if (options.view && seen.size > 1000) seen.delete(seen.values().next().value!);
      pending.push(event);
      added = true;
      if (["state", "preview_ready", "interrupted"].includes(event.type))
        refreshTimer ??= setTimeout(() => {
          refreshTimer = undefined;
          if (!disposed) refresh();
        }, 100);
    }
    if (!added) return;
    if (options.view)
      pending = mergeActivityEvents(
        [],
        pending,
        options.view === "summary" ? summaryEventLimit : 500,
      );
    // History stays coalesced, and hidden tabs still receive updates when frames are paused.
    timer ??= setTimeout(flush, 100);
    if (!history && frame === undefined) frame = requestAnimationFrame(flush);
  };
  stream.addEventListener("history", (event) => {
    enqueue(normalizeSubtitleFields(JSON.parse(event.data)) as AgentProgressEvent[], true);
  });
  stream.onmessage = (event) => {
    enqueue([normalizeSubtitleFields(JSON.parse(event.data)) as AgentProgressEvent]);
  };
  stream.onopen = () => {
    if (disposed) return;
    if (connected) refresh();
    connected = true;
  };
  return () => {
    disposed = true;
    clearTimeout(timer);
    clearTimeout(refreshTimer);
    if (frame !== undefined) cancelAnimationFrame(frame);
    pending = [];
    seen.clear();
    stream.close();
  };
}
