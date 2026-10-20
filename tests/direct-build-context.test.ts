import { expect, it } from "vitest";
import { RequestSchema } from "../src/shared/contracts";
import { directBuildContext } from "../src/server/jobs/direct-build-context";

it("preserves the original idea and source descriptions without inferring story requirements", () => {
  const request = RequestSchema.parse({
    instructions: "Credits: Avery — Engineering. End with ‘Make ideas move.’",
    duration: 90,
    lyrics: { mode: "provided", text: "Exact script" },
  });
  expect(directBuildContext(request, ["Reference document: assets/example.txt"])).toMatchObject({
    objective: request.instructions,
    audience: "",
    facts: [],
    constraints: [],
    exactCopy: ["Exact script"],
    suggestedDuration: 90,
    assetDescriptions: ["Reference document: assets/example.txt"],
  });
});
it("leaves automatic duration and page interpretation to the main model", () => {
  expect(
    directBuildContext(
      RequestSchema.parse({ instructions: "An original film", duration: "auto" }),
      [],
    ),
  ).toMatchObject({ durationReason: "Duration is pending main-model planning." });
  const page = RequestSchema.parse({
    outputType: "page",
    instructions: "Show an interactive guide",
  });
  expect(directBuildContext(page, [])).toMatchObject({
    objective: page.instructions,
    sections: [page.instructions],
    interactionGoals: [page.instructions],
  });
});

it("names a direct build from its idea heading instead of the selection placeholder", () => {
  const request = RequestSchema.parse({
    instructions: "MY PRODUCT — MAKE IDEAS MOVE\n\nBuild a complete film.",
    selectedStyleIds: ["style-018"],
    candidateCount: 0,
  });
  expect(directBuildContext(request, []).subject).toBe("MY PRODUCT — MAKE IDEAS MOVE");
  expect(directBuildContext(request, []).objective).toBe(request.instructions);
});

it("uses the extracted title without changing the original idea", () => {
  const request = RequestSchema.parse({
    instructions: "The complete original idea and exact credits.",
  });
  expect(directBuildContext(request, [], "An extracted title")).toMatchObject({
    subject: "An extracted title",
    objective: request.instructions,
  });
});
