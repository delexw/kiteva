import { AsyncLocalStorage } from "node:async_hooks";
import { addAbortListener } from "node:events";
import { subscribe } from "node:diagnostics_channel";
import type { ChildProcess } from "node:child_process";
import { snapshotProcessTree, terminateProcessTree, DependencyCleanupError } from "./process-tree";

const owners = new AsyncLocalStorage<Set<ChildProcess>>();
// Node publishes this before spawn returns, including children launched inside SDKs.
subscribe("child_process", (message) => {
  owners.getStore()?.add((message as { process: ChildProcess }).process);
});

/** A caller-owned lifetime for processes, including resources returned by a factory. */
export function createProcessScope(signal: AbortSignal) {
  signal.throwIfAborted();
  const children = new Set<ChildProcess>();
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  const drain = async () => {
    while (children.size) {
      const batch = [...children];
      for (const child of batch) children.delete(child);
      const snapshots = await Promise.all(
        batch.map(async (child) => {
          try {
            return { pid: child.pid, descendants: await snapshotProcessTree(child.pid) };
          } catch (error) {
            return { pid: child.pid, descendants: [], error };
          }
        }),
      );
      // Forward abort only after every root's ownership has been captured.
      controller.abort(signal.reason);
      await Promise.all(
        snapshots.map(({ pid, descendants }) =>
          terminateProcessTree(pid, { descendants, close: async () => {}, graceMs: 2500 }),
        ),
      );
      const failed = snapshots.find((snapshot) => "error" in snapshot);
      if (failed && "error" in failed) throw new DependencyCleanupError(failed.error);
    }
    controller.abort(signal.reason);
  };
  const close = () => (closing ??= owners.exit(drain));
  const cancellation = addAbortListener(signal, () => {
    void close().catch(() => {});
  });
  let finished: Promise<void> | undefined;
  return {
    run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
      controller.signal.throwIfAborted();
      return owners.run(children, () => work(controller.signal));
    },
    close(): Promise<void> {
      return (finished ??= (async () => {
        cancellation[Symbol.dispose]();
        await close();
        await owners.exit(drain);
      })());
    },
  };
}

/** Keep SDK cancellation graceful, but retain ownership until all its dependencies exit. */
export async function withProcessScope<T>(
  signal: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const scope = createProcessScope(signal);
  try {
    const result = await scope.run(work);
    signal.throwIfAborted();
    return result;
  } finally {
    await scope.close();
  }
}
