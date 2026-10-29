import { fixedCorrectionOutcome } from "./fixtures/video-correction";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { validStoryboard } from "./fixtures/storyboard";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import { generateVideo } from "../src/server/domains/video/workflow";
import { loadCatalog } from "../src/server/catalog/catalog";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/rendering/render", () => ({ renderJob: vi.fn() }));
vi.mock("../src/server/jobs/subworkflows/result-review", () => ({ reviewFinishedResult: vi.fn() }));
vi.mock("../src/server/domains/video/storyboard", () => ({
  validateStoryboardJson: vi.fn(),
  writeStoryboardJson: vi.fn(),
  storyboardJsonGuidance: "Preserve the storyboard schema",
}));
import { agentTurn } from "../src/server/agents/providers";
import { renderJob } from "../src/server/rendering/render";
import { reviewFinishedResult } from "../src/server/jobs/subworkflows/result-review";

it("rechecks after all issues, reaches a fifth review, and stops immediately when GPT-6.1's result passes", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "video-review-rounds-"));
  const order: string[] = [];
  const production = {
    pipeline: "HyperFrames" as const,
    fallbackReason: null,
    styleRenderer: ["SVG"],
    motionEngine: ["GSAP"],
    sourceFile: "index.html",
    duration: 3,
    width: 1920,
    height: 1080,
    fps: 30 as const,
    audioDescription: "Silent",
    limitations: [],
  };
  const job: VideoGenerationJob = {
    id: "job",
    runId: "project",
    candidateId: "direction",
    kind: "full",
    model: "gpt-6.1-sol",
    sessionId: "build-session",
    duration: 3,
    phase: "validating",
    workspace,
    production,
  };
  vi.mocked(renderJob).mockImplementation(async () => {
    order.push("render");
    return {} as Awaited<ReturnType<typeof renderJob>>;
  });
  let reviews = 0;
  vi.mocked(reviewFinishedResult).mockImplementation(async () => {
    order.push("review");
    reviews++;
    return {
      pacingPlan: reviews < 5 ? "needs_review" : "balanced",
      styleMatch: reviews < 5 ? "needs_review" : "matched",
      narration: "not_added",
      sungVocals: "not_added",
      music: "not_added",
    };
  });
  vi.mocked(agentTurn).mockImplementation(async (call) => {
    expect(call.model).toBe("gpt-6.1-sol");
    expect(call.sessionId).toBe("build-session");
    order.push(call.prompt.includes("pacing corrector") ? "pacing" : "style");
    return {
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
      sessionId: "build-session",
    };
  });
  try {
    await generateVideo({
      job,
      request: VideoRequestSchema.parse({
        provider: "codex",
        instructions: "Show an idea",
        duration: 3,
      }),
      brief: {
        subject: "An idea",
        audience: "Creators",
        objective: "Explain",
        facts: [],
        exactCopy: [],
        previewBeat: "An idea appears",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 3,
        durationReason: "Short example",
      },
      candidate: {
        id: "direction",
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
      styles: (await loadCatalog()).styles,
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      emit: vi.fn(),
      update: vi.fn(),
      render: (task) => task(),
    });
    expect(order).toEqual([
      ...Array.from({ length: 4 }, () => ["render", "review", "pacing", "style"]).flat(),
      "render",
      "review",
    ]);
    expect(job.phase).toBe("ready");
    expect(job.sessionId).toBe("build-session");
    expect(agentTurn).toHaveBeenCalledTimes(8);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
