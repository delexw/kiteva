vi.mock("../src/server/jev/strategies/visual-authoring", () => ({
  selectAuthoringResources: async () => ({
    source: "jev",
    model: "jev-test",
    selectedIds: ["local_code"],
    decisions: [],
  }),
}));
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { expect, it, vi, afterEach } from "vitest";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/jobs/subworkflows/full-brief/asset-review", async (original) => ({
  ...(await original<typeof import("../src/server/jobs/subworkflows/full-brief/asset-review")>()),
  reviewBriefAssets: vi.fn(),
}));
import { agentTurn } from "../src/server/agents/providers";
import { reviewBriefAssets } from "../src/server/jobs/subworkflows/full-brief/asset-review";
import { Workflow } from "../src/server/jobs/workflow";
import { Store } from "../src/server/jobs/store";
import { loadCatalog } from "../src/server/catalog/catalog";
import { dataRoot } from "../src/server/runtime/config";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { BriefCorrectionSchema } from "../src/shared/agents/schemas/brief-correction";
import { automaticPreviewResult } from "./fixtures/automatic-preview-plan";

afterEach(() => vi.resetAllMocks());

it.each(["claude", "codex"] as const)(
  "%s brief repair returns typed edits in the same session and passes the merged brief to generation",
  async (provider) => {
    const store = new Store(":memory:");
    const run: Run = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      phase: "queued",
      request: RequestSchema.parse({
        instructions: "Explain importing",
        subtitles: { mode: "provided", text: "Exact copy" },
        provider,
        preference: "random",
        candidateCount: 1,
      }),
      candidates: [],
      jobs: [],
    };
    const brief = {
      subject: "A source becomes an insight",
      audience: "Creators",
      objective: "Explain",
      facts: ["Unsupported claim", "Preserve this fact"],
      exactCopy: ["Exact copy"],
      previewBeat: "An insight appears",
      assetDescriptions: [],
      constraints: ["Keep narration"],
      suggestedDuration: 30,
      durationReason: "A short story",
    };
    const correction = {
      edits: [
        { op: "replace", path: "/facts/0", expected: "Unsupported claim", value: "Verified claim" },
      ],
    };
    vi.mocked(agentTurn)
      .mockResolvedValueOnce({ value: brief, sessionId: "preparation-session" })
      .mockResolvedValueOnce({
        value: { edits: [{ ...correction.edits[0], path: "/facts/1" }] },
        sessionId: "repair-session",
      })
      .mockResolvedValueOnce({ value: correction, sessionId: "repair-session" })
      .mockImplementationOnce(async (call) => automaticPreviewResult(call.promptContext));
    vi.mocked(reviewBriefAssets).mockImplementation(async (input) =>
      input.revise(
        input.brief,
        input.sessionId,
        JSON.stringify({ issue: "Correct the unsupported claim" }),
      ),
    );
    const workflow = new Workflow(store, await loadCatalog());
    vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
      job.phase = "ready";
    });
    try {
      await workflow.prepare(run);
      expect(run.phase, run.error).toBe("ready");
      expect(agentTurn).toHaveBeenCalledTimes(4);
      const repair = vi.mocked(agentTurn).mock.calls[1][0];
      expect(repair).toMatchObject({
        provider,
        sessionId: "preparation-session",
        schema: BriefCorrectionSchema,
        readOnly: true,
      });
      expect(repair.prompt).toContain("never the full brief");
      const retry = vi.mocked(agentTurn).mock.calls[2][0];
      expect(retry).toMatchObject({
        sessionId: "repair-session",
        readOnly: true,
        promptContext: {
          currentDraft: brief,
          previousValidationIssue: expect.stringContaining("/facts/1"),
        },
      });
      expect(JSON.stringify(retry.promptContext)).toContain("Preserve this fact");
      expect(JSON.stringify(retry.promptContext)).toContain("Unsupported claim");
      expect(retry).not.toHaveProperty("reasoningEffort");

      expect(repair).not.toHaveProperty("reasoningEffort");
      expect(run.brief).toEqual({ ...brief, facts: ["Verified claim", "Preserve this fact"] });
      expect(brief.facts[0]).toBe("Unsupported claim");
      expect(workflow.generate).toHaveBeenCalledOnce();
    } finally {
      store.close();
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);
