import { proposalSchemaForStyleRange } from "../src/shared/agents/schemas/proposals";

import { expect, it } from "vitest";
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
  [3, 1, 3],
  [29, 1, 3],
  [30, 1, 4],
  [59, 1, 4],
  [60, 1, 5],
  [179, 1, 5],
  [180, 2, 6],
  [300, 2, 6],
])("uses the full %ss duration for the %s–%s style range", (duration, min, max) => {
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
