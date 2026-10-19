import { expect, it } from "vitest";
import { BriefSchema } from "../src/shared/agents/schemas/video";
import { PageBriefSchema } from "../src/shared/agents/schemas/page";
import { BriefCorrectionSchema } from "../src/shared/agents/schemas/brief-correction";
import { applyBriefCorrection } from "../src/server/jobs/subworkflows/brief-correction";

const brief = {
  subject: "An idea becomes shareable",
  audience: "Creators",
  objective: "Explain the workflow",
  facts: ["Choose a team", "A verified fact"],
  exactCopy: ["Keep this exact wording"],
  previewBeat: "A shared idea appears",
  assetDescriptions: ["Original reference"],
  constraints: ["Preserve the narration"],
  suggestedDuration: 60,
  durationReason: "Three scenes",
};

it("applies a small guarded correction without rewriting unrelated content", () => {
  const original = structuredClone(brief);
  const revised = applyBriefCorrection(
    brief,
    {
      edits: [
        { op: "replace", path: "/facts/0", expected: "Choose a team", value: "Choose Engineering" },
      ],
    },
    BriefSchema,
  );
  expect(revised).toEqual({ ...brief, facts: ["Choose Engineering", "A verified fact"] });
  expect(brief).toEqual(original);
  expect(BriefCorrectionSchema.safeParse(brief).success).toBe(false);
});

it("supports individual additions/removals and checks indexes after preceding edits", () => {
  expect(
    applyBriefCorrection(
      brief,
      {
        edits: [
          { op: "remove", path: "/facts/0", expected: "Choose a team" },
          {
            op: "replace",
            path: "/facts/0",
            expected: "A verified fact",
            value: "A corrected fact",
          },
          { op: "add", path: "/facts/-", value: "An additional verified fact" },
        ],
      },
      BriefSchema,
    ).facts,
  ).toEqual(["A corrected fact", "An additional verified fact"]);
});

it("keeps the original intact if any guard fails", () => {
  const original = structuredClone(brief);
  expect(() =>
    applyBriefCorrection(
      brief,
      {
        edits: [
          { op: "replace", path: "/facts/0", expected: "Choose a team", value: "Corrected" },
          { op: "remove", path: "/facts/1", expected: "Stale evidence" },
        ],
      },
      BriefSchema,
    ),
  ).toThrow();
  expect(brief).toEqual(original);
});

it("validates the complete resulting brief before accepting any changes", () => {
  expect(() =>
    applyBriefCorrection(
      brief,
      { edits: [{ op: "replace", path: "/suggestedDuration", expected: 60, value: -1 }] },
      BriefSchema,
    ),
  ).toThrow();
  expect(brief.suggestedDuration).toBe(60);
});

it.each([
  "",
  "/facts",
  "/constraints",
  "/assetPlan",
  "/request",
  "/__proto__/polluted",
  "/assetPlan/assets/0/path",
  "/assetPlan/scenes/0/id",
])("rejects document/container/source identity replacement at %s", (path) => {
  expect(
    BriefCorrectionSchema.safeParse({
      edits: [{ op: "replace", path, expected: "before", value: "after" }],
    }).success,
  ).toBe(false);
});

it("rejects full object/array values and deleting required scalar fields", () => {
  for (const value of [brief, brief.facts])
    expect(
      BriefCorrectionSchema.safeParse({
        edits: [{ op: "replace", path: "/facts/0", expected: "Choose a team", value }],
      }).success,
    ).toBe(false);
  expect(
    BriefCorrectionSchema.safeParse({
      edits: [{ op: "remove", path: "/subject", expected: brief.subject }],
    }).success,
  ).toBe(false);
});

it("uses the same correction contract for page briefs", () => {
  const page = PageBriefSchema.parse({
    ...brief,
    sections: ["Overview"],
    interactionGoals: ["Open details"],
  });
  const revised = applyBriefCorrection(
    page,
    {
      edits: [
        { op: "replace", path: "/sections/0", expected: "Overview", value: "Product overview" },
      ],
    },
    PageBriefSchema,
  );
  expect(revised.sections).toEqual(["Product overview"]);
  expect(revised.interactionGoals).toEqual(page.interactionGoals);
});

it("repairs nested evidence notes while preserving source identities and other scenes", () => {
  const draft = BriefSchema.parse({
    ...brief,
    assetPlan: {
      coreIdea: "Explain importing",
      scenes: [
        {
          id: "import",
          purpose: "Show import",
          assetPaths: ["assets/reference.png"],
          use: "Show the title",
          coverage: "limited",
          limitation: "The counter is visible",
        },
      ],
      assets: [
        {
          path: "assets/reference.png",
          sceneIds: ["import"],
          observedContent: "A title label",
          relevance: "Import workflow",
          suitability: "limited",
          plannedUse: "Show the title",
          limitation: "Field is cut off",
        },
      ],
      limitations: [],
    },
  });
  const revised = applyBriefCorrection(
    draft,
    {
      edits: [
        {
          op: "replace",
          path: "/assetPlan/scenes/0/limitation",
          expected: "The counter is visible",
          value: "The counter is DOM text only, outside the captured image",
        },
      ],
    },
    BriefSchema,
  );
  expect(revised.assetPlan?.scenes[0].limitation).toContain("DOM text only");
  expect(revised.assetPlan?.scenes[0].id).toBe("import");
  expect(revised.assetPlan?.assets).toEqual(draft.assetPlan?.assets);
  expect(draft.assetPlan?.scenes[0].limitation).toBe("The counter is visible");
});
