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

it("keeps temporary names to one short line without changing the original prompt", () => {
  const instructions = "Explain an idea.\n\n" + "More detail. ".repeat(100);
  const request = RequestSchema.parse({ instructions });
  const title = projectName({ request });
  expect(title).toHaveLength(80);
  expect(title).toMatch(/^Explain an idea\. More detail\./);
  expect(title.endsWith("…")).toBe(true);
  expect(title).not.toContain("\n");
  expect(request.instructions).toBe(instructions.trim());
});
it("preserves short names and avoids splitting unicode code points", () => {
  expect(
    projectName({ request: RequestSchema.parse({ instructions: "  An idea\nfor everyone  " }) }),
  ).toBe("An idea for everyone");
  const title = projectName({ request: RequestSchema.parse({ instructions: "🎬".repeat(100) }) });
  expect(Array.from(title)).toHaveLength(80);
  expect(title).toBe("🎬".repeat(79) + "…");
});
