import { BriefSchema } from "../src/shared/agents/schemas/video";
import { expect, it } from "vitest";
import { projectName } from "../src/shared/project-name";
import { RequestSchema } from "../src/shared/contracts";

it("uses the shared brief name rather than the original instructions", () => {
  const request = RequestSchema.parse({ instructions: "Create a long explanation of an idea" });
  const brief = BriefSchema.parse({
    subject: "A connected idea",
    objective: "Explain connections",
    audience: "Everyone",
    tone: "Clear",
    facts: [],
    exactCopy: [],
    previewBeat: "Connect ideas",
    assetDescriptions: [],
    constraints: [],
    suggestedDuration: 15,
    durationReason: "Enough time to read",
    missingInputs: [],
  });
  expect(projectName({ request, brief })).toBe("A connected idea");
});
it("falls back to the input before a brief is prepared", () => {
  expect(projectName({ request: RequestSchema.parse({ instructions: "Explain an idea" }) })).toBe(
    "Explain an idea",
  );
});
