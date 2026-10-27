import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const trace = vi.hoisted(() => [] as string[]);
vi.mock("../src/server/domains/video/build-plan", () => ({
  prepareVideoBuildPlan: vi.fn(async () => {
    trace.push("plan");
    return "Implement the approved plan";
  }),
}));
vi.mock("../src/server/jobs/subworkflows/chapter-capture/workflow", () => ({
  capturedChaptersArtifact: "CAPTURED_CHAPTERS.json",
  prepareChapterCaptures: vi.fn(async () => {
    trace.push("chapters");
    return "CAPTURED_CHAPTERS.json";
  }),
}));
vi.mock("../src/server/audio/speech", () => ({
  prepareSpeech: vi.fn(async () => {
    trace.push("speech");
    return undefined;
  }),
}));
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/rendering/render", () => ({
  renderJob: vi.fn(async () => ({ video: "renders/full.mp4", poster: "renders/full.jpg" })),
}));
vi.mock("../src/server/jobs/subworkflows/result-review", () => ({
  reviewFinishedResult: vi.fn(async () => undefined),
}));
import { agentTurn } from "../src/server/agents/providers";
import { prepareVideoBuildPlan } from "../src/server/domains/video/build-plan";
import { generateVideo } from "../src/server/domains/video/workflow";
import { prepareChapterCaptures } from "../src/server/jobs/subworkflows/chapter-capture/workflow";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import type { StyleCandidate } from "../src/shared/contracts";
import { CaptureChapterPlanSchema } from "../src/shared/capture-chapters";
import {
  chapterCardsGuidance,
  footagePlacementGuidance,
} from "../src/server/domains/video/route-prompts/application-demo/shared";
import { ChapterTimingConflictError } from "../src/server/capture/chapter-timing";
import { validStoryboard } from "./fixtures/storyboard";

