import { describe, expect, it } from "vitest";
import { heroGeometry } from "../src/client/hero-geometry";
describe("creative hero geometry", () => {
  it("produces deterministic, bounded artwork with visible time and pointer movement", () => {
    const initial = heroGeometry(0, 0, 0, 0);
    expect(heroGeometry(0, 0, 0, 0)).toEqual(initial);
    expect(heroGeometry(2, 0, 0, 0)).not.toEqual(initial);
    expect(heroGeometry(0, 1, 1, 0)).not.toEqual(initial);
    expect(heroGeometry(0, 0, 0, 2)).not.toEqual(initial);
    expect(heroGeometry(0, 100, 100, 0)).toEqual(heroGeometry(0, 1, 1, 0));
  });
  it.each([
    [1200, 310],
    [360, 340],
    [480, 260],
  ])("fills a %i by %i header with large shapes without stretching circles", (width, height) => {
    const geometry = heroGeometry(0, 0, 0, 0, width, height);
    for (const ribbon of geometry.ribbons) {
      expect(ribbon[0][0]).toBe(0);
      expect(ribbon.at(-1)?.[0]).toBe(width);
      expect(
        Math.max(...ribbon.map((point) => point[1])) - Math.min(...ribbon.map((point) => point[1])),
      ).toBeGreaterThan(height * 0.45);
    }
    expect(geometry.circles[0].radius).toBeCloseTo(height * 0.29);
    expect(geometry.circles.at(-1)?.x).toBeGreaterThan(width * 0.85);
    expect(geometry.circles[0].x).toBeLessThan(width * 0.2);
    expect(JSON.stringify(geometry)).not.toContain("null");
  });
});
