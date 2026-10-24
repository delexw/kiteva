import { expect, it } from "vitest";
import { RequestSchema } from "../src/shared/contracts";
import { manualStyleLimit, normalizeStyleSelection } from "../src/shared/style-selection";
import { manualDirection } from "../src/server/jobs/manual-direction";
import { loadCatalog } from "../src/server/catalog/catalog";
import { selectedStyleWeightingGuidance } from "../src/shared/style-combinations";

it("leaves manual style emphasis to idea-led planning rather than selection order", async () => {
  const { styles } = await loadCatalog();
  const ids = styles.slice(0, 2).map((style) => style.id);
  const makeDirection = (selectedStyleIds: string[]) =>
    manualDirection(
      RequestSchema.parse({
        instructions: "Explain a workflow; let the audience's needs determine visual emphasis.",
        selectedStyleIds,
        candidateCount: 0,
      }),
      styles,
    );
  const forward = makeDirection(ids);
  const reverse = makeDirection([...ids].reverse());
  expect(forward.sceneRoles).toEqual([...reverse.sceneRoles].reverse());
  expect(forward.sceneRoles.join(" ")).not.toMatch(
    /Primary identity|Supporting visual contribution/,
  );
  expect(forward.rationale).toContain(selectedStyleWeightingGuidance);
  expect(forward.rationale).toContain("Selection order does not determine importance");
});
it.each([
  { candidateCount: 2, selectedStyleIds: ["style-056"] },
  { candidateCount: 0, selectedStyleIds: ["style-056"] },
  { candidateCount: 0, selectedStyleIds: [] },
  { candidateCount: 3 },
])("normalizes editing choices for strict API requests: %j", (selection) => {
  const draft = {
    ...selection,
    instructions: "A visual story",
    outputLanguage: "zh",
    lyrics: { mode: "provided", text: "A story begins." },
  };
  const before = structuredClone(draft);
  const request = RequestSchema.parse(normalizeStyleSelection(draft));
  expect(request).toMatchObject({
    instructions: draft.instructions,
    outputLanguage: "zh",
    lyrics: draft.lyrics,
    candidateCount: selection.selectedStyleIds?.length
      ? selection.candidateCount
      : selection.candidateCount || 5,
  });
  expect(request.selectedStyleIds).toEqual(
    selection.selectedStyleIds?.length ? selection.selectedStyleIds : undefined,
  );
  expect(draft).toEqual(before);
});
it.each([
  [15, 3],
  [29, 3],
  [30, 4],
  [59, 4],
  [60, 5],
  [179, 5],
  [180, 6],
  [300, 6],
] as const)("limits %is to %i manual Motion Graphics", (duration, max) => {
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
it("rejects zero without styles and duplicate styles", async () => {
  for (const input of [
    { candidateCount: 0 },
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

it("keeps prompt names, IDs and exclusions as original text without changing Settings selections", () => {
  const instructions =
    "Act 1: Vintage Rubber Hose Animation (style-140), continuing Rubber Hose animation. Act 3: Manga Production Theatre (style-136); keep manga characters there. No Mosaic, no Glitch Art, no Art Deco, no style-034.";
  const selectedStyleIds = ["style-056", "style-098", "style-093"];
  const request = RequestSchema.parse(
    normalizeStyleSelection({ instructions, selectedStyleIds, duration: 180, candidateCount: 0 }),
  );
  expect(request.instructions).toBe(instructions);
  expect(request.selectedStyleIds).toEqual(selectedStyleIds);
});

it("allows additional prompt-assigned styles beyond the generated-combination limit", () => {
  const selectedStyleIds = ["style-056", "style-098", "style-093"];
  const instructions =
    'Opening: <style id="style-140">Vintage Rubber Hose Animation</style>. Ending: <style id="style-136">Manga Production Theatre</style>.';
  const request = RequestSchema.parse({
    instructions,
    duration: 15,
    selectedStyleIds,
    candidateCount: 2,
  });
  expect(request.instructions).toBe(instructions);
  expect(request.selectedStyleIds).toEqual(selectedStyleIds);
  expect(request.candidateCount).toBe(2);
});
