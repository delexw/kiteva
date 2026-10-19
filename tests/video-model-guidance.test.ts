import { expect, it } from "vitest";
import {
  videoModelGuidance,
  videoModelGuidancePolicy,
} from "../src/server/domains/video/model-guidance";
import { buildVideoPrompt } from "../src/server/domains/video/prompts";
import { loadCatalog } from "../src/server/catalog/catalog";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import { videoWorkflowRoutingPrompt } from "../src/server/domains/video/route-prompts";
import { applicationDemoRoutePrompt } from "../src/server/domains/video/route-prompts/application-demo";
import { screenPresentationRoutePrompt } from "../src/server/domains/video/route-prompts/screen-presentation";
import { conceptFilmRoutePrompt } from "../src/server/domains/video/route-prompts/concept-film";
import { mixedFilmRoutePrompt } from "../src/server/domains/video/route-prompts/mixed-film";

it("keeps reusable production principles specific to GPT-6.1 video calls", () => {
  const guidance = videoModelGuidance("codex", "gpt-6.1-sol");
  expect(videoModelGuidancePolicy.gpt61.principles).toHaveLength(8);
  for (const lesson of [
    "coordinate space",
    "from/to values with units",
    "idle, travel, work, react and settle",
    "non-overlapping",
    "word spacing",
    "repetitive ding",
    "backward seeks",
    "Compilation",
    "fix only the assigned issue",
    "without another planning call",
  ])
    expect(guidance).toContain(lesson);
  expect(videoModelGuidance("claude", "gpt-6.1-sol")).toBe("");
  expect(videoModelGuidance("codex", "gpt-6-luna")).toBe("");
  expect(videoModelGuidance("codex", "gpt-6-astra")).toBe("");
});

it.each(["preview", "full", "refinement"] as const)(
  "includes the same principles in the %s prompt without replacing its scope or selected Motion Graphic",
  async (kind) => {
    const styles = (await loadCatalog()).styles;
    const job: VideoGenerationJob = {
      id: "job",
      runId: "project",
      candidateId: "candidate",
      kind: kind === "preview" ? "preview" : "full",
      model: "gpt-6.1-sol",
      duration: kind === "preview" ? 3 : 30,
      phase: "queued",
      workspace: "/tmp/example",
      ...(kind === "refinement" ? { refinementPrompt: "Make the heading larger" } : {}),
    };
    const input = {
      job,
      styles,
      width: 1280,
      height: 720,
      request: VideoRequestSchema.parse({
        provider: "codex",
        instructions: "Show an idea",
        duration: 30,
      }),
      brief: {
        subject: "An idea",
        audience: "Creators",
        objective: "Explain",
        facts: [],
        exactCopy: [],
        previewBeat: "A shape unfolds",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 30,
        durationReason: "Several scenes",
      },
      candidate: {
        id: "candidate",
        primaryStyleId: "style-018",
        supportingStyleIds: [],
        sceneRoles: [],
        rationale: "Clarity",
        feasible: true,
        missingAssets: [],
        score: 90,
        confidence: 0.9,
        dimensions: {},
      },
    };
    const prompt = buildVideoPrompt(input);
    expect(prompt).toContain(videoModelGuidance("codex", "gpt-6.1-sol"));
    expect(prompt).toContain("STORYBOARD.json");
    if (kind === "preview") expect(prompt).toContain("PREVIEW SCOPE:");
    if (kind === "refinement") expect(prompt).toContain("REVISION SCOPE:");
    for (const provider of ["codex", "claude"] as const) {
      const routedPrompt = buildVideoPrompt({ ...input, request: { ...input.request, provider } });
      expect(routedPrompt).toContain(videoWorkflowRoutingPrompt);
      for (const route of [
        applicationDemoRoutePrompt,
        screenPresentationRoutePrompt,
        conceptFilmRoutePrompt,
        mixedFilmRoutePrompt,
      ])
        expect(routedPrompt).toContain(route);
      expect(routedPrompt).toContain("A supplied URL alone does not select a demo route");
      expect(routedPrompt).toContain(
        "Do not impose fixed feature-by-feature slots unless the user explicitly requests them",
      );
      if (kind === "preview") expect(routedPrompt).toContain("PREVIEW SCOPE:");
      if (kind === "refinement") expect(routedPrompt).toContain("REVISION SCOPE:");
    }
  },
);
