import { expect, it } from "vitest";
import {
  videoModelGuidance,
  videoModelGuidancePolicy,
} from "../src/server/domains/video/model-guidance";
import { buildVideoPrompt } from "../src/server/domains/video/prompts";
import { loadCatalog } from "../src/server/catalog/catalog";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import { buildVideoWorkflowRoutingPrompt } from "../src/server/domains/video/route-prompts";
import { buildApplicationDemoRoutePrompt } from "../src/server/domains/video/route-prompts/application-demo";
import { screenPresentationRoutePrompt } from "../src/server/domains/video/route-prompts/screen-presentation";
import { conceptFilmRoutePrompt } from "../src/server/domains/video/route-prompts/concept-film";
import { mixedFilmRoutePrompt } from "../src/server/domains/video/route-prompts/mixed-film";
import { hyperframesDemoRoutePrompt } from "../src/server/domains/video/route-prompts/application-demo-hyperframes";
import { multiplaneDemoRoutePrompt } from "../src/server/domains/video/route-prompts/application-demo-multiplane";
import { websiteCaptureInstructions } from "../src/server/requests/reference-browser-instructions";

it.each(["hyperframes", "multiplane"] as const)(
  "includes the attributed OpenScreen steps 2–7 once in the %s demo route",
  (renderer) => {
    const prompt = buildVideoWorkflowRoutingPrompt(renderer);
    expect(prompt).toContain(
      "https://github.com/getopenscreen/openscreen/blob/main/plugin/skills/openscreen-demo/SKILL.md",
    );
    for (const heading of [
      "## 2. Plan before recording",
      "## 3. Set the stage",
      "## 4. Record",
      "## 5. Check the take",
      "## 6. Edit",
      "## 7. Export and review",
    ]) {
      expect(prompt.split(heading)).toHaveLength(2);
    }
    expect(prompt).not.toContain("## 1. Set up OpenScreen");
    expect(prompt).not.toContain("## 8. Attach it to the pull request");
    expect(prompt).not.toContain("## 9. Post on X");
    expect(prompt).toContain('action: "stop", recordingId');
    expect(prompt).toContain("stops recording without exporting");
    expect(prompt).toContain("live descriptions and argument schemas");
    expect(prompt).toContain("getCurrentDocument");
    expect(prompt).toContain("getFrames");
    expect(prompt).toContain("Native trims apply the agent's decisions");
    expect(prompt).not.toContain("choose any native trimRegions yourself at capture_video stop");
    expect(websiteCaptureInstructions).not.toContain("## 6. Edit");
  },
);

it.each(["hyperframes", "multiplane"] as const)(
  "plans a connected, complete demo journey before capture for %s",
  (renderer) => {
    const guidance = buildApplicationDemoRoutePrompt(renderer);
    const route = guidance.slice(0, guidance.indexOf("# OpenScreen demo workflow"));
    for (const requirement of [
      "main model planner owns feature selection",
      "verify them against the live application",
      "Check available sitemaps first, then navigation and reachable pages",
      "tabs/search/filters/expanders, forms/buttons and resulting states, and complete workflows",
      "if no sitemap is available, continue with navigation",
      "distinguish inaccessible or unverified ones",
      "Discover broadly, demonstrate selectively",
      "main distinct functionalities and every explicitly requested feature",
      "secondary filters, minor tabs and alternate views may be omitted",
      "exhaustive control-level coverage takes precedence",
      "starting state, capture actions, visible result, connection to the next task and estimated timing",
      "does not automatically cover separate core capabilities",
      "context → action → result",
      "same created item",
      "continuous action within each task",
      "unexplained state resets",
      "does not require extra narration",
      "record missing actions before assembly",
      "section title centered",
      "actual supplied or application-derived product logo",
      "bottom-left or bottom-right corner",
      "one consistent corner",
      "selected Motion Graphics and act-specific direction",
      "must not conceal a state reset or replace feature coverage",
      "chapter names, boundaries, card treatment and timing",
    ])
      expect(route).toContain(requirement);
    // Route A owns story/coverage; the copied skill owns the capture/edit procedure.
    expect(route.trim().split(/\s+/).length).toBeLessThanOrEqual(550);
    expect(route).not.toMatch(/getFrames|addTrims|addSpeed|action: "(?:start|stop|edit|export)"/);
    expect(route).toContain(
      "Follow the OpenScreen skill below for recording, review, editing and export",
    );
    expect(route.indexOf("SCOPE AND STORY")).toBeLessThan(
      route.indexOf("Follow the OpenScreen skill"),
    );
  },
);

