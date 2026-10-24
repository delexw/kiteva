import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { ActivityScope } from "../../shared/activity-scopes";
import { InputRequired } from "../../shared/input-checkpoint";

type ScopeContext = {
  parent?: ScopeContext;
  scope: ActivityScope;
  onScope: (scope: ActivityScope) => void;
  signal?: AbortSignal;
  children: Set<Promise<unknown>>;
};
const contexts = new AsyncLocalStorage<ScopeContext>();

/** Associate events at the orchestrating caller; persistence and transport stay unaware of scopes. */
export function activityEventData(data?: unknown) {
  const scope = contexts.getStore();
  if (!scope) return data;
  const fields = data && typeof data === "object" ? data : {};
  if ("activityScopeId" in fields && typeof fields.activityScopeId === "string") return data;
  return { ...fields, activityScopeId: scope.scope.id };
}

/** Preserve ownership when an SDK or external callback runs outside its caller's async context. */
export function bindActivityCallback<T extends (...args: never[]) => unknown>(callback: T): T {
  const scope = contexts.getStore();
  if (!scope) return callback;
  return ((...args: Parameters<T>) => {
    let current = contexts.getStore();
    while (current) {
      if (current === scope) return callback(...args);
      current = current.parent;
    }
    return contexts.run(scope, () => callback(...args));
  }) as T;
}

/** Any nested call inherits its parent; retries create new siblings instead of resetting a counter. */
export function activityScope<T>(
  label: string,
  task: () => Promise<T>,
  options: {
    onScope?: ScopeContext["onScope"];
    signal?: AbortSignal;
    completionState?: () => ActivityScope["state"];
  } = {},
): Promise<T> {
  const parent = contexts.getStore();
  const onScope = options.onScope || parent?.onScope;
  if (!onScope) {
    try {
      return task();
    } catch (error) {
      return Promise.reject(error);
    }
  }
  const scope: ActivityScope = {
    id: randomUUID(),
    parentId: options.onScope ? undefined : parent?.scope.id,
    label,
    state: "running",
  };
  const signal = options.signal || parent?.signal;
  const context: ScopeContext = {
    parent: options.onScope ? undefined : parent,
    scope,
    onScope,
    signal,
    children: new Set(),
  };
  const result = contexts.run(context, async () => {
    onScope({ ...scope });
    try {
      signal?.throwIfAborted();
      const result = await task();
      await Promise.allSettled(context.children);
      if (!options.completionState) signal?.throwIfAborted();
      onScope({ ...scope, state: options.completionState?.() || "complete" });
      return result;
    } catch (error) {
      await Promise.allSettled(context.children);
      onScope({
        ...scope,
        state: signal?.aborted ? "stopped" : error instanceof InputRequired ? "waiting" : "failed",
      });
      throw error;
    }
  });
  if (parent && !options.onScope) {
    parent.children.add(result);
    void result.then(
      () => parent.children.delete(result),
      () => parent.children.delete(result),
    );
  }
  return result;
}
