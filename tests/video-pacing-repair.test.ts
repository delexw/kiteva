import { validStoryboard } from "./fixtures/storyboard";
import { type Production, type Brief } from "../src/shared/agents/schemas/video";
import { expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import type { StyleCandidate } from "../src/shared/contracts";
import { loadCatalog } from "../src/server/catalog/catalog";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/rendering/render", () => ({ renderJob: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { renderJob } from "../src/server/rendering/render";
import { generateVideo } from "../src/server/domains/video/workflow";

it("repairs a stretched pacing plan before marking a full video ready", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "video-pacing-"));
  try {
    await mkdir(path.join(workspace, "renders"));
    await writeFile(
      path.join(workspace, "renders/validation.json"),
      JSON.stringify({ decoded: true }),
    );
    await writeFile(path.join(workspace, "STORYBOARD.json"), JSON.stringify(validStoryboard(120)));
    const production: Production = {
      pipeline: "HyperFrames",
      fallbackReason: null,
      styleRenderer: ["SVG"],
      motionEngine: ["GSAP"],
      sourceFile: "index.html",
      duration: 120,
      width: 1920,
      height: 1080,
      audioDescription: "No audio",
      limitations: [],
    };
    const job: VideoGenerationJob = {
      id: "full",
      runId: "project",
      candidateId: "direction",
      kind: "full",
      phase: "queued",
      workspace,
      model: "example-model",
      duration: 120,
      sessionId: "original-main-session",
      production,
    };
    const candidate: StyleCandidate = {
      id: "direction",
      primaryStyleId: "style-046",
      supportingStyleIds: [],
      sceneRoles: [],
      rationale: "Unfold an idea",
      feasible: true,
      missingAssets: [],
      score: 90,
      confidence: 0.9,
      dimensions: {},
    };
    const brief: Brief = {
      subject: "An idea",
      audience: "Creators",
      objective: "Explain development",
      facts: [],
      exactCopy: [],
      previewBeat: "A folded shape unfolds",
      assetDescriptions: [],
      constraints: [],
      suggestedDuration: 120,
      durationReason: "Detailed explanation",
    };
    const review = {
      styleMatch: "not_verified",
      narration: "not_added",
      sungVocals: "not_added",
      music: "not_added",
    };
    vi.mocked(agentTurn)
      .mockResolvedValueOnce({
        value: {
          ...review,
          pacingPlan: "needs_review",
          corrections: [
            {
              focus: "pacing",
              issue:
                "The 0–120s storyboard contains six stretched scenes without meaningful intermediate developments.",
              expectedFix:
                "Add richer content and more balanced pacing by subdividing each stretched scene into distinct grounded timed beats.",
              acceptanceCriteria:
                "The full 120s storyboard documents substantive developments and justified reading holds throughout.",
              evidence: {
                source: "storyboard",
                observation: "0–120s: six stretched scenes.",
                timestamps: [0, 120],
                selectors: [],
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        value: { ...production, storyboard: validStoryboard(production.duration) },
      })
      .mockResolvedValueOnce({ value: { ...review, pacingPlan: "balanced", corrections: [] } });
    vi.mocked(renderJob).mockResolvedValue({
      video: "renders/full.mp4",
      poster: "renders/poster.jpg",
    });
    const phases: string[] = [];
    await generateVideo({
      job,
      candidate,
      brief,
      request: VideoRequestSchema.parse({ instructions: "Explain development", duration: 120 }),
      styles: (await loadCatalog()).styles,
      signal: new AbortController().signal,
      update: () => phases.push(job.phase),
      onEvent: vi.fn(),
      emit: vi.fn(),
      render: async (task) => task(),
    });
    expect(renderJob).toHaveBeenCalledTimes(2);
    expect(vi.mocked(agentTurn).mock.calls[1][0].sessionId).toBe("original-main-session");
    expect(agentTurn).toHaveBeenCalledTimes(3);
    expect(vi.mocked(agentTurn).mock.calls.map(([call]) => call.model)).toEqual([
      "gpt-6-luna",
      "example-model",
      "gpt-6-luna",
    ]);
    expect(JSON.stringify(vi.mocked(agentTurn).mock.calls[1][0].promptContext)).toContain(
      "0–120s storyboard contains six stretched scenes",
    );
    expect(vi.mocked(agentTurn).mock.calls[1][0].prompt).toContain("DURATION AND PACING RULES:");
    expect(JSON.stringify(vi.mocked(agentTurn).mock.calls[1][0].promptContext)).toContain(
      "richer content and more balanced pacing",
    );
    expect(phases.filter((phase, index) => index === 0 || phase !== phases[index - 1])).toEqual([
      "validating",
      "rendering",
      "generating",
      "validating",
      "rendering",
      "ready",
    ]);
    expect(job.resultReview?.pacingPlan).toBe("balanced");
    expect(job.duration).toBe(120);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