it("keeps reusable production principles specific to GPT-6.1 video calls", () => {
  const guidance = videoModelGuidance("codex", "gpt-6.1-sol");
  expect(videoModelGuidancePolicy.gpt61.principles).toHaveLength(8);
  for (const lesson of [
    "coordinate space",
    "from/to values with units",
    "idle, travel, work, react and settle",
    "non-overlapping",
    "word spacing",
    "backward seeks",
    "Compilation",
    "fix only the assigned issue",
    "plans its complete story before implementation in the same session",
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
        instructions:
          "Show an idea. Credits: Avery (AV) — Engineering: built the application. Closing copy: Make ideas move.",
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
    const musicPrompt = "Sparse drums, warm bass. Keep my exact phrasing.";
    const musicRequest = VideoRequestSchema.parse({
      ...input.request,
      requirements: { main: {}, images: {}, urls: {}, music: { instructions: musicPrompt } },
    });
    const musicResult = buildVideoPrompt({ ...input, request: musicRequest });
    expect(musicResult.includes(musicPrompt)).toBe(kind !== "preview");
    expect(musicResult).not.toContain("Use audio_direction to suggest suitable audio");
    expect(musicResult).not.toContain("MUSIC AUTHORING:");
    expect(musicResult).not.toContain("UPLOADED AUDIO:");
    const uploadedMusicPrompt = buildVideoPrompt({
      ...input,
      request: VideoRequestSchema.parse({
        ...musicRequest,
        requirements: {
          ...musicRequest.requirements,
          music: { instructions: musicPrompt, assetIds: ["11111111-1111-4111-8111-111111111111"] },
        },
      }),
    });
    expect(uploadedMusicPrompt.includes("UPLOADED AUDIO:")).toBe(kind !== "preview");
    if (kind !== "preview") {
      expect(uploadedMusicPrompt).toContain("Do not replace supplied audio with generated music");
      expect(uploadedMusicPrompt).toContain(musicPrompt);
    }
    expect(musicResult).not.toContain("continuous musical groove");
    const prompt = buildVideoPrompt(input);
    expect(prompt).toContain(
      `ORIGINAL USER IDEA (verbatim source text):\n${input.request.instructions}\nEND ORIGINAL USER IDEA`,
    );
    expect(prompt).toContain("The brief is a summary, not a replacement for the original idea");
    if (kind === "full") {
      for (const provider of ["codex", "claude"] as const) {
        const selectedPrompt = buildVideoPrompt({
          ...input,
          request: {
            ...input.request,
            provider,
            selectedStyleIds: ["style-018"],
            instructions:
              "Use the selected style for Acts 1–2 and another named Motion Graphic for Act 3.",
          },
        });
        expect(selectedPrompt).toContain(
          "using the user-selected Motion Graphics and the explicit treatments in the brief",
        );
        expect(selectedPrompt).not.toContain("using exactly the user-selected Motion Graphics");
        expect(selectedPrompt).toContain(
          "Every Motion Graphic explicitly named in the requested idea is required even when absent from Settings",
        );
        expect(selectedPrompt).toContain(
          "Do not suggest or rank unrequested alternative Motion Graphics",
        );
        expect(selectedPrompt).not.toContain("search_pool and read_pool_entry");
      }
    }
    expect(prompt).toContain(videoModelGuidance("codex", "gpt-6.1-sol"));
    expect(prompt).toContain("STORYBOARD.json");
    if (kind === "preview") expect(prompt).toContain("PREVIEW SCOPE:");
    if (kind === "refinement") expect(prompt).toContain("REVISION SCOPE:");
    for (const provider of ["codex", "claude"] as const) {
      for (const renderer of ["hyperframes", "multiplane"] as const) {
        const routedPrompt = buildVideoPrompt({
          ...input,
          request: { ...input.request, provider, renderer },
        });
        expect(routedPrompt).toContain(buildVideoWorkflowRoutingPrompt(renderer));
        for (const route of [
          buildApplicationDemoRoutePrompt(renderer),
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
        expect(routedPrompt).toContain(
          renderer === "multiplane" ? "Multiplane contract" : "HyperFrames contract",
        );
        expect(routedPrompt).toContain(
          renderer === "multiplane" ? multiplaneDemoRoutePrompt : hyperframesDemoRoutePrompt,
        );
        expect(routedPrompt).not.toContain(
          renderer === "multiplane" ? hyperframesDemoRoutePrompt : multiplaneDemoRoutePrompt,
        );
      }
    }
  },
);

it("selects exactly one demo integration from the saved renderer setting", () => {
  for (const renderer of ["hyperframes", "multiplane"] as const) {
    const prompt = buildApplicationDemoRoutePrompt(renderer);
    const selected =
      renderer === "multiplane" ? multiplaneDemoRoutePrompt : hyperframesDemoRoutePrompt;
    const excluded =
      renderer === "multiplane" ? hyperframesDemoRoutePrompt : multiplaneDemoRoutePrompt;
    expect(prompt).toContain(selected);
    expect(prompt).not.toContain(excluded);
    expect(prompt).toContain("capture_video");
    expect(prompt).toContain("blocking assetNeeds question");
    expect(prompt).toContain("from the saved renderer setting");
    expect(prompt).toContain("never changes a required demo into Route B");
  }
  // Shared tool guidance cannot reintroduce the unselected renderer's instructions.
  expect(websiteCaptureInstructions).not.toContain(hyperframesDemoRoutePrompt);
  expect(websiteCaptureInstructions).not.toContain(multiplaneDemoRoutePrompt);
  expect(websiteCaptureInstructions).toContain("saved renderer's footage integration guidance");
  expect(multiplaneDemoRoutePrompt).toContain("extract individual frames in advance");
  expect(multiplaneDemoRoutePrompt).toContain(
    "render(t) must synchronously select and draw an already-ready frame",
  );
  expect(multiplaneDemoRoutePrompt).toContain("decoded-frame memory budget");
  expect(multiplaneDemoRoutePrompt).toContain(
    "recorded pointer, click feedback, scrolling, typing, automatic zooms",
  );
  expect(hyperframesDemoRoutePrompt).toContain("do not overlay another cursor or zoom");
});

it.each(["hyperframes", "multiplane"] as const)(
  "requires complete proportional footage fitting for %s",
  (renderer) => {
    const prompt = buildApplicationDemoRoutePrompt(renderer);
    expect(prompt).toContain("contain the entire captured frame inside the film's demo area");
    expect(prompt).toContain(
      "Never use cover, stretching, overflow clipping or extra assembly zoom",
    );
    expect(prompt).toContain("Apply the same fit to extracted frames");
    expect(prompt).toContain("Verify all edges at final resolution");
  },
);

it.each(["hyperframes", "multiplane"] as const)(
  "guides %s demos to assign upload files directly without a native picker",
  (renderer) => {
    const prompt = buildApplicationDemoRoutePrompt(renderer);
    expect(prompt).toContain('actual input[type="file"]');
    expect(prompt).toContain("Puppeteer uploadFile or Playwright setInputFiles");
    expect(prompt).toContain(
      "Do not click the attachment button or open or operate the native file-picker window",
    );
    expect(prompt).toContain("verify the filename, thumbnail or resulting app state");
    expect(prompt).toContain(
      "If registered tools cannot assign files, report that capability limitation",
    );
    expect(prompt).toContain("This does not apply to date or other in-page selection controls");
  },
);
