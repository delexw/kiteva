import { describe, expect, it } from "vitest";
import { seeded } from "../src/shared/seeded-random";
import { seeded as drawingSeeded } from "../src/client/motion-previews/drawing";

const take = (next: () => number, count: number) => Array.from({ length: count }, () => next());

describe("seeded random", () => {
  it("reproduces the same sequence for the same seed", () => {
    expect(take(seeded(4801), 32)).toEqual(take(seeded(4801), 32));
  });

  it("produces different sequences for different seeds", () => {
    expect(take(seeded(4801), 16)).not.toEqual(take(seeded(4802), 16));
  });

  it("varies across calls within one sequence", () => {
    expect(new Set(take(seeded(138), 64)).size).toBeGreaterThan(60);
  });

  it("keeps factory instances independent", () => {
    const a = seeded(7);
    const b = seeded(7);
    const first = a();
    a();
    a();
    expect(b()).toBe(first);
    expect(take(a, 4)).toEqual(take(seeded(7), 7).slice(3));
  });

  it("returns values in [0, 1)", () => {
    for (const value of take(seeded(12345), 2000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("is the same generator re-exported by the canvas drawing kit", () => {
    expect(drawingSeeded).toBe(seeded);
  });
});
