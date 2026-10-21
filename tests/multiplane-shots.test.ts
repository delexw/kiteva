import { expect, it } from "vitest";
import type { Production } from "../src/shared/agents/schemas/video";
import { ProductionSchema } from "../src/shared/agents/schemas/video";
import { multiplaneShotPlan } from "../src/server/rendering/multiplane/shots";
import { multiplaneShotGuidance } from "../src/server/rendering/multiplane/metadata";
import { renderContract } from "../src/server/domains/video/prompts";

const production: Production = {
  pipeline: "Multiplane",
  fallbackReason: null,
  styleRenderer: ["Canvas"],
  motionEngine: ["Shot"],
  sourceFile: "shots/01.html",
  duration: 3,
  width: 320,
  height: 180,
  fps: 60,
  audioDescription: "Continuous score",
  limitations: [],
  shots: [
    { sourceFile: "shots/01.html", duration: 1 },
    { sourceFile: "shots/02.html", duration: 2 },
  ],
};
it("retains the ordered shot manifest in structured production output", () => {
  expect(ProductionSchema.parse(production).shots).toEqual(production.shots);
  expect(multiplaneShotPlan(production, 3, 60)).toEqual(production.shots);
  expect(multiplaneShotPlan({ ...production, shots: undefined }, 3, 60)).toEqual([
    { sourceFile: "shots/01.html", duration: 3 },
  ]);
});
it.each([
  { shots: [] },
  { shots: [{ sourceFile: "elsewhere.html", duration: 3 }] },
  { shots: [{ sourceFile: "shots/01.html", duration: 2 }] },
  { shots: [{ sourceFile: "shots/01.html", duration: -1 }] },
  {
    shots: [
      { sourceFile: "shots/01.html", duration: 0.001 },
      { sourceFile: "shots/02.html", duration: 2.999 },
    ],
  },
  { sourceFile: "../outside.html", shots: [{ sourceFile: "../outside.html", duration: 3 }] },
  { sourceFile: "/absolute.html", shots: [{ sourceFile: "/absolute.html", duration: 3 }] },
])("rejects an invalid shot handoff: %j", (changes) => {
  expect(() => multiplaneShotPlan({ ...production, ...changes }, 3, 60)).toThrow();
});
it("preserves integral frame totals for fractional shot lengths", () => {
  const shots = [
    { sourceFile: "shots/01.html", duration: 1 / 60 },
    { sourceFile: "shots/02.html", duration: 179 / 60 },
  ];
  expect(multiplaneShotPlan({ ...production, shots }, 3, 60)).toEqual(shots);
});
it("gives the author the same shot-loading contract used by renderer metadata", () => {
  const prompt = renderContract("multiplane", {
    width: 320,
    height: 180,
    duration: 3,
    fps: 60,
    kind: "full",
  });
  expect(prompt).toContain(multiplaneShotGuidance);
  expect(prompt).toContain("production.shots");
  expect(prompt).not.toContain("write one standalone shot.html");
  expect(multiplaneShotGuidance).toContain("shot-local time");
  expect(multiplaneShotGuidance).toContain("Do not restart the soundtrack");
});
