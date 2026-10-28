import { expect, it } from "vitest";
import { renderContract } from "../src/server/rendering/contracts";
import { videoRefinementOutputSchemaForTarget } from "../src/shared/agents/schemas/video";
import { validStoryboard } from "./fixtures/storyboard";

it.each(["hyperframes", "multiplane"] as const)(
  "keeps %s refinement examples and contracts free of the previous exact duration",
  (renderer) => {
    const input = { width: 1920, height: 1080, duration: 120, fps: 60, kind: "full" as const };
    const flexible = renderContract(renderer, { ...input, durationRange: { min: 115, max: 125 } });
    expect(flexible).toContain("between 115 and 125 seconds");
    expect(flexible).not.toContain("duration MUST be 120");
    expect(flexible).not.toContain("duration: 120");
    expect(flexible).not.toContain("durationInFrames=7200");
    expect(renderContract(renderer, input)).toContain("duration MUST be 120");
  },
);

it("requires a matching revised storyboard inside the original target window", () => {
  const schema = videoRefinementOutputSchemaForTarget(120);
  const production = {
    pipeline: "Multiplane",
    fallbackReason: null,
    styleRenderer: ["SVG"],
    motionEngine: ["GSAP"],
    sourceFile: "shot.html",
    duration: 125,
    width: 1920,
    height: 1080,
    fps: 60,
    audioDescription: "Music",
    limitations: [],
    storyboard: validStoryboard(125),
  };
  expect(schema.safeParse(production).success).toBe(true);
  expect(
    schema.safeParse({ ...production, duration: 126, storyboard: validStoryboard(126) }).success,
  ).toBe(false);
  expect(schema.safeParse({ ...production, storyboard: validStoryboard(120) }).success).toBe(false);
});
