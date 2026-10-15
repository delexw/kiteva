import { describe, expect, it } from "vitest";
import { visiblePixelChange } from "../src/server/motion/motion-visibility";
describe("motion visibility at card size", () => {
  it("ignores compression noise and detects substantial RGB changes", () => {
    expect(
      visiblePixelChange(
        new Uint8Array([10, 10, 10, 20, 20, 20]),
        new Uint8Array([12, 12, 12, 60, 20, 20]),
      ),
    ).toBe(0.5);
    expect(visiblePixelChange(new Uint8Array([10, 10, 10]), new Uint8Array([12, 12, 12]))).toBe(0);
  });
  it("rejects empty, mismatched or incomplete pixels", () => {
    expect(() => visiblePixelChange(new Uint8Array(), new Uint8Array())).toThrow();
    expect(() => visiblePixelChange(new Uint8Array(3), new Uint8Array(6))).toThrow();
    expect(() => visiblePixelChange(new Uint8Array(2), new Uint8Array(2))).toThrow();
  });
});
