import { expect, it } from "vitest";
import { jevApiCost } from "../src/server/governance/jev-pricing";

it.each(["jev-1.13.0", "jev-1.14.0"])("prices reported input for %s", (model) => {
  expect(jevApiCost(model, 1000000)).toBe(0.042);
  expect(jevApiCost(model, 151497)).toBeCloseTo(0.006362874, 12);
  expect(jevApiCost(model, 0)).toBe(0);
});

it("does not invent prices for unknown models or invalid usage", () => {
  for (const model of ["jev-future", "jev-latest", "toString"])
    expect(jevApiCost(model, 100)).toBeNull();
  for (const count of [-1, NaN, Infinity]) expect(jevApiCost("jev-1.14.0", count)).toBeNull();
});
