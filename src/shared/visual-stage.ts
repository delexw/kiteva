/** Browser-safe visual update stages. No clocks, DOM reads or renderer-specific heuristics. */
export type VisualValues = Readonly<Record<string, string | number | boolean | null | undefined>>;
export type VisualStageResult = {
  decision: "apply" | "unchanged";
  changedKeys: readonly string[];
};

/** Calculate from absolute time; cache only the last successfully applied scalar values.
 * Each stage must exclusively own its output (for example one canvas or one caption).
 * inputRevision covers immutable assets/configuration; change it whenever any dependency changes.
 * apply must fully rebuild its owned output, not patch only changedKeys (which are diagnostic).
 * Include every visible input: asset identity, geometry, opacity, text, palette and size.
 */
export function createVisualStage<State extends VisualValues & { inputRevision: string }>(options: {
  /** Enable only when the calculated state includes every dependency affecting this output. */
  reuse?: boolean;
  calculate: (time: number) => State;
  apply: (state: Readonly<State>, changedKeys: readonly string[]) => unknown;
}) {
  let applied: Readonly<State> | undefined;

  function calculate(time: number): Readonly<State> {
    if (!Number.isFinite(time)) throw Error("Visual stage time must be finite");
    const state = options.calculate(time);
    if (typeof state.inputRevision !== "string" || !state.inputRevision.trim())
      throw Error("Visual state must include a nonempty inputRevision");
    for (const value of Object.values(state)) {
      if (
        (typeof value === "number" && !Number.isFinite(value)) ||
        (value !== null && !["string", "number", "boolean", "undefined"].includes(typeof value))
      )
        throw Error("Visual state values must be finite scalar values");
    }
    return Object.freeze({ ...state });
  }

  function decide(next: Readonly<State>) {
    const keys = new Set([...Object.keys(applied ?? {}), ...Object.keys(next)]);
    return Object.freeze(
      [...keys].filter(
        (key) =>
          !applied ||
          Object.hasOwn(applied, key) !== Object.hasOwn(next, key) ||
          !Object.is(applied[key], next[key]),
      ),
    );
  }

  function render(time: number): VisualStageResult {
    // 1. CALCULATE: a complete state derived from absolute time, never the prior frame.
    const next = calculate(time);
    // 2. DECIDE: native scalar comparisons; no approximate time or pixel guessing.
    const changedKeys = decide(next);
    if (options.reuse === true && applied && !changedKeys.length)
      return { decision: "unchanged", changedKeys };
    try {
      // 3. APPLY: perform synchronous drawing/DOM writes only when state differs.
      const result = options.apply(next, changedKeys);
      if (result && typeof (result as PromiseLike<unknown>).then === "function")
        throw Error("Visual stage apply must be synchronous");
      // 4. COMMIT: remember state only after the entire update succeeds.
      applied = next;
    } catch (error) {
      // An interrupted update can leave partially changed pixels; the next call must redraw.
      applied = undefined;
      throw error;
    }
    return { decision: "apply", changedKeys };
  }

  return {
    render,
    invalidate() {
      applied = undefined;
    },
  };
}
