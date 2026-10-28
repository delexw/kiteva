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
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => setTimeout(() => callback(0), 16)),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn(clearTimeout));
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

it("commits a live burst on the next frame instead of waiting 100ms", () => {
  const receive = vi.fn(),
    refresh = vi.fn();
  const stop = subscribeProjectEvents("project", receive, refresh);
  const source = TestEventSource.latest;
  for (let id = 1; id <= 20; id++)
    source.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event(id)) }));
  vi.advanceTimersByTime(15);
  expect(receive).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(receive).toHaveBeenCalledExactlyOnceWith(
    Array.from({ length: 20 }, (_, index) => event(index + 1)),
  );
  vi.advanceTimersByTime(100);
  expect(receive).toHaveBeenCalledOnce();
  expect(refresh).not.toHaveBeenCalled();
  stop();
});

it("keeps project refreshes throttled across multiple live frames", () => {
  const receive = vi.fn(),
    refresh = vi.fn();
  const stop = subscribeProjectEvents("project", receive, refresh);
  const source = TestEventSource.latest;
  for (let id = 1; id <= 5; id++) {
    source.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event(id, "state")) }));
    vi.advanceTimersByTime(16);
  }
  expect(receive).toHaveBeenCalledTimes(5);
  expect(refresh).not.toHaveBeenCalled();
  vi.advanceTimersByTime(20);
  expect(refresh).toHaveBeenCalledOnce();
  stop();
});

it("flushes live events in background tabs when animation frames are paused", () => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const receive = vi.fn();
  const stop = subscribeProjectEvents("project", receive, vi.fn());
  TestEventSource.latest.onmessage?.(
    new MessageEvent("message", { data: JSON.stringify(event(1)) }),
  );
  vi.advanceTimersByTime(100);
  expect(receive).toHaveBeenCalledExactlyOnceWith([event(1)]);
  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  stop();
});

it("coalesces a pending history replay with live events without losing their order", () => {
  const receive = vi.fn();
  const stop = subscribeProjectEvents("project", receive, vi.fn());
  const source = TestEventSource.latest;
  source.dispatchEvent(new MessageEvent("history", { data: JSON.stringify([event(1), event(2)]) }));
  source.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event(3)) }));
  vi.advanceTimersByTime(16);
  expect(receive).toHaveBeenCalledExactlyOnceWith([event(1), event(2), event(3)]);
  vi.advanceTimersByTime(100);
  expect(receive).toHaveBeenCalledOnce();
  stop();
});

it("uses a bounded lightweight subscription and releases pending data on disposal", () => {
  const receive = vi.fn();
  const stop = subscribeProjectEvents("project", receive, vi.fn(), { view: "summary" });
  const source = TestEventSource.latest;
  expect(source.url).toContain("view=summary");
  source.dispatchEvent(
    new MessageEvent("history", {
      data: JSON.stringify(Array.from({ length: 5000 }, (_, id) => event(id))),
    }),
  );
  vi.advanceTimersByTime(100);
  expect(receive.mock.calls[0][0]).toHaveLength(256);
  expect(receive.mock.calls[0][0].at(-1).id).toBe(4999);
  stop();
  vi.runAllTimers();
  expect(source.close).toHaveBeenCalledOnce();
});
