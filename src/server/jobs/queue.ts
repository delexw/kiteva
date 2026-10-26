import { AsyncResource } from "node:async_hooks";
export class WorkQueue {
  private active = 0;
  private idleWaiters = new Set<() => void>();
  private tasks: Array<{
    task: () => Promise<unknown>;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
    detach: () => void;
  }> = [];
  constructor(private limit: number) {}
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const entry = {
        task: AsyncResource.bind(async () => {
          signal?.throwIfAborted();
          return task();
        }),
        resolve: resolve as (v: unknown) => void,
        reject,
        detach: () => signal?.removeEventListener("abort", abort),
      };
      const abort = () => {
        const index = this.tasks.indexOf(entry);
        if (index < 0) return;
        this.tasks.splice(index, 1);
        entry.detach();
        reject(signal?.reason);
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.tasks.push(entry);
      this.pump();
    });
  }
  whenIdle(): Promise<void> {
    if (!this.active && !this.tasks.length) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }
  private pump() {
    if (!this.active && !this.tasks.length) {
      for (const resolve of this.idleWaiters) resolve();
      this.idleWaiters.clear();
    }
    while (this.active < this.limit && this.tasks.length) {
      const next = this.tasks.shift()!;
      next.detach();
      this.active++;
      void Promise.resolve()
        .then(next.task)
        .then(next.resolve, next.reject)
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
}
