import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { validStoryboard } from "./fixtures/storyboard";
import { BriefSchema, type StyleCandidate } from "../src/shared/contracts";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import { InputRequired } from "../src/shared/input-checkpoint";
import { loadCatalog } from "../src/server/catalog/catalog";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/rendering/render", () => ({ renderJob: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { renderJob } from "../src/server/rendering/render";
import { generateVideo } from "../src/server/domains/video/workflow";

it.each(["claude", "codex"] as const)(
  "%s stops after returning a question, before validation, rendering or a repair turn",
  async (provider) => {
    vi.mocked(agentTurn).mockReset();
    vi.mocked(renderJob).mockClear();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "video-question-"));
    const job: VideoGenerationJob = {
      id: "job",
      runId: "project",
      candidateId: "candidate",
      kind: "preview",
      phase: "generating",
      workspace,
      model: "example-model",
      duration: 3,
    };
    const candidate: StyleCandidate = {
      id: "candidate",
      primaryStyleId: "style-001",
      supportingStyleIds: [],
      sceneRoles: ["Identity"],
      rationale: "Explain the idea",
      feasible: true,
      missingAssets: [],
      score: 1,
      dimensions: {},
      confidence: 1,
    };
    vi.mocked(agentTurn).mockResolvedValueOnce({
      sessionId: "saved-session",
      value: {
        // Invalid dimensions must not trigger repairs before the user decides.
        width: 1,
        height: 1,
        duration: 3,
        assetNeeds: [
          {
            mode: "optional",
            kind: "urls",
            cause: "url-access",
            reason: "The supplied site is inaccessible.",
            question: "Use another reference?",
            fallback: "Use the description.",
          },
        ],
        storyboard: validStoryboard(3),
      },
    });
    try {
      await expect(
        generateVideo({
          job,
          request: VideoRequestSchema.parse({ instructions: "Explain an idea", provider }),
          brief: BriefSchema.parse({
            subject: "An idea",
            audience: "Learners",
            objective: "Explain",
            facts: [],
            exactCopy: [],
            previewBeat: "A shape connects",
            assetDescriptions: [],
            constraints: [],
            suggestedDuration: 30,
            durationReason: "Explain the steps",
          }),
          candidate,
          styles: (await loadCatalog()).styles,
          signal: new AbortController().signal,
          update: () => {
            if (job.production?.assetNeeds?.length) throw new InputRequired();
          },
          onEvent: () => {},
          emit: () => {},
          render: async (task) => task(),
        }),
      ).rejects.toBeInstanceOf(InputRequired);
      expect(agentTurn).toHaveBeenCalledOnce();
      expect(renderJob).not.toHaveBeenCalled();
      expect(job.sessionId).toBe("saved-session");
      expect(job.phase).toBe("generating");
      expect(job.error).toBeUndefined();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
