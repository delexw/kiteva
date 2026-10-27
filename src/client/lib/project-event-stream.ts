import type { AgentProgressEvent } from "../../shared/contracts";
import { normalizeSubtitleFields } from "../../shared/subtitle-compatibility";

/** Commit replay and live events in batches instead of copying React state per event. */
export function subscribeProjectEvents(
  runId: string,
  receive: (events: AgentProgressEvent[]) => void,
  refresh: () => void,
) {
  const stream = new EventSource(`/api/runs/${runId}/events?batch=1`);
  const seen = new Set<number>();
  let pending: AgentProgressEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let needsRefresh = false;
  let connected = false;
  let disposed = false;
  const flush = () => {
    timer = undefined;
    const batch = pending;
    pending = [];
    if (batch.length) receive(batch);
    if (needsRefresh) {
      needsRefresh = false;
      refresh();
    }
  };
  const enqueue = (events: AgentProgressEvent[]) => {
    if (disposed) return;
    for (const event of events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      pending.push(event);
      if (["state", "preview_ready", "interrupted"].includes(event.type)) needsRefresh = true;
    }
    timer ??= setTimeout(flush, 100);
  };
  stream.addEventListener("history", (event) => {
    enqueue(normalizeSubtitleFields(JSON.parse(event.data)) as AgentProgressEvent[]);
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
    stream.close();
  };
}
