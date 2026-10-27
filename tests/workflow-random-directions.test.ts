vi.mock("../src/server/jev/strategies/visual-authoring", () => ({
  selectAuthoringResources: async () => ({
    source: "jev",
    model: "jev-test",
    selectedIds: ["local_code"],
    decisions: [],
  }),
}));
import { randomUUID } from "node:crypto";
import { rm, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it, vi, afterEach } from "vitest";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/jobs/subworkflows/full-brief/asset-review", async (original) => ({
  ...(await original<typeof import("../src/server/jobs/subworkflows/full-brief/asset-review")>()),
  reviewBriefAssets: vi.fn(async (input) => ({ value: input.brief, sessionId: input.sessionId })),
}));
vi.mock("../src/server/jev/strategies/style-combination", () => ({ rankOptions: vi.fn() }));
vi.mock("../src/server/jev/client", () => ({ jevClient: vi.fn() }));
vi.mock("../src/server/catalog/style-summaries", () => ({ prepareStyleSummaries: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { rankOptions } from "../src/server/jev/strategies/style-combination";
import { jevClient } from "../src/server/jev/client";
import { prepareStyleSummaries } from "../src/server/catalog/style-summaries";
import { Workflow } from "../src/server/jobs/workflow";
import { Store } from "../src/server/jobs/store";
import { loadCatalog } from "../src/server/catalog/catalog";
import { dataRoot } from "../src/server/runtime/config";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { AutomaticPreviewPlanSchema } from "../src/server/jobs/subworkflows/automatic-preview/workflow";

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
    vi.mocked(agentTurn).mockImplementation(async (call) => {
      if (call.schema === AutomaticPreviewPlanSchema) {
        const directions = (call.promptContext as { directions: Run["candidates"] }).directions;
        call.onEvent({
          type: "tool",
          message: "Read",
          data: { itemId: "shared-planning-read", state: "item.completed" },
        });
        return {
          value: {
            previewBeat: "A planned insight appears",
            directions: directions.map((direction) => ({
              id: direction.id,
              displayTitle: "Clear Insight",
              displayDescription: "A readable transformation",
              sceneRoles: ["Reveal the source, transform it, and hold the readable result"],
              rationale: "A planned explanation",
            })),
          },
          sessionId: "shared-planning-session",
        };
      }
      return {
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
      };
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
      const planningCalls = () =>
        vi
          .mocked(agentTurn)
          .mock.calls.filter(([call]) => call.schema === AutomaticPreviewPlanSchema);
      expect(planningCalls()).toHaveLength(outputType === "video" ? 1 : 0);
      if (outputType === "video") {
        const plan = JSON.parse(
          await readFile(path.join(dataRoot, "runs", run.id, "PREVIEW_PLAN.json"), "utf8"),
        );
        expect(plan.brief.previewBeat).toBe("A planned insight appears");
        expect(plan.directions).toHaveLength(5);
        const events = store.events(run.id);
        const scope = events.find(
          (event) => event.type === "activity_scope" && event.message === "Preview planning",
        )!;
        expect(scope).toBeDefined();
        expect(
          events.find(
            (event) =>
              event.type === "tool" &&
              (event.data as { purpose?: string })?.purpose === "Shared preview planning",
          )?.data,
        ).toMatchObject({
          activityScopeId: (scope.data as { activityScope: { id: string } }).activityScope.id,
        });
      }
      const original = structuredClone(run.candidates);
      await workflow.prepare(run);
      expect(run.candidates).toEqual(original);
      expect(planningCalls()).toHaveLength(outputType === "video" ? 1 : 0); // Retry reuses the completed shared plan.
      await workflow.regenerateDirections(run);
      expect(run.phase, run.error).toBe("ready");
      expect(run.candidates).toHaveLength(10);
      expect(run.candidates.slice(5).every((item) => item.id.startsWith("round-1-"))).toBe(true);
      expect(run.preparation?.checkpoints.styles).toBeUndefined();
      expect(run.preparation?.checkpoints.proposals).toBeUndefined();
      expect(rankOptions).not.toHaveBeenCalled();
      expect(jevClient).not.toHaveBeenCalled();
      expect(prepareStyleSummaries).not.toHaveBeenCalled();
      expect(planningCalls()).toHaveLength(outputType === "video" ? 2 : 0); // A new draw receives one new shared plan.
    } finally {
      store.close();
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);
