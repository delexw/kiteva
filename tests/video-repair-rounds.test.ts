import { runVideoValidation } from "../src/server/domains/video/correction-bypass";
import { fixedCorrectionOutcome } from "./fixtures/video-correction";
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
  declines?: boolean;
  persistent?: boolean;
  interrupt?: "cancel" | "question";
}> = [
  {
    kind: "full",
    provider: "claude",
    renderFails: true,
    diagnostic: "render_threw",
    declines: true,
  },
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
  async ({ kind, renderFails, provider, diagnostic, persistent, interrupt, declines }) => {
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
          if (declines)
            await runVideoValidation(
              job,
              async () => {
                throw failure;
              },
              vi.fn(),
            );
          return { video: "renders/preview.mp4", poster: "renders/preview.jpg" };
        });
      vi.mocked(agentTurn).mockImplementation(async () => {
        order.push("repair");
        expect(job.error).toContain(failure.message);
        if (!persistent) expect(renderJob).toHaveBeenCalledTimes(1);
        if (declines)
          return {
            value: {
              correctionOutcome: {
                status: "unresolved",
                reason: "The supplied check does not identify an implementable repair.",
              },
            },
          };
        return {
          value: {
            correctionOutcome: fixedCorrectionOutcome,
            storyboard: validStoryboard(production.duration),
          },
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
            ? videoCorrectionPolicy.claudeEfforts.length + videoCorrectionPolicy.claudeMainRounds
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
      if (declines) {
        expect(order).toEqual(["check", "repair", "repair", "recheck"]);
        expect(job.phase).toBe("ready");
        expect(job.correctionBypasses).toHaveLength(1);
        expect(vi.mocked(agentTurn).mock.calls.map(([call]) => call.model)).toEqual([
          "claude-haiku-5-5",
          "claude-opus-5-5",
        ]);
        expect(reviewFinishedResult).toHaveBeenCalledOnce();
        return;
      }
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

it.each(["claude", "codex"] as const)(
  "%s repairs an initial rejected storyboard before rendering the preview",
  async (provider) => {
    vi.resetAllMocks();
    const { StructuredOutputError } = await import("../src/server/agents/structured-output-error");
    const { videoGenerationOutputSchemaForDuration } =
      await import("../src/shared/agents/schemas/video");
    const workspace = await mkdtemp(path.join(os.tmpdir(), "storyboard-repair-"));
    const production = {
      pipeline: "HyperFrames" as const,
      fallbackReason: null,
      styleRenderer: ["SVG"],
      motionEngine: ["GSAP"],
      sourceFile: "index.html",
      duration: 3,
      width: 1280,
      height: 720,
      fps: 30 as const,
      audioDescription: "Silent",
      limitations: [],
    };
    const job: VideoGenerationJob = {
      id: "job",
      runId: "project",
      candidateId: "direction",
      kind: "preview",
      duration: 3,
      model: "selected-main",
      phase: "queued",
      workspace,
    };
    const storyboard = validStoryboard();
    const beat = storyboard.scenes[0].beats[0];
    storyboard.scenes[0].beats = [
      { ...beat, endSeconds: 1.5 },
      { ...beat, startSeconds: 1.4 },
    ];
    const rejected = {
      ...production,
      storyboard,
      displayTitle: "Original title",
      displayDescription: "Original description",
    };
    const parsed = videoGenerationOutputSchemaForDuration(3).safeParse(rejected);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw Error("Fixture must fail validation");
    const candidate = {
      id: "direction",
      primaryStyleId: "style-001",
      supportingStyleIds: [],
      sceneRoles: [],
      rationale: "An explanation",
      feasible: true,
      missingAssets: [],
      score: 1,
      confidence: 1,
      dimensions: {},
    } as StyleCandidate;
    vi.mocked(agentTurn).mockRejectedValueOnce(
      new StructuredOutputError(parsed.error, rejected, "original-session"),
    );
    vi.mocked(agentTurn).mockImplementationOnce(async (options) => {
      expect(renderJob).not.toHaveBeenCalled();
      expect(options.promptContext).toMatchObject({
        currentManifest: production,
        correctionTask: { evidence: { issues: parsed.error.issues, rejectedOutput: rejected } },
      });
      expect(job.sessionId).toBe("original-session");
      expect(options.reasoningEffort).toBe(provider === "claude" ? "medium" : undefined);
      return {
        value: { correctionOutcome: fixedCorrectionOutcome, storyboard: validStoryboard() },
        sessionId: "repair-session",
      };
    });
    vi.mocked(renderJob).mockResolvedValue({
      video: "renders/preview.webm",
      poster: "renders/preview.jpg",
    });
    try {
      await generateVideo({
        job,
        request: VideoRequestSchema.parse({ instructions: "Create a generic video", provider }),
        brief: {
          subject: "Example",
          audience: "Learners",
          objective: "Explain",
          facts: [],
          exactCopy: [],
          previewBeat: "Introduce",
          assetDescriptions: [],
          constraints: [],
          suggestedDuration: 3,
          durationReason: "Short preview",
        },
        candidate,
        styles: [],
        signal: new AbortController().signal,
        update: vi.fn(),
        onEvent: vi.fn(),
        emit: vi.fn(),
        render: (task) => task(),
      });
      expect(agentTurn).toHaveBeenCalledTimes(2);
      expect(renderJob).toHaveBeenCalledOnce();
      expect(job.phase).toBe("ready");
      expect(job.production).toEqual({
        ...production,
        displayTitle: "Original title",
        displayDescription: "Original description",
      });
      expect(candidate.displayTitle).toBe("Original title");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
