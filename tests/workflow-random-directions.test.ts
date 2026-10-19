import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { expect, it, vi, afterEach } from "vitest";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/jobs/subworkflows/brief-asset-review", async (original) => ({
  ...(await original<typeof import("../src/server/jobs/subworkflows/brief-asset-review")>()),
  reviewBriefAssets: vi.fn(async (input) => ({ value: input.brief, sessionId: input.sessionId })),
}));
vi.mock("../src/server/catalog/ranking", () => ({ rankOptions: vi.fn(), jevClient: vi.fn() }));
vi.mock("../src/server/catalog/style-summaries", () => ({ prepareStyleSummaries: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { rankOptions, jevClient } from "../src/server/catalog/ranking";
import { prepareStyleSummaries } from "../src/server/catalog/style-summaries";
import { Workflow } from "../src/server/jobs/workflow";
import { Store } from "../src/server/jobs/store";
import { loadCatalog } from "../src/server/catalog/catalog";
import { dataRoot } from "../src/server/runtime/config";
import { RequestSchema, type Run } from "../src/shared/contracts";

afterEach(() => vi.clearAllMocks());

it.each([
  { provider: "claude", outputType: "video" },
  { provider: "codex", outputType: "video" },
  { provider: "claude", outputType: "page" },
  { provider: "codex", outputType: "page" },
] as const)(
  "$provider $outputType random workflow bypasses proposals and JEV, reuses a retry draw and redraws on regeneration",
  async ({ provider, outputType }) => {
    const store = new Store(":memory:");
    const run: Run = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      phase: "queued",
      request: RequestSchema.parse({
        instructions: "Explain importing",
        preference: "random",
        provider,
        outputType,
        candidateCount: 5,
      }),
      candidates: [],
      jobs: [],
    };
    vi.mocked(agentTurn).mockResolvedValue({
      value: {
        subject: "Import an insight",
        audience: "Creators",
        objective: "Explain",
        facts: [],
        exactCopy: [],
        previewBeat: "An insight appears",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 30,
        durationReason: "A short story",
        sections: ["Introduction"],
        interactionGoals: ["Open details"],
      },
      sessionId: "preparation-session",
    });
    const workflow = new Workflow(store, await loadCatalog());
    vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
      job.phase = "ready";
    });
    try {
      await workflow.prepare(run);
      expect(run.phase, run.error).toBe("ready");
      expect(run.candidates).toHaveLength(5);
      expect(run.rankingModel).toBeUndefined();
      const original = structuredClone(run.candidates);
      await workflow.prepare(run);
      expect(run.candidates).toEqual(original);
      expect(agentTurn).toHaveBeenCalledOnce(); // Brief only; no model chooses the random pool.
      await workflow.regenerateDirections(run);
      expect(run.phase, run.error).toBe("ready");
      expect(run.candidates).toHaveLength(10);
      expect(run.candidates.slice(5).every((item) => item.id.startsWith("round-1-"))).toBe(true);
      expect(run.preparation?.checkpoints.styles).toBeUndefined();
      expect(run.preparation?.checkpoints.proposals).toBeUndefined();
      expect(rankOptions).not.toHaveBeenCalled();
      expect(jevClient).not.toHaveBeenCalled();
      expect(prepareStyleSummaries).not.toHaveBeenCalled();
      expect(agentTurn).toHaveBeenCalledOnce();
    } finally {
      store.close();
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);
