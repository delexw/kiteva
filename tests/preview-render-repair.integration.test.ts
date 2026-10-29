import { prepareProjectLayout, projectArtifactPath } from "../src/server/runtime/workspace";
import { fixedCorrectionOutcome } from "./fixtures/video-correction";
import { writePreviewPlan } from "../src/server/jobs/preview-plan";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { validStoryboard } from "./fixtures/storyboard";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import { BriefSchema, ProductionSchema } from "../src/shared/agents/schemas/video";
import type { StyleCandidate } from "../src/shared/contracts";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/jobs/subworkflows/result-review", () => ({ reviewFinishedResult: vi.fn() }));
vi.mock("../src/server/rendering/render", async (load) => {
  const actual = await load<typeof import("../src/server/rendering/render")>();
  return { ...actual, renderJob: vi.fn(actual.renderJob) };
});
import { agentTurn } from "../src/server/agents/providers";
import { renderJob } from "../src/server/rendering/render";
import { reviewFinishedResult } from "../src/server/jobs/subworkflows/result-review";
import { generateVideo } from "../src/server/domains/video/workflow";
import { writeStoryboardJson } from "../src/server/domains/video/storyboard";
import { probeVideo } from "../src/server/rendering/video-probe";

it.skipIf(process.env.KITEVA_TEST_LOCAL_PREVIEW_REPAIR !== "1").each([false, true])(
  "repairs a real Canvas runtime failure and renders a silent preview (structured=%s)",
  async (structured) => {
    vi.clearAllMocks();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "preview-render-repair-"));
    const controller = new AbortController();
    try {
      if (structured) await prepareProjectLayout(workspace);
      const entry = projectArtifactPath(workspace, "shot.html");
      const sourceFile = path.join(workspace, entry);
      await writeFile(
        sourceFile,
        `<!doctype html><link rel="stylesheet" href="/multiplane/runtime/shot.css">
<div id="stage" style="width:1280px;height:720px"><canvas id="scene" width="1280" height="720"></canvas></div>
<script src="/multiplane/runtime/shot.js"></script><script>
const ctx = document.getElementById('scene').getContext('2d');
Shot.define({duration:3,fps:30,render(t){
ctx.fillStyle='#111827';ctx.fillRect(0,0,1280,720);
const radius=20+t*30;ctx.fillStyle='#70cc80';ctx.beginPath();
if(t===0)return;ctx.arc(640,360,radius - 30,0,Math.PI*2);ctx.fill();
}});</script>`,
      );
      const production = ProductionSchema.parse({
        pipeline: "Multiplane",
        fallbackReason: null,
        styleRenderer: ["Canvas 2D"],
        motionEngine: ["Time-driven Canvas"],
        sourceFile: entry,
        duration: 3,
        width: 1280,
        height: 720,
        fps: 30,
        audioDescription: "Silent",
        limitations: [],
      });
      const job: VideoGenerationJob = {
        id: "preview",
        runId: "example-project",
        candidateId: "example-direction",
        kind: "preview",
        duration: 3,
        model: "selected-main",
        phase: "validating",
        workspace,
      };
      const candidate: StyleCandidate = {
        id: "example-direction",
        primaryStyleId: "style-001",
        supportingStyleIds: [],
        sceneRoles: [],
        rationale: "A shape reveal",
        feasible: true,
        missingAssets: [],
        score: 90,
        confidence: 0.9,
        dimensions: {},
      };
      const brief = BriefSchema.parse({
        subject: "A shape",
        audience: "Creators",
        objective: "Reveal a shape",
        facts: [],
        exactCopy: [],
        previewBeat: "A circle appears",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 3,
        durationReason: "A short preview",
      });
      await writePreviewPlan(workspace, brief, [candidate]);
      await writeStoryboardJson(workspace, validStoryboard(), 3);
      vi.mocked(agentTurn).mockImplementation(async (options) => {
        if (options.prompt.startsWith("# Build this preview")) {
          expect(options.sessionId).toBeUndefined();
          expect(options.readOnly).toBeUndefined();
          expect(
            JSON.parse(await readFile(path.join(workspace, "PREVIEW_PLAN.json"), "utf8"))
              .directions,
          ).toEqual([candidate]);
          return {
            value: {
              ...production,
              displayTitle: "Shape reveal",
              displayDescription: "A circle appears",
              storyboard: validStoryboard(),
            },
            sessionId: "build-session",
          };
        }

        expect(options.prompt).toContain("technical corrector");
        const context = z
          .object({ correctionTask: z.object({ evidence: z.object({ reportFile: z.string() }) }) })
          .parse(options.promptContext);
        const report = await readFile(
          path.resolve(workspace, context.correctionTask.evidence.reportFile),
          "utf8",
        );
        expect(report).toContain("radius");
        const source = await readFile(sourceFile, "utf8");
        await writeFile(sourceFile, source.replace("radius - 30", "Math.max(0, radius - 30)"));
        return {
          value: { correctionOutcome: fixedCorrectionOutcome, storyboard: validStoryboard() },
          sessionId: "repair-session",
        };
      });
      await generateVideo({
        job,
        candidate,
        request: VideoRequestSchema.parse({
          instructions: "A shape reveal",
          provider: "claude",
          renderer: "multiplane",
        }),
        brief,
        styles: [],
        signal: controller.signal,
        onEvent: vi.fn(),
        emit: vi.fn(),
        update: vi.fn(),
        render: async (task) => task(),
      });
      expect(job.phase).toBe("ready");
      expect(agentTurn).toHaveBeenCalledTimes(2);
      expect(renderJob).toHaveBeenCalledTimes(2);
      expect(reviewFinishedResult).not.toHaveBeenCalled();
      const probe = await probeVideo(path.join(workspace, job.video!), controller.signal);
      expect(probe.streams.some((stream) => stream.codec_type === "video")).toBe(true);
      expect(probe.streams.some((stream) => stream.codec_type === "audio")).toBe(false);
    } finally {
      controller.abort();
      await rm(workspace, { recursive: true, force: true });
    }
  },
  90000,
);
