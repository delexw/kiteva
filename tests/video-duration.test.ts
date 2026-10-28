import { proposalSchemaForStyleRange } from "../src/shared/agents/schemas/proposals";

import { expect, it } from "vitest";
import { fullVideoDurationMatches, videoDurationRange } from "../src/shared/video-duration";
import {
  VideoRequestSchema,
  resolveVideoDuration,
  videoStyleCountRange,
} from "../src/shared/domains/video";

it("enforces fifteen seconds for automatic full videos, including older briefs", () => {
  for (const suggested of [3, 5, 10, 14, 15])
    expect(resolveVideoDuration("auto", suggested)).toBe(15);
  expect(resolveVideoDuration("auto", 45)).toBe(45);
});

it("preserves explicit short durations", () => {
  expect(resolveVideoDuration(3, 30)).toBe(3);
  expect(resolveVideoDuration(10, 30)).toBe(10);
});

it("allows five seconds either side of the requested target within application limits", () => {
  expect(videoDurationRange(120)).toEqual({ min: 115, max: 125 });
  expect(videoDurationRange(3)).toEqual({ min: 3, max: 8 });
  expect(videoDurationRange(300)).toEqual({ min: 295, max: 300 });
  expect(resolveVideoDuration(120, 120, [{ endSeconds: 124 }])).toBe(124);
});

it("accepts small export differences without stacking the planning and export allowances", () => {
  for (const actual of [115, 119.8, 120, 125])
    expect(fullVideoDurationMatches(actual, 120, 120)).toBe(true);
  for (const actual of [114.99, 125.01, 130, NaN, Infinity])
    expect(fullVideoDurationMatches(actual, 120, 120)).toBe(false);
  expect(fullVideoDurationMatches(125, 124, 120)).toBe(true);
  expect(fullVideoDurationMatches(129, 124, 120)).toBe(false);
  expect(fullVideoDurationMatches(116, 124, 120)).toBe(false);
});

it("caps explicit and automatic durations at five minutes, including older suggestions", () => {
  expect(resolveVideoDuration("auto", 600)).toBe(300);
  expect(resolveVideoDuration(600, 15)).toBe(300);
  expect(
    VideoRequestSchema.safeParse({ instructions: "Explain an idea", duration: 301 }).success,
  ).toBe(false);
  expect(
    VideoRequestSchema.safeParse({ instructions: "Explain an idea", duration: 300 }).success,
  ).toBe(true);
});
it.each([
  [3, 2, 3],
  [29, 2, 3],
  [30, 2, 4],
  [59, 2, 4],
  [60, 2, 5],
  [179, 2, 5],
  [180, 2, 6],
  [300, 2, 6],
])("uses the full %ss duration for the %s–%s Motion Graphic range", (duration, min, max) => {
  expect(videoStyleCountRange(duration)).toEqual({ min, max });
  const option = {
    primaryStyleId: "style-001",
    supportingStyleIds: [],
    sceneRoles: [],
    rationale: "A coherent direction",
    displayTitle: "First Flight",
    displayDescription: "A clear journey follows an idea as it grows into a finished creation.",
    feasible: true,
    missingAssets: [],
  };
  const schema = proposalSchemaForStyleRange(videoStyleCountRange(duration));
  for (let count = 1; count <= 7; count++)
    expect(
      schema.safeParse({
        options: [
          {
            ...option,
            supportingStyleIds: Array.from(
              { length: count - 1 },
              (_, index) => `style-${index + 2}`,
            ),
          },
        ],
      }).success,
    ).toBe(count >= min && count <= max);
});
