import { requestedStyleScopeGuidance } from "../src/shared/style-combinations";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
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
import { buildVideoPrompt } from "../src/server/domains/video/prompts";
import { BriefSchema } from "../src/shared/agents/schemas/video";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
afterEach(() => vi.clearAllMocks());

it.each([
  { provider: "claude", outputType: "video" },
  { provider: "codex", outputType: "video" },
  { provider: "claude", outputType: "page" },
  { provider: "codex", outputType: "page" },
] as const)(
  "$provider $outputType Settings-selected styles bypass style JEV and preserve previews on retry/regeneration",
  async ({ provider, outputType }) => {
    const catalog = await loadCatalog();
    const store = new Store(":memory:");
    const instructions = `Explain a product. Act 1: Vintage Rubber Hose Animation (style-140); continue Rubber Hose animation. Act 3: Manga Production Theatre (style-136), with manga scenery. No Mosaic, no style-034.`;
    const run: Run = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      phase: "queued",
      candidates: [],
      jobs: [],
      request: RequestSchema.parse({
        instructions,
        provider,
        outputType,
        candidateCount: 2,
        selectedStyleIds: [catalog.styles[0].id, catalog.styles[1].id],
      }),
    };
    const originalRequest = structuredClone(run.request);
    vi.mocked(agentTurn).mockImplementation(async (input) => {
      if (input.textOnly) return { value: { subject: "Product story" } };
      return {
        value: {
          previewBeat: "A product appears",
          directions: [
            {
              displayTitle: "Opening Fold",
              displayDescription: "A folded reveal",
              sceneRoles: ["Act 1 only; retain Act 3 for the ending"],
              rationale: "Reveal the product through a folded composition",
            },
            {
              displayTitle: "Quiet Reveal",
              displayDescription: "A readable reveal",
              sceneRoles: ["Act 1 only; retain Act 3 for the ending"],
              rationale: "Reveal the same product through negative space",
            },
          ],
        },
      };
    });
    const workflow = new Workflow(store, catalog);
    const generate = vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
      job.phase = "ready";
    });
    try {
      await workflow.prepare(run);
      expect(run.phase, run.error).toBe("ready");
      expect(run.jobs.map((job) => job.kind)).toEqual(["preview", "preview"]);
      expect(run.winnerId).toBeUndefined();
      expect(run.request).toEqual(originalRequest);
      expect(
        run.candidates.map((candidate) => [
          candidate.primaryStyleId,
          ...candidate.supportingStyleIds,
        ]),
      ).toEqual(Array(2).fill([catalog.styles[0].id, catalog.styles[1].id]));
      const planning = vi.mocked(agentTurn).mock.calls[1][0];
      expect(planning).toMatchObject({ provider, model: run.jobs[0].model, readOnly: true });
      expect(planning.promptContext).toMatchObject({
        request: originalRequest,
        candidate: {
          primaryStyleId: catalog.styles[0].id,
          supportingStyleIds: [catalog.styles[1].id],
        },
      });
      expect(planning.promptContext).not.toHaveProperty("styles");
      expect(JSON.stringify(planning.promptContext)).not.toContain("executable_prompt_template");
      expect(planning.prompt).toContain(requestedStyleScopeGuidance);
      if (outputType === "video") {
        const prompt = buildVideoPrompt({
          job: run.jobs[0] as VideoGenerationJob,
          candidate: run.candidates[0],
          styles: catalog.styles,
          brief: BriefSchema.parse(run.brief),
          request: VideoRequestSchema.parse(run.request),
          width: 1280,
          height: 720,
        });
        expect(prompt.split(requestedStyleScopeGuidance)).toHaveLength(2);
        expect(prompt).not.toContain("COMBINATION PREVIEW:");
        expect(prompt).toContain("creative_pool.read_pool_entry");
        expect(prompt).toContain(originalRequest.instructions);
        expect(prompt).not.toContain(catalog.styles[0].executable_prompt_template.split("{{")[0]);
      }
      const original = structuredClone(run.candidates);
      await workflow.prepare(run);
      expect(run.candidates).toEqual(original);
      expect(agentTurn).toHaveBeenCalledTimes(2);
      expect(generate).toHaveBeenCalledTimes(2);
      await workflow.regenerateDirections(run);
      expect(run.phase, run.error).toBe("ready");
      expect(run.candidates).toHaveLength(4);
      expect(
        run.candidates.slice(2).every((candidate) => candidate.id.startsWith("round-1-")),
      ).toBe(true);
      expect(agentTurn).toHaveBeenCalledTimes(3);
      expect(run.rankingModel).toBeUndefined();
      expect(jevClient).not.toHaveBeenCalled();
      expect(rankOptions).not.toHaveBeenCalled();
      expect(prepareStyleSummaries).not.toHaveBeenCalled();
    } finally {
      store.close();
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);
