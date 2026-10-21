import { validStoryboard } from "./fixtures/storyboard";
import { expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import type { StyleCandidate } from "../src/shared/contracts";
import type { Brief } from "../src/shared/agents/schemas/video";
import { VideoQaError, VideoQaReportSchema, videoQaFindings } from "../src/server/domains/video/qa";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/rendering/render", () => ({ renderJob: vi.fn() }));
vi.mock("../src/server/jobs/subworkflows/result-review", () => ({ reviewFinishedResult: vi.fn() }));
vi.mock("../src/server/domains/video/storyboard", () => ({
  validateStoryboardJson: vi.fn(),
  writeStoryboardJson: vi.fn(),
  storyboardJsonGuidance: "Use structured JSON",
}));
vi.mock("../src/server/domains/video/prompts", () => ({
  buildVideoPrompt: () => "Create a generic video",
}));
import { agentTurn } from "../src/server/agents/providers";
import { reviewFinishedResult } from "../src/server/jobs/subworkflows/result-review";
import { renderJob } from "../src/server/rendering/render";
import { generateVideo } from "../src/server/domains/video/workflow";

it.each([
  { kind: "preview" as const, renderFails: true },
  { kind: "preview" as const, renderFails: false },
  { kind: "full" as const, renderFails: true },
])(
  "$kind with render failure=$renderFails only repairs full films",
  async ({ kind, renderFails }) => {
    vi.resetAllMocks();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "repair-round-"));
    try {
      const production = {
        pipeline: "HyperFrames" as const,
        fallbackReason: null,
        styleRenderer: ["SVG"],
        motionEngine: ["GSAP"],
        sourceFile: "index.html",
        duration: 3,
        width: kind === "full" ? 1920 : 1280,
        height: kind === "full" ? 1080 : 720,
        fps: 30 as const,
        audioDescription: "Silent",
        limitations: [],
      };
      const job: VideoGenerationJob = {
        id: "job",
        runId: "project",
        candidateId: "direction",
        kind,
        duration: 3,
        model: "selected-main",
        sessionId: "generation-session",
        phase: "queued",
        workspace,
        production,
      };
      const candidate: StyleCandidate = {
        id: "direction",
        primaryStyleId: "style-001",
        supportingStyleIds: [],
        sceneRoles: [],
        rationale: "A generic direction",
        feasible: true,
        missingAssets: [],
        score: 90,
        confidence: 0.9,
        dimensions: {},
      };
      const brief: Brief = {
        subject: "An idea",
        audience: "Creators",
        objective: "Explain an idea",
        facts: [],
        exactCopy: [],
        previewBeat: "Reveal",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 30,
        durationReason: "A short video",
      };
      const pass = { ok: true, findings: [] };
      const findings = videoQaFindings(
        VideoQaReportSchema.parse({
          ok: false,
          browserSkipped: false,
          lint: pass,
          runtime: pass,
          motion: pass,
          layout: {
            ok: false,
            findings: [
              { severity: "error", selector: "#first" },
              { severity: "error", selector: "#second" },
            ],
          },
          contrast: { ok: false, findings: [{ severity: "error", selector: "#third" }] },
        }),
      );
      const order: string[] = [];
      vi.mocked(renderJob)
        .mockImplementationOnce(async () => {
          order.push("check");
          if (renderFails) throw new VideoQaError(findings);
          return { video: "renders/preview.webm", poster: "renders/preview.jpg" };
        })
        .mockImplementationOnce(async () => {
          order.push("recheck");
          expect(job.phase).toBe("rendering");
          expect(job.error).toBeUndefined();
          expect(job.errorCode).toBeUndefined();
          return { video: "renders/preview.mp4", poster: "renders/preview.jpg" };
        });
      vi.mocked(agentTurn).mockImplementation(async () => {
        order.push("repair");
        expect(job.error).toContain("Video QA requires");
        expect(renderJob).toHaveBeenCalledTimes(1);
        return {
          value: { ...production, storyboard: validStoryboard(production.duration) },
          sessionId: "repair-session",
        };
      });
      const generation = generateVideo({
        job,
        request: VideoRequestSchema.parse({ instructions: "Create a generic video" }),
        brief,
        candidate,
        styles: [],
        signal: new AbortController().signal,
        update: vi.fn(),
        onEvent: vi.fn(),
        emit: vi.fn(),
        render: async (task) => task(),
      });
      if (kind === "preview") {
        if (renderFails) await expect(generation).rejects.toBeInstanceOf(VideoQaError);
        else {
          await generation;
          expect(job.phase).toBe("ready");
        }
        expect(order).toEqual(["check"]);
        expect(agentTurn).not.toHaveBeenCalled();
        expect(reviewFinishedResult).not.toHaveBeenCalled();
        return;
      }
      await generation;
      expect(order).toEqual(["check", "repair", "repair", "repair", "recheck"]);
      expect(job.phase).toBe("ready");
      const calls = vi.mocked(agentTurn).mock.calls.map(([call]) => call);
      expect(calls.map((call) => call.sessionId)).toEqual([
        undefined,
        "repair-session",
        "repair-session",
      ]);
      for (const [index, selector] of ["#first", "#second", "#third"].entries())
        expect(JSON.stringify(calls[index].promptContext)).toContain(selector);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
