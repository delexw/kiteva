import { expect, it } from "vitest";
import {
  activityScope,
  activityEventData,
  bindActivityCallback,
} from "../src/server/jobs/activity-scope";
import type { ActivityScope } from "../src/shared/activity-scopes";
import { WorkQueue } from "../src/server/jobs/queue";

const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

it("inherits ownership at arbitrary depth and completes children before their parents", async () => {
  const events: ActivityScope[] = [];
  const leaves: unknown[] = [];
  const descend = (level: number): Promise<void> =>
    activityScope(`Level ${level}`, async () => {
      leaves.push(activityEventData({ level }));
      if (level < 12) await descend(level + 1);
    });
  await activityScope("Root", () => descend(1), { onScope: (e) => events.push(e) });
  const starts = events.filter((e) => e.state === "running");
  expect(starts).toHaveLength(13);
  starts.slice(1).forEach((e, index) => expect(e.parentId).toBe(starts[index].id));
  expect(events.filter((e) => e.state === "complete").map((e) => e.id)).toEqual(
    starts.map((e) => e.id).reverse(),
  );
  expect(leaves[11]).toEqual({ level: 12, activityScopeId: starts[12].id });
});

it("keeps concurrent projects, delayed callbacks and queued tasks in their own contexts", async () => {
  const queue = new WorkQueue(1);
  const blocker = gate();
  const busy = queue.run(() => blocker.promise);
  const events: ActivityScope[] = [];
  const seen: unknown[] = [];
  let callback!: () => void;
  const a = activityScope(
    "Project A",
    async () => {
      callback = bindActivityCallback(() => seen.push(activityEventData({ source: "callback" })));
      await queue.run(() =>
        activityScope("Queued A", async () => {
          seen.push(activityEventData({ source: "queue" }));
        }),
      );
    },
    { onScope: (e) => events.push(e) },
  );
  const b = activityScope(
    "Project B",
    async () => {
      callback();
      blocker.release();
      await busy;
    },
    { onScope: (e) => events.push(e) },
  );
  await Promise.all([a, b]);
  const rootA = events.find((e) => e.label === "Project A")!;
  const queuedA = events.find((e) => e.label === "Queued A")!;
  expect(queuedA.parentId).toBe(rootA.id);
  expect(seen).toEqual([
    { source: "callback", activityScopeId: rootA.id },
    { source: "queue", activityScopeId: queuedA.id },
  ]);
  expect(activityEventData({ outside: true })).toEqual({ outside: true });
});

it("records failed and successful retries as separate siblings and propagates uncaught failures", async () => {
  const events: ActivityScope[] = [];
  await activityScope(
    "Recovery",
    async () => {
      await expect(
        activityScope("Attempt", async () => {
          throw Error("first");
        }),
      ).rejects.toThrow("first");
      await activityScope("Attempt", async () => {});
    },
    { onScope: (e) => events.push(e) },
  );
  const attempts = events.filter((e) => e.label === "Attempt" && e.state === "running");
  expect(attempts).toHaveLength(2);
  expect(attempts[0].id).not.toBe(attempts[1].id);
  expect(attempts[0].parentId).toBe(attempts[1].parentId);
  expect(events.find((e) => e.id === attempts[0].id && e.state === "failed")).toBeDefined();
  expect(events.at(-1)?.state).toBe("complete");
  await expect(
    activityScope(
      "Failure",
      () =>
        activityScope("Child", async () => {
          throw Error("failed");
        }),
      { onScope: (e) => events.push(e) },
    ),
  ).rejects.toThrow("failed");
  expect(events.slice(-2).map((e) => e.state)).toEqual(["failed", "failed"]);
});

it("waits for child scopes and reports cancellation instead of a false success", async () => {
  const events: ActivityScope[] = [];
  const child = gate();
  const controller = new AbortController();
  const work = activityScope(
    "Parent",
    async () => {
      void activityScope("Child", () => child.promise);
    },
    { signal: controller.signal, onScope: (e) => events.push(e) },
  );
  await Promise.resolve();
  expect(events.some((e) => e.state === "complete")).toBe(false);
  controller.abort();
  child.release();
  await expect(work).rejects.toThrow();
  expect(events.at(-1)?.state).toBe("stopped");
  expect(events.some((e) => e.state === "complete")).toBe(false);
});

it("keeps nested ownership when an ancestor-bound callback is called by child work", async () => {
  const events: ActivityScope[] = [];
  const seen: unknown[] = [];
  await activityScope(
    "Root",
    async () => {
      const emit = bindActivityCallback(() => seen.push(activityEventData()));
      await activityScope("Child", async () => {
        emit();
        await activityScope("Grandchild", async () => {
          emit();
        });
      });
    },
    { onScope: (event) => events.push(event) },
  );
  const starts = events.filter((event) => event.state === "running");
  expect(seen).toEqual(starts.slice(1).map((event) => ({ activityScopeId: event.id })));
});
