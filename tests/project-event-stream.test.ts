import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subscribeProjectEvents } from "../src/client/lib/project-event-stream";
import type { AgentProgressEvent } from "../src/shared/contracts";

class TestEventSource extends EventTarget {
  static latest: TestEventSource;
  onmessage?: (event: MessageEvent) => void;
  onopen?: () => void;
  close = vi.fn();
  constructor(public url: string) {
    super();
    TestEventSource.latest = this;
  }
}
const event = (id: number, type = "render_progress"): AgentProgressEvent => ({
  id,
  type,
  runId: "project",
  message: "Update",
  time: "2026-01-01T00:00:00Z",
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", TestEventSource);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("commits a large history in one update and refreshes state once", () => {
  const receive = vi.fn(),
    refresh = vi.fn();
  const stop = subscribeProjectEvents("project", receive, refresh);
  const source = TestEventSource.latest;
  expect(source.url).toBe("/api/runs/project/events?batch=1");
  const history = Array.from({ length: 26500 }, (_, id) =>
    event(id, id % 100 ? "render_progress" : "state"),
  );
  for (let offset = 0; offset < history.length; offset += 500) {
    source.dispatchEvent(
      new MessageEvent("history", { data: JSON.stringify(history.slice(offset, offset + 500)) }),
    );
  }
  expect(receive).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(receive).toHaveBeenCalledExactlyOnceWith(history);
  expect(refresh).toHaveBeenCalledOnce();
  stop();
});

it("deduplicates reconnect history and live events without losing order", () => {
  const receive = vi.fn(),
    refresh = vi.fn();
  const stop = subscribeProjectEvents("project", receive, refresh);
  const source = TestEventSource.latest;
  source.onopen?.();
  expect(refresh).not.toHaveBeenCalled();
  source.dispatchEvent(new MessageEvent("history", { data: JSON.stringify([event(1), event(2)]) }));
  source.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event(2)) }));
  source.onmessage?.(
    new MessageEvent("message", { data: JSON.stringify(event(3, "interrupted")) }),
  );
  vi.advanceTimersByTime(100);
  expect(receive).toHaveBeenCalledExactlyOnceWith([event(1), event(2), event(3, "interrupted")]);
  source.onopen?.();
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
});

it("discards pending work and closes the stream when leaving a project", () => {
  const receive = vi.fn(),
    refresh = vi.fn();
  const stop = subscribeProjectEvents("project", receive, refresh);
  const source = TestEventSource.latest;
  source.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event(1, "state")) }));
  stop();
  source.onopen?.();
  source.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event(2, "state")) }));
  vi.runAllTimers();
  expect(source.close).toHaveBeenCalledOnce();
  expect(receive).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
