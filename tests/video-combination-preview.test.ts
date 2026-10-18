import { videoPacingPolicy } from "../src/server/domains/video/pacing";
import { BriefSchema, type Brief } from "../src/shared/agents/schemas/video";
import { expect, it } from "vitest";
import { buildVideoPrompt } from "../src/server/domains/video/prompts";
import { loadCatalog } from "../src/server/catalog/catalog";
import { type StyleCandidate } from "../src/shared/contracts";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";

it("requires all combination styles to appear within the same three-second preview", async () => {
  const catalog = await loadCatalog();
  const candidate: StyleCandidate = {
    id: "candidate-1",
    primaryStyleId: "style-046",
    supportingStyleIds: ["style-100", "style-027"],
    sceneRoles: ["Paper throughout", "Morph the final scene", "Draw the closing line"],
    rationale: "A connected unfolding scene",
    feasible: true,
    missingAssets: [],
    score: 90,
    confidence: 0.9,
    dimensions: {},
  };
  const brief: Brief = {
    subject: "An unfolding idea",
    audience: "Creators",
    objective: "Show transformation",
    facts: [],
    exactCopy: [],
    assetDescriptions: [],
    constraints: [],
    previewBeat: "A folded shape unfolds",
    suggestedDuration: 30,
    durationReason: "Several scenes",
  };
  const job: VideoGenerationJob = {
    id: "preview-1",
    runId: "project-1",
    candidateId: candidate.id,
    kind: "preview",
    phase: "queued",
    workspace: "/tmp/example",
    model: "example-model",
    duration: 3,
  };
  const input = {
    candidate,
    brief,
    job,
    styles: catalog.styles,
    request: VideoRequestSchema.parse({ instructions: "An unfolding idea", outputType: "video" }),
    width: 1280,
    height: 720,
  };
  const prompt = buildVideoPrompt(input);
  const sixtyFps = buildVideoPrompt({
    ...input,
    request: { ...input.request, frameRate: 60, resolution: "1440p" },
    width: 2560,
    height: 1440,
  });
  expect(sixtyFps).toContain("data-fps='60'");
  expect(sixtyFps).toContain("durationInFrames=180");
  expect(sixtyFps).toContain("Dimensions MUST be 2560x1440");
  expect(prompt).not.toContain("DURATION AND PACING RULES:");
  expect(prompt).not.toContain("FULL-VIDEO TEXT AND INSTRUMENTAL RULES:");
  expect(prompt).toContain("vendor/pica.min.js");
  expect(prompt).toContain("Keep original files unchanged; save derivatives separately");
  expect(prompt).toContain("screenshot text to remain readable");
  expect(prompt).toContain("never resize asynchronously during frame updates or seeking");
  for (const style of catalog.styles) {
    const fullPrompt = buildVideoPrompt({
      ...input,
      candidate: { ...candidate, primaryStyleId: style.id },
      job: { ...job, kind: "full", duration: 120 },
    });
    expect(fullPrompt).toContain("DURATION AND PACING RULES:");
    expect(fullPrompt).toContain("self-check every headline");
    expect(fullPrompt).toContain("explicit inter-word spacing");
    expect(fullPrompt).toContain("including the final title");
    expect(fullPrompt).toContain("Avoid repeated bell, chime, plink");
    expect(fullPrompt).toContain("continuous musical groove");
    expect(fullPrompt).toContain("do not claim a visual pass");
    expect(fullPrompt).toContain(videoPacingPolicy.editorial);
    expect(fullPrompt).toContain(videoPacingPolicy.reading);
    expect(fullPrompt).toContain(videoPacingPolicy.coherence);
    expect(fullPrompt).toContain("By default, favor brisk, energetic pacing");
    expect(fullPrompt).toContain("Explicit user direction takes precedence");
    expect(fullPrompt).toContain("not a fixed speed multiplier");
    expect(fullPrompt).toContain("Preserve natural narration speed");
    expect(fullPrompt).not.toContain("every 2–4 seconds");
    expect(fullPrompt).toContain("not longer versions of the same six scenes");
    expect(fullPrompt).toContain("Include a pacing audit with timed beats");
    expect(fullPrompt).toContain("duration MUST be 120");
  }
  expect(prompt).toContain("Paper Cutout Illustration + Shape Morphing + Line Art");
  expect(prompt).toContain(
    "make every supporting Motion Graphic's distinctive contribution visible",
  );
  expect(prompt).toContain("do not postpone a supporting Motion Graphic");
  expect(prompt).toContain("transition must start and finish within the three seconds");
  expect(
    buildVideoPrompt({ ...input, candidate: { ...candidate, supportingStyleIds: [] } }),
  ).not.toContain("COMBINATION PREVIEW:");
  expect(buildVideoPrompt({ ...input, job: { ...job, kind: "full", duration: 30 } })).not.toContain(
    "COMBINATION PREVIEW:",
  );
});

it("demonstrates all five selected styles within a three-second preview", async () => {
  const styles = (await loadCatalog()).styles;
  const selected = styles.slice(0, 5);
  const job = {
    id: "preview",
    runId: "project",
    candidateId: "direction",
    kind: "preview" as const,
    phase: "queued" as const,
    duration: 3,
    model: "selected-main",
    workspace: "/tmp/example-preview",
  };
  const candidate = {
    id: "direction",
    primaryStyleId: selected[0].id,
    supportingStyleIds: selected.slice(1).map((s) => s.id),
    sceneRoles: [],
    rationale: "Five coherent contributions",
    feasible: true,
    missingAssets: [],
    score: 90,
    confidence: 1,
    dimensions: {},
  };
  const prompt = buildVideoPrompt({
    job,
    candidate,
    styles,
    request: VideoRequestSchema.parse({ instructions: "Explain a complete idea", duration: 300 }),
    brief: BriefSchema.parse({
      subject: "An idea",
      audience: "Viewers",
      objective: "Explain",
      facts: [],
      exactCopy: [],
      previewBeat: "An idea unfolds",
      assetDescriptions: [],
      constraints: [],
      suggestedDuration: 300,
      durationReason: "A detailed story",
    }),
    width: 1280,
    height: 720,
  });
  for (const style of selected) expect(prompt).toContain(style.name_en);
  expect(prompt).toContain("Within this same 3-second scene");
});
