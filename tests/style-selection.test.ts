import { expect, it } from "vitest";
import { RequestSchema } from "../src/shared/contracts";
import { manualStyleLimit } from "../src/shared/style-selection";
import { manualDirection } from "../src/server/jobs/manual-direction";
import { loadCatalog } from "../src/server/catalog/catalog";
it.each([
  [15, 3],
  [29, 3],
  [30, 4],
  [59, 4],
  [60, 5],
  [179, 5],
  [180, 6],
  [300, 6],
] as const)("limits %is to %i manual styles", (duration, max) => {
  expect(manualStyleLimit("video", duration)).toBe(max);
  const selectedStyleIds = Array.from({ length: max }, (_, i) => `style-00${i + 1}`);
  expect(
    RequestSchema.safeParse({
      instructions: "A visual story",
      duration,
      candidateCount: 0,
      selectedStyleIds,
    }).success,
  ).toBe(true);
  expect(
    RequestSchema.safeParse({
      instructions: "A visual story",
      duration,
      candidateCount: 0,
      selectedStyleIds: [...selectedStyleIds, "style-010"],
    }).success,
  ).toBe(false);
});
it("rejects zero without styles, duplicates and directions with manual styles", async () => {
  for (const input of [
    { candidateCount: 0 },
    { candidateCount: 2, selectedStyleIds: ["style-001"] },
    { candidateCount: 0, selectedStyleIds: ["style-001", "style-001"] },
  ])
    expect(RequestSchema.safeParse({ instructions: "A visual story", ...input }).success).toBe(
      false,
    );
  const catalog = await loadCatalog();
  expect(() =>
    manualDirection(
      RequestSchema.parse({
        instructions: "A visual story",
        candidateCount: 0,
        selectedStyleIds: ["style-999"],
      }),
      catalog.styles,
    ),
  ).toThrow("does not exist");
});

it("trims excess styles in selection order when duration decreases, including Auto", async () => {
  const { trimStylesForDuration } = await import("../src/shared/style-selection");
  const ids = ["style-001", "style-002", "style-003", "style-004", "style-005", "style-006"];
  expect(trimStylesForDuration(ids, "video", 60)).toEqual(ids.slice(0, 5));
  expect(trimStylesForDuration(ids, "video", 30)).toEqual(ids.slice(0, 4));
  expect(trimStylesForDuration(ids, "video", 15)).toEqual(ids.slice(0, 3));
  expect(trimStylesForDuration(ids, "video", "auto")).toEqual(ids.slice(0, 3));
  expect(ids).toHaveLength(6);
  const kept = ids.slice(0, 3);
  expect(trimStylesForDuration(kept, "video", 300)).toBe(kept);
  expect(trimStylesForDuration([], "video", 15)).toEqual([]);
});

it("derives both request and proposal caps from the duration policy", async () => {
  const { MAX_VIDEO_STYLE_COUNT, videoStyleCountRange } =
    await import("../src/shared/style-selection");
  const { SharedRequestSchema } = await import("../src/shared/domains/common");
  const { ProposalSchema } = await import("../src/shared/agents/schemas/proposals");
  expect(MAX_VIDEO_STYLE_COUNT).toBe(videoStyleCountRange(300).max);
  for (const [schema, maximum] of [
    [SharedRequestSchema.shape.selectedStyleIds.unwrap(), MAX_VIDEO_STYLE_COUNT],
    [ProposalSchema.shape.options.element.shape.supportingStyleIds, MAX_VIDEO_STYLE_COUNT - 1],
  ] as const) {
    const ids = Array.from(
      { length: maximum },
      (_, index) => `style-${String(index + 1).padStart(3, "0")}`,
    );
    expect(schema.safeParse(ids).success).toBe(true);
    expect(schema.safeParse([...ids, "style-099"]).success).toBe(false);
  }
});
