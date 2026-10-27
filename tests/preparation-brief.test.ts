import { expect, it } from "vitest";
import { z } from "zod";
import { RequestSchema } from "../src/shared/contracts";
import { preparationBriefSchemaFor } from "../src/shared/agents/schemas/preparation-brief";
import { assemblePreparationBrief } from "../src/server/jobs/subworkflows/full-brief/preparation";

const interpretation = {
  subject: "An insight becomes shareable",
  audience: "Engineers",
  objective: "Explain an API",
  previewBeat: "A request reaches a service and receives a response",
  facts: ["The inspected page has a guide"],
  constraints: ["A separate people page was not verified"],
};
it("keeps explicit duration, exact active copy and inventory out of the model response", () => {
  const request = RequestSchema.parse({
    instructions: "Keep this original direction unchanged",
    duration: 180,
    subtitles: { mode: "provided", text: "Exact subtitle\nWith spacing." },
    speech: { mode: "narration", source: "provided", text: "Exact narration." },
    selectedStyleIds: ["style-026"],
    candidateCount: 0,
  });
  const snapshot = structuredClone(request);
  const schema = z.toJSONSchema(preparationBriefSchemaFor(request));
  expect(schema.required).toEqual([
    "subject",
    "audience",
    "objective",
    "previewBeat",
    "facts",
    "constraints",
  ]);
  for (const field of [
    "exactCopy",
    "assetDescriptions",
    "suggestedDuration",
    "durationReason",
    "assetPlan",
  ])
    expect(schema.properties).not.toHaveProperty(field);
  const brief = assemblePreparationBrief(
    request,
    { ...interpretation, exactCopy: ["Model rewrite"], suggestedDuration: 12 },
    ["assets/reference.png: uploaded image"],
    [
      {
        name: "website-reference-abcdef.png",
        url: "https://example.com",
        title: "Guide",
        text: "Page text",
      },
    ],
  );
  expect(brief.exactCopy).toEqual(["Exact subtitle\nWith spacing.", "Exact narration."]);
  expect(brief).toMatchObject({
    suggestedDuration: 180,
    facts: interpretation.facts,
    constraints: interpretation.constraints,
  });
  expect(brief.assetDescriptions).toEqual([
    "assets/reference.png: uploaded image",
    expect.stringContaining("assets/website-reference-abcdef.png"),
  ]);
  expect(request).toEqual(snapshot);
});
it("asks for duration only when Auto is selected", () => {
  const request = RequestSchema.parse({ instructions: "Explain this API", duration: "auto" });
  expect(() => assemblePreparationBrief(request, interpretation, [], [])).toThrow();
  expect(
    assemblePreparationBrief(
      request,
      { ...interpretation, suggestedDuration: 45, durationReason: "One short explanation" },
      [],
      [],
    ),
  ).toMatchObject({ suggestedDuration: 45, durationReason: "One short explanation" });
});
it("preserves the page contract without introducing video timing", () => {
  const request = RequestSchema.parse({
    outputType: "page",
    instructions: "Explain with an interactive page",
  });
  const brief = assemblePreparationBrief(
    request,
    { ...interpretation, sections: ["Overview"], interactionGoals: ["Explore the request"] },
    [],
    [],
  );
  expect(brief).toMatchObject({
    sections: ["Overview"],
    interactionGoals: ["Explore the request"],
    exactCopy: [],
  });
  expect(brief).not.toHaveProperty("suggestedDuration");
});
it("rejects oversized or stringified observations instead of truncating or coercing them", () => {
  const schema = preparationBriefSchemaFor(
    RequestSchema.parse({ instructions: "Explain this API", duration: 30 }),
  );
  expect(
    schema.safeParse({ ...interpretation, facts: JSON.stringify(interpretation.facts) }).success,
  ).toBe(false);
  expect(schema.safeParse({ ...interpretation, facts: ["x".repeat(401)] }).success).toBe(false);
  expect(
    schema.safeParse({ ...interpretation, facts: Array(7).fill("An observation") }).success,
  ).toBe(false);
});
