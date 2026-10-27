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
    "No subtitles",
    "Manual Motion Graphics",
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
  expect(html).not.toContain("Motion Graphics:");
  expect(html).not.toContain("Watercolor");
  expect(html).not.toContain("Preview Watercolor");
});

it.each([
  { showSubtitles: true, mode: "off", expected: "Subtitles on" },
  { showSubtitles: false, mode: "write", expected: "No subtitles" },
])(
  "uses timed-item text visibility instead of legacy subtitles: %j",
  ({ showSubtitles, mode, expected }) => {
    const request = RequestSchema.parse({
      instructions: "Tell a visual story",
      subtitles: mode === "off" ? { mode: "off" } : { mode: "write" },
      scriptItems: [
        {
          id: "opening",
          startSeconds: 0,
          endSeconds: 10,
          text: "Read this",
          showSubtitles,
          speech: { mode: "off" },
        },
      ],
    });
    const html = renderToStaticMarkup(<ProjectSettings run={{ ...run, request }} />);
    expect(html).toContain(expected);
    expect(html).not.toContain(expected === "Subtitles on" ? "No subtitles" : "Subtitles on");
  },
);

it("shows selected Motion Graphics instead of an inactive creative preference", () => {
  const request = RequestSchema.parse({
    instructions: "Tell a visual story",
    preference: "creative",
    candidateCount: 2,
    selectedStyleIds: ["style-001"],
  });
  const html = renderToStaticMarkup(<ProjectSettings run={{ ...run, request }} />);
  expect(html).toContain("Selected Motion Graphics");
  expect(html).toContain("Selected styles with previews");
  expect(html).toContain("2 directions");
  expect(html).not.toContain("Explore creative ideas");
  const automatic = renderToStaticMarkup(
    <ProjectSettings run={{ ...run, request: { ...request, selectedStyleIds: undefined } }} />,
  );
  expect(automatic).toContain("Explore creative ideas");
  expect(automatic).toContain("Automatic styles with previews");
});
