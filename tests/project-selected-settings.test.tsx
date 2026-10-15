import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectSettings } from "../src/client/components/project-settings";
import { modelDisplayName } from "../src/shared/model-display-name";
import { RequestSchema, type Run } from "../src/shared/contracts";
const run: Run = {
  id: "example",
  createdAt: "",
  phase: "ready",
  request: RequestSchema.parse({
    instructions: "Tell a visual story",
    provider: "claude",
    duration: 120,
    resolution: "1440p",
    frameRate: 60,
    candidateCount: 0,
    selectedStyleIds: ["style-001"],
  }),
  jobs: [],
  candidates: [],
};
it("shows selected settings without result verification claims", () => {
  const html = renderToStaticMarkup(
    <ProjectSettings run={run} styles={[{ id: "style-001", name_en: "Watercolor" }]} />,
  );
  for (const text of [
    "Selected project settings",
    "Claude Opus 5.5",
    "120s",
    "2K · 1440p",
    "60 fps",
    "16:9",
    "No lyrics",
    "Manual styles",
    "Watercolor",
  ])
    expect(html).toContain(text);
  expect(html).toContain('aria-label="Preview Watercolor"');
  for (const text of ["Result summary", "matched", "verified", "style-001"])
    expect(html).not.toContain(text);
});
it("shows page settings without video-only controls", () => {
  const html = renderToStaticMarkup(
    <ProjectSettings
      run={{
        ...run,
        request: RequestSchema.parse({
          instructions: "Tell a visual story",
          outputType: "page",
          viewport: "mobile",
          candidateCount: 3,
          preference: "creative",
        }),
      }}
    />,
  );
  expect(html).toContain("Mobile layout");
  expect(html).toContain("3 directions");
  expect(html).toContain("Explore creative ideas");
  expect(html).not.toContain("fps");
});
it("preserves custom model labels", () => {
  expect(modelDisplayName("custom-model")).toBe("custom-model");
  expect(modelDisplayName("")).toBe("Not recorded");
});

it("hides model-suggested styles even after a direction is selected", () => {
  const automatic: Run = {
    ...run,
    request: RequestSchema.parse({ instructions: "Tell a visual story", candidateCount: 3 }),
    winnerId: "suggested",
    candidates: [
      {
        id: "suggested",
        primaryStyleId: "style-001",
        supportingStyleIds: [],
        sceneRoles: [],
        rationale: "Suggested",
        feasible: true,
        missingAssets: [],
        score: 80,
        confidence: 0.8,
        dimensions: {},
      },
    ],
  };
  const html = renderToStaticMarkup(
    <ProjectSettings run={automatic} styles={[{ id: "style-001", name_en: "Watercolor" }]} />,
  );
  expect(html).toContain("Selected project settings");
  expect(html).toContain("3 directions");
  expect(html).not.toContain("Styles:");
  expect(html).not.toContain("Watercolor");
  expect(html).not.toContain("Preview Watercolor");
});
