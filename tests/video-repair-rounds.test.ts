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
import {
  RendererDiagnosticError,
  formatMultiplaneDiagnostic,
} from "../src/server/rendering/diagnostics";
import { InputRequired } from "../src/shared/input-checkpoint";
import { videoCorrectionPolicy } from "../src/server/domains/video/corrector";
import { correctionRoundBudget } from "../src/server/agents/correction-rounds";

const cases: Array<{
  kind: "preview" | "full";
  renderFails: boolean;
  provider?: "claude" | "codex";
  diagnostic?: "render_threw" | "resource_failed";
  persistent?: boolean;
  interrupt?: "cancel" | "question";
}> = [
  { kind: "preview", renderFails: true },
  { kind: "preview", renderFails: false },
  { kind: "full", renderFails: true },
  ...(["claude", "codex"] as const).flatMap((provider) => [
    { kind: "preview" as const, provider, renderFails: true, diagnostic: "render_threw" as const },
    {
      kind: "preview" as const,
      provider,
      renderFails: true,
      diagnostic: "resource_failed" as const,
    },
    {
      kind: "preview" as const,
      provider,
      renderFails: true,
      diagnostic: "render_threw" as const,
      persistent: true,
    },
  ]),
  { kind: "preview", renderFails: true, interrupt: "cancel" },
  { kind: "preview", renderFails: true, interrupt: "question" },
];
it.each(cases)(
  "$kind repairs only failures (provider=$provider, diagnostic=$diagnostic, persistent=$persistent, interrupt=$interrupt)",
  async ({ kind, renderFails, provider, diagnostic, persistent, interrupt }) => {
    vi.resetAllMocks();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "repair-round-"));
    try {
      const production = {
        pipeline: diagnostic ? ("Multiplane" as const) : ("HyperFrames" as const),
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
      const failure = diagnostic
        ? new RendererDiagnosticError(
            "Preview rendering failed",
            [
              formatMultiplaneDiagnostic("render", {
                code: diagnostic,
                severity: "error",
                message:
                  diagnostic === "render_threw"
                    ? "Negative Canvas arc radius"
                    : "E.inOutSine is not a function",
                sourceFile: "index.html",
                time: 1 / 60,
              }),
            ],
            "renders/diagnostics.jsonl",
          )
        : new VideoQaError(findings);
      const controller = new AbortController();
      const order: string[] = [];
      vi.mocked(renderJob)
        .mockImplementationOnce(async () => {
          order.push("check");
          if (interrupt === "cancel") {
            controller.abort();
            throw Error("Cancelled rendering");
          }
          if (interrupt === "question") throw new InputRequired();
          if (renderFails) throw failure;
          return { video: "renders/preview.webm", poster: "renders/preview.jpg" };
        })
        .mockImplementation(async () => {
          order.push("recheck");
          expect(job.phase).toBe("rendering");
          expect(job.error).toBeUndefined();
          expect(job.errorCode).toBeUndefined();
          if (persistent) throw failure;
          return { video: "renders/preview.mp4", poster: "renders/preview.jpg" };
        });
      vi.mocked(agentTurn).mockImplementation(async () => {
        order.push("repair");
        expect(job.error).toContain(failure.message);
        if (!persistent) expect(renderJob).toHaveBeenCalledTimes(1);
        return {
          value: { storyboard: validStoryboard(production.duration) },
          sessionId: "repair-session",
        };
      });
      const generation = generateVideo({
        job,
        request: VideoRequestSchema.parse({
          instructions: "Create a generic video",
          ...(provider ? { provider } : {}),
          ...(diagnostic ? { renderer: "multiplane" } : {}),
        }),
        brief,
        candidate,
        styles: [],
        signal: controller.signal,
        update: vi.fn(),
        onEvent: vi.fn(),
        emit: vi.fn(),
        render: async (task) => task(),
      });
      if (interrupt) {
        await expect(generation).rejects.toThrow(
          interrupt === "question" ? InputRequired : "abort",
        );
        expect(agentTurn).not.toHaveBeenCalled();
        expect(renderJob).toHaveBeenCalledOnce();
        return;
      }
      if (persistent) {
        await expect(generation).rejects.toThrow("correction round limit");
        const attempts =
          provider === "claude"
            ? videoCorrectionPolicy.claudeEfforts.length
            : correctionRoundBudget.main;
        expect(agentTurn).toHaveBeenCalledTimes(attempts);
        expect(renderJob).toHaveBeenCalledTimes(attempts + 1);
        expect(reviewFinishedResult).not.toHaveBeenCalled();
        return;
      }
      if (!renderFails) {
        await generation;
        expect(job.phase).toBe("ready");
        expect(order).toEqual(["check"]);
        expect(agentTurn).not.toHaveBeenCalled();
        expect(reviewFinishedResult).not.toHaveBeenCalled();
        return;
      }
      await generation;
      expect(order).toEqual(
        diagnostic
          ? ["check", "repair", "recheck"]
          : ["check", "repair", "repair", "repair", "recheck"],
      );
      expect(job.production).toEqual(production);
      expect(job.phase).toBe("ready");
      if (kind === "preview") expect(reviewFinishedResult).not.toHaveBeenCalled();
      const calls = vi.mocked(agentTurn).mock.calls.map(([call]) => call);
      if (diagnostic) {
        expect(calls).toHaveLength(1);
        expect(calls[0].promptContext).toMatchObject({
          correctionTask: {
            evidence: {
              reportFile: "renders/diagnostics.jsonl",
              diagnostics: [{ code: diagnostic }],
            },
          },
        });
        expect(calls[0].prompt).toContain("technical corrector");
        return;
      }
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
