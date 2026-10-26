import { expect, it, vi } from "vitest";
import { WorkQueue } from "../src/server/jobs/queue";

it("removes cancelled queued work immediately without disturbing another owner", async () => {
  const queue = new WorkQueue(1);
  let release!: () => void;
  const running = queue.run(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await vi.waitFor(() => expect(release).toBeDefined());
  const controller = new AbortController();
  const work = vi.fn(async () => {});
  const waiting = queue.run(work, controller.signal);
  const rejected = expect(waiting).rejects.toThrow("Stop project");
  controller.abort(Error("Stop project"));
  await rejected;
  expect(work).not.toHaveBeenCalled();
  release();
  await running;
  await queue.run(work);
  expect(work).toHaveBeenCalledOnce();
});

it("does not launch a task cancelled before its first microtask", async () => {
  const queue = new WorkQueue(1);
  const controller = new AbortController();
  const work = vi.fn(async () => {});
  const running = queue.run(work, controller.signal);
  controller.abort(Error("Cancelled"));
  await expect(running).rejects.toThrow("Cancelled");
  expect(work).not.toHaveBeenCalled();
});

it("waits for active cleanup before reporting the queue idle", async () => {
  const queue = new WorkQueue(1);
  let release!: () => void;
  const running = queue.run(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await vi.waitFor(() => expect(release).toBeDefined());
  let idle = false;
  const drained = queue.whenIdle().then(() => {
    idle = true;
  });
  expect(idle).toBe(false);
  release();
  await Promise.all([running, drained]);
  expect(idle).toBe(true);
});
