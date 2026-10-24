import { AsyncResource } from "node:async_hooks";
export class WorkQueue {
  private active = 0;
  private tasks: Array<{
    task: () => Promise<unknown>;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }> = [];
  constructor(private limit: number) {}
  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.tasks.push({
        task: AsyncResource.bind(task),
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.pump();
    });
  }
  private pump() {
    while (this.active < this.limit && this.tasks.length) {
      const next = this.tasks.shift()!;
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
