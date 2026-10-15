import { CandidateCopySchema } from "../src/shared/agents/schemas/candidate-copy";
import { proposalSchemaForStyleRange } from "../src/shared/agents/schemas/proposals";
import { expect, it } from "vitest";
import { z } from "zod";
import { candidateCopyGuidance, candidateDisplayTitle } from "../src/shared/candidate-copy";

it("exports the word limit in the SDK proposal output schema", () => {
  const schema = proposalSchemaForStyleRange({ min: 1, max: 2 });
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
  const titleSchema = z
    .object({
      properties: z.object({
        options: z.object({
          items: z.object({
            properties: z.object({ displayTitle: z.object({ pattern: z.string() }) }),
          }),
        }),
      }),
    })
    .parse(jsonSchema).properties.options.items.properties.displayTitle;
  expect(titleSchema.pattern).toBeTypeOf("string");
  const sdkPattern = new RegExp(titleSchema.pattern);
  for (const [title, valid] of [
    ["Sparkstorm", true],
    ["First Flight", true],
    ["  First   Flight  ", true],
    ["One Two Three", false],
    ["One\tTwo\nThree", false],
    ["   ", false],
  ] as const) {
    expect(sdkPattern.test(title), title).toBe(valid);
    expect(CandidateCopySchema.shape.displayTitle.safeParse(title).success, title).toBe(valid);
  }
});

it("requires concise model-authored preview titles and descriptions", () => {
  const option = {
    primaryStyleId: "style-001",
    supportingStyleIds: [],
    sceneRoles: [],
    rationale: "Internal reasoning",
    feasible: true,
    missingAssets: [],
  };
  const schema = proposalSchemaForStyleRange({ min: 1, max: 2 });
  expect(schema.safeParse({ options: [option] }).success).toBe(false);
  const copy = {
    displayTitle: "First Flight",
    displayDescription:
      "Watch a small idea unfold into a clear vision, with the product at its heart.",
  };
  expect(schema.parse({ options: [{ ...option, ...copy }] }).options[0]).toMatchObject(copy);
  expect(CandidateCopySchema.safeParse({ ...copy, displayTitle: "x".repeat(25) }).success).toBe(
    false,
  );
  expect(
    CandidateCopySchema.safeParse({ ...copy, displayDescription: "x".repeat(161) }).success,
  ).toBe(false);
  expect(candidateCopyGuidance).toContain("Neither field may expose style names");
  expect(CandidateCopySchema.safeParse({ ...copy, displayTitle: "One Two Three" }).success).toBe(
    false,
  );
  expect(CandidateCopySchema.safeParse({ ...copy, displayTitle: "Sparkstorm" }).success).toBe(true);
});
it("uses creative titles and never exposes style names or rationale for older directions", () => {
  expect(candidateDisplayTitle({ displayTitle: "  First Flight  " }, 1)).toBe("First Flight");
  expect(candidateDisplayTitle(undefined, 2)).toBe("Direction 2");
  expect(candidateDisplayTitle(undefined)).toBe("Your direction");
});
