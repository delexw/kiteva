import { random } from "remotion/no-react";

/**
 * Deterministic seeded sequence built on Remotion's React-free `random(seed)`.
 * Each call draws from a distinct seed string, so the sequence depends only on
 * the seed and call order — never on wall-clock time. Values are in [0, 1).
 */
export function seeded(seed: number) {
  let index = 0;
  return () => random(`${seed}:${index++}`);
}
