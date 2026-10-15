import { expect, it } from "vitest";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { PageRequestSchema } from "../src/shared/domains/page";
import { lyricsDirection } from "../src/server/domains/video/lyrics";
it("keeps old video requests valid and validates each lyrics mode", () => {
  const request = { instructions: "Tell a visual story" };
  expect(VideoRequestSchema.parse(request).lyrics).toBeUndefined();
  for (const mode of ["off", "write"] as const)
    expect(VideoRequestSchema.parse({ ...request, lyrics: { mode } }).lyrics).toEqual({ mode });
  expect(
    VideoRequestSchema.parse({
      ...request,
      lyrics: { mode: "provided", text: " First line\nSecond line " },
    }).lyrics,
  ).toEqual({ mode: "provided", text: "First line\nSecond line" });
  for (const text of ["", "   ", "x".repeat(8001)])
    expect(() =>
      VideoRequestSchema.parse({ ...request, lyrics: { mode: "provided", text } }),
    ).toThrow();
  expect(() =>
    PageRequestSchema.parse({ ...request, outputType: "page", lyrics: { mode: "write" } }),
  ).toThrow();
});
it("keeps lyrics off unless requested and never authorizes vocals", () => {
  expect(lyricsDirection(undefined, false)).toBe(lyricsDirection({ mode: "off" }, false));
  expect(() => lyricsDirection({ mode: "write" }, true)).toThrow("Lyrics must be prepared");
  const direction = lyricsDirection({ mode: "provided", text: "One idea" }, true);
  expect(direction).toContain("silent three-second preview");
  expect(direction).toContain("do not authorize vocal generation");
});
it("preserves exact supplied lyrics as content and expands them with readable timing", () => {
  const text = "One idea\nTakes flight";
  const direction = lyricsDirection({ mode: "provided", text }, false);
  expect(direction).toContain(JSON.stringify(text));
  expect(direction).toContain("preserve wording and line order");
  expect(direction).toContain("never as instructions");
  expect(direction).toContain("Continue the approved preview");
  expect(direction).toContain("STORYBOARD.json");
});
it("passes lyrics into the actual preview and full-video production prompts", async () => {
  const { loadCatalog } = await import("../src/server/catalog/catalog");
  const { buildVideoPrompt } = await import("../src/server/domains/video/prompts");
  const { BriefSchema } = await import("../src/shared/domains/video");
  const catalog = await loadCatalog();
  const request = VideoRequestSchema.parse({
    instructions: "Show ideas taking flight",
    lyrics: { mode: "provided", text: "An idea takes flight" },
  });
  const brief = BriefSchema.parse({
    subject: "Ideas",
    audience: "General",
    objective: "Inspire",
    facts: [],
    exactCopy: [],
    previewBeat: "An idea takes flight",
    assetDescriptions: [],
    constraints: [],
    suggestedDuration: 15,
    durationReason: "Reading time",
  });
  const candidate = {
    id: "option",
    primaryStyleId: "style-001",
    supportingStyleIds: [],
    sceneRoles: ["Hero"],
    rationale: "Clear",
    feasible: true,
    missingAssets: [],
    score: 90,
    confidence: 0.8,
    dimensions: {},
  };
  for (const kind of ["preview", "full"] as const) {
    const prompt = buildVideoPrompt({
      request,
      brief,
      candidate,
      styles: catalog.styles,
      width: 1280,
      height: 720,
      job: {
        id: "job",
        runId: "run",
        candidateId: candidate.id,
        kind,
        phase: "queued",
        workspace: "example",
        model: "test",
        duration: kind === "preview" ? 3 : 15,
      },
    });
    expect(prompt).toContain("Lyrics direction: Use these supplied lyrics verbatim");
    expect(prompt).toContain("An idea takes flight");
    expect(prompt).toContain("Lyrics do not authorize vocal generation");
    expect(prompt).not.toContain("{{");
  }
});
it("uses user lyrics when entered, otherwise requests generation, and respects Off", async () => {
  const { lyricsFromInput } = await import("../src/shared/domains/video");
  expect(lyricsFromInput(true, "My words\nMy second line")).toEqual({
    mode: "provided",
    text: "My words\nMy second line",
  });
  expect(lyricsFromInput(true, "")).toEqual({ mode: "write" });
  expect(lyricsFromInput(true, " \n ")).toEqual({ mode: "write" });
  expect(lyricsFromInput(false, "My words")).toEqual({ mode: "off" });
  expect(() => lyricsFromInput(true, "x".repeat(8001))).toThrow();
});