const folders: string[] = [];
afterEach(async () => {
  trace.length = 0;
  vi.mocked(agentTurn).mockReset();
  vi.mocked(prepareChapterCaptures).mockReset();
  vi.mocked(prepareChapterCaptures).mockImplementation(async () => {
    trace.push("chapters");
    return "CAPTURED_CHAPTERS.json";
  });
  vi.mocked(prepareVideoBuildPlan).mockClear();
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
it.each(["chapters", "retry", "exhausted", "none", "legacy", "narration"] as const)(
  "coordinates planning, %s capture and assembly without extra recording",
  async (mode) => {
    const hasChapters = ["chapters", "retry", "exhausted"].includes(mode);
    const workspace = await mkdtemp(path.join(os.tmpdir(), "capture-workflow-"));
    folders.push(workspace);
    const capturePlan = CaptureChapterPlanSchema.parse({
      scope: "Show the workflow",
      story: "Create then review",
      chapters: [
        {
          id: "create",
          title: "Create",
          purpose: "Show creation",
          startingState: "Open create form",
          actions: ["Create an example"],
          expectedResults: ["Example created"],
          nextChapterContext: "Review the result",
          estimatedDurationSeconds: 10,
        },
      ],
    });
    const job: VideoGenerationJob = {
      id: "job",
      runId: "example",
      candidateId: "direction",
      kind: "full",
      phase: "generating",
      workspace,
      model: "example-model",
      sessionId: "main-session",
      duration: 30,
      buildPlan: {
        model: "example-model",
        sessionId: "main-session",
        value: {
          version: 2,
          width: 1920,
          height: 1080,
          fps: 30,
          durationSeconds: 30,
          plan: "Approved story",
          ...(mode === "legacy" ? {} : { capturePlan: hasChapters ? capturePlan : null }),
        },
      },
    };
    vi.mocked(agentTurn).mockImplementation(async () => {
      trace.push("assembly");
      if (mode === "narration") {
        // Simulate the model's MCP result; no narration exists before its build turn.
        expect(
          JSON.parse(await readFile(path.join(workspace, "audio/narration-config.json"), "utf8"))
            .profiles.default.mode,
        ).toBe("narration");
        await expect(readFile(path.join(workspace, "audio/narration.json"))).rejects.toThrow();
        expect(trace).not.toContain("speech");
        await writeFile(path.join(workspace, "audio/model-created.wav"), "model tool output");
        await writeFile(
          path.join(workspace, "audio/narration.json"),
          JSON.stringify({
            revision: "model-created",
            track: {
              file: "audio/model-created.wav",
              durationSeconds: 1,
              source: "narration",
              cues: [{ text: "Example", startSeconds: 0, endSeconds: 1 }],
            },
            segments: [
              {
                id: "first",
                text: "Example",
                startSeconds: 0,
                showSubtitles: true,
                file: "audio/model-created.wav",
                sourceStartSeconds: 0,
                durationSeconds: 1,
              },
            ],
          }),
        );
      }
      return {
        sessionId: "main-session",
        value: {
          pipeline: "HyperFrames",
          fallbackReason: null,
          sourceFile: "index.html",
          duration: 30,
          width: 1920,
          height: 1080,
          fps: 30,
          styleRenderer: ["HTML"],
          motionEngine: ["GSAP"],
          audioFile: null,
          audioDescription: "Silent",
          limitations: [],
          storyboard: validStoryboard(30),
        },
      };
    });
    const candidate: StyleCandidate = {
      id: "direction",
      primaryStyleId: "style-056",
      supportingStyleIds: [],
      sceneRoles: [],
      rationale: "A connected story",
      feasible: true,
      missingAssets: [],
      score: 90,
      confidence: 0.9,
      dimensions: {},
    };
    if (mode === "retry" || mode === "exhausted") {
      let attempts = 0;
      vi.mocked(prepareChapterCaptures).mockImplementation(async () => {
        trace.push("chapters");
        if (mode === "exhausted" || attempts++ === 0)
          throw new ChapterTimingConflictError({
            chapterId: "create",
            targetDurationSeconds: 10,
            requiredDurationSeconds: 15,
            reason: "Playback stopped late",
          });
        return "CAPTURED_CHAPTERS.json";
      });
    }
    const generation = generateVideo({
      job,
      request: VideoRequestSchema.parse({
        instructions: "Show the application",
        urls: ["https://example.com"],
        duration: 30,
        ...(mode === "narration"
          ? { speech: { mode: "narration", source: "provided", text: "Example" } }
          : {}),
      }),
      brief: {
        subject: "Workflow",
        audience: "Teams",
        objective: "Explain the workflow",
        facts: [],
        exactCopy: [],
        previewBeat: "Create an example",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 30,
        durationReason: "A short walkthrough",
      },
      candidate,
      styles: [],
      signal: new AbortController().signal,
      onEvent: () => {},
      emit: () => {},
      update: () => {},
      render: async (task) => task(),
    });
    if (mode === "exhausted") {
      await expect(generation).rejects.toThrow("Chapter timing conflict");
      expect(prepareVideoBuildPlan).toHaveBeenCalledOnce();
      expect(agentTurn).not.toHaveBeenCalled();
      expect(trace).not.toContain("speech");
      expect(trace).not.toContain("assembly");
      return;
    }
    await generation;
    expect(job.phase).toBe("ready");
    if (mode === "narration") expect(job.speechTrack?.file).toBe("audio/model-created.wav");
    const assembly = vi.mocked(agentTurn).mock.calls[0][0];
    expect(assembly.enableVideoCapture).toBe(mode === "legacy" ? undefined : false);
    expect(assembly.prompt).toContain(footagePlacementGuidance);
    expect(assembly.prompt.split(footagePlacementGuidance)).toHaveLength(2);
    expect(assembly.prompt).toContain(chapterCardsGuidance);
    expect(assembly.prompt.split(chapterCardsGuidance)).toHaveLength(2);
    const planningPrompt = vi.mocked(prepareVideoBuildPlan).mock.calls[0][0].prompt;
    expect(planningPrompt).toContain("SCOPE AND STORY");
    expect(planningPrompt).toContain(chapterCardsGuidance);
    expect(planningPrompt).not.toContain("## 3. Read the native document");
    expect(planningPrompt).not.toContain("RECORDED FRAME SEQUENCE");
    if (mode === "legacy") {
      expect(assembly.prompt).toContain("## 3. Read the native document");
    } else {
      expect(assembly.prompt).toContain("APPLICATION DEMONSTRATION: ASSEMBLY");
      expect(assembly.prompt).not.toContain("## 3. Read the native document");
      expect(assembly.prompt).not.toContain("DISCOVER:");
      expect(assembly.prompt).not.toContain("FILE PICKERS:");
    }
    if (hasChapters) {
      expect(prepareChapterCaptures).toHaveBeenCalledTimes(mode === "retry" ? 2 : 1);
      expect(prepareVideoBuildPlan).toHaveBeenCalledTimes(2);
      expect(
        vi
          .mocked(prepareVideoBuildPlan)
          .mock.calls.every(([call]) => call.captureTimingConflict === undefined),
      ).toBe(true);
      expect(trace.lastIndexOf("chapters")).toBeLessThan(trace.indexOf("assembly"));
      expect(trace).not.toContain("speech");
      expect(trace.indexOf("chapters")).toBeLessThan(trace.indexOf("assembly"));
      expect(assembly.prompt).toContain("CAPTURED_CHAPTERS.json");
      expect(assembly.prompt).toContain("Do not record the chapters again");
      expect(await readFile(path.join(workspace, "EXECUTABLE_PROMPT.md"), "utf8")).toBe(
        assembly.prompt,
      );
    } else expect(prepareChapterCaptures).not.toHaveBeenCalled();
  },
);
