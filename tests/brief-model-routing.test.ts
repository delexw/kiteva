vi.mock("../src/server/jev/strategies/visual-authoring", () => ({
  selectAuthoringResources: async () => ({
    source: "jev",
    model: "jev-test",
    selectedIds: ["local_code"],
    decisions: [],
  }),
}));
import { type Proposal } from "../src/shared/agents/schemas/proposals";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { combinationModels, textModels } from "../src/server/agents/models";
import { dataRoot, models } from "../src/server/runtime/config";
import { RequestSchema, type Run } from "../src/shared/contracts";

vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/catalog/style-summaries", async (original) => ({
  ...(await original<typeof import("../src/server/catalog/style-summaries")>()),
  prepareStyleSummaries: vi.fn(),
}));
vi.mock("../src/server/jev/strategies/style-combination", () => ({ rankOptions: vi.fn() }));
vi.mock("../src/server/jev/client", () => ({ jevClient: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { loadCatalog } from "../src/server/catalog/catalog";
import { prepareStyleSummaries } from "../src/server/catalog/style-summaries";
import { rankOptions } from "../src/server/jev/strategies/style-combination";
import { Store } from "../src/server/jobs/store";
import { Workflow } from "../src/server/jobs/workflow";

it.each([
  ["claude", "video", undefined, 90],
  ["codex", "video", undefined, 90],
  ["claude", "page", undefined, 90],
  ["codex", "page", undefined, 90],
  ["claude", "video", "style-108", 90],
  ["claude", "video", undefined, 300],
] as const)(
  "uses %s text models for %s briefs and catalog-wide proposals before JEV selection",
  async (provider, outputType, pinnedStyleId, duration) => {
    vi.mocked(agentTurn).mockClear();
    const store = new Store(":memory:");
    const catalog = await loadCatalog();
    const workflow = new Workflow(store, catalog);
    const run: Run = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      phase: "preparing",
      request: RequestSchema.parse({
        instructions: "Explain an idea",
        provider,
        outputType,
        candidateCount: 5,
        urls: ["http://127.0.0.1:4317/"],
        pinnedStyleId,
      }),
      candidates: [],
      jobs: [],
    };
    const brief = {
      subject: "Ideas",
      audience: "General",
      objective: "Explain",
      facts: [],
      exactCopy: [],
      previewBeat: "A shape unfolds",
      assetDescriptions: [],
      constraints: [],
      ...(outputType === "page"
        ? { sections: ["Introduction"], interactionGoals: ["Explore an idea"] }
        : { suggestedDuration: duration, durationReason: "A complete short story" }),
    };
    const summaries = catalog.styles.map((style) => ({
      styleId: style.id,
      name: style.name_en,
      visualIdentity: "Visual identity",
      suitableUses: "Explain",
      limitations: "Respect supplied assets",
      palette: "Original palette",
      motionAndInteraction: "Reveal",
      audio: "Flexible",
      assetRequirements: "Code geometry",
      combinations: "Optional",
      productionApproach: "Style-led",
    }));
    vi.mocked(prepareStyleSummaries).mockResolvedValueOnce(summaries);
    const combination: Proposal = {
      primaryStyleId: "style-108",
      supportingStyleIds:
        duration === 300
          ? ["style-107", "style-109", "style-001", "style-002"]
          : ["style-107", "style-109"],
      sceneRoles: ["Primary identity", "Texture", "Motion"],
      rationale: "Coherent blend",
      displayTitle: "First Flight",
      displayDescription: "A clear journey follows an idea as it grows into a finished creation.",
      feasible: true,
      missingAssets: [],
    };
    const minimalDirection: Proposal = {
      ...combination,
      supportingStyleIds: duration === 300 ? ["style-107"] : [],
    };
    const otherCombination: Proposal = {
      ...combination,
      supportingStyleIds:
        duration === 300 ? ["style-107", "style-109", "style-001"] : ["style-107"],
    };
    vi.mocked(agentTurn)
      .mockImplementationOnce(async (options) => {
        const input = JSON.parse(
          await readFile(path.join(options.workspace, "input.json"), "utf8"),
        );
        expect(options.prompt).toContain("Return subject as a short idea title of 4–10 words");
        expect(options.prompt).toContain(
          "Keep previewBeat and any proposed scenes Motion Graphic-neutral",
        );
        expect(options.prompt).toContain("Do not suggest Motion Graphics anywhere in the brief.");
        expect(options.prompt).toContain(
          "Preserve visual choices explicitly requested by the user",
        );
        expect(options.prompt).toContain(
          "Defer all other visual treatment to the subsequent Motion Graphic selection stage",
        );
        expect(options.referenceUrls).toEqual(["http://127.0.0.1:4317/"]);
        expect(input.sourceDescriptions.join(" ")).toContain("Use reference_browser tools");
        const reference = {
          name: "website-reference-1.png",
          title: "Product",
          text: "Rendered product content",
          url: "http://127.0.0.1:4317/",
        };
        const references = path.join(path.dirname(options.workspace), "references");
        await mkdir(references, { recursive: true });
        await writeFile(
          path.join(options.workspace, "assets", reference.name),
          "actual-screenshot-bytes",
        );
        await writeFile(path.join(references, reference.name), "actual-screenshot-bytes");
        await writeFile(
          path.join(options.workspace, "reference-screenshots.json"),
          JSON.stringify([reference]),
        );
        options.onEvent({
          type: "invocation",
          message: "Started",
          data: { model: options.model, invocationId: "brief-test" },
        });
        return { value: brief, sessionId: "brief-session" };
      })
      .mockImplementationOnce(async (options) => {
        expect(options.prompt).toContain("PURPOSE-FIRST ASSET SELF-REVIEW");
        options.onEvent({
          type: "invocation",
          message: "Started",
          data: { model: options.model, invocationId: "asset-review-test" },
        });
        return {
          value: {
            status: "passed",
            issues: [],
            plan: {
              coreIdea: "Explain an idea",
              scenes: [
                {
                  id: "idea",
                  purpose: "Explain unfolding",
                  assetPaths: [],
                  use: "Grounded geometry illustrates the idea",
                  coverage: "not_needed",
                  limitation: "",
                },
              ],
              assets: [
                {
                  path: "assets/website-reference-1.png",
                  sceneIds: [],
                  observedContent: "Rendered product content",
                  relevance: "Unrelated to the abstract idea",
                  suitability: "unused",
                  plannedUse: "Exclude this unrelated product view",
                  limitation: "",
                },
              ],
              limitations: [],
            },
          },
        };
      })
      .mockImplementationOnce(async (options) => {
        const input = JSON.parse(
          await readFile(path.join(options.workspace, "style-summaries.json"), "utf8"),
        );
        expect(input).toEqual(summaries);
        expect(input).toHaveLength(catalog.styles.length);
        expect(options.prompt).toContain(
          `Read all ${catalog.styles.length} cached Motion Graphic summaries`,
        );
        expect(options.prompt).toContain("Propose 20 distinct candidate options");
        expect(options.prompt).toContain("not an allowlist");
        expect(options.prompt).toContain("60:40");
        expect(options.prompt).toContain("not fixed scoring weights");
        const recommendations = JSON.parse(
          await readFile(path.join(options.workspace, "style-combinations.json"), "utf8"),
        );
        expect(recommendations).toEqual(
          catalog.styles.map((style) => ({
            styleId: style.id,
            suggested_combinations: style.suggested_combinations,
          })),
        );
        if (duration === 300) {
          expect(combination.supportingStyleIds.length).toBeGreaterThan(
            catalog.styles.find((style) => style.id === combination.primaryStyleId)!
              .suggested_combinations!.suggestions.length,
          );
        }
        options.onEvent({
          type: "invocation",
          message: "Started",
          data: { model: options.model, invocationId: "proposals-test" },
        });
        return {
          value: {
            options: [
              combination,
              { ...combination, supportingStyleIds: [...combination.supportingStyleIds].reverse() },
              minimalDirection,
              otherCombination,
              { ...combination, primaryStyleId: "unknown-style" },
              ...(pinnedStyleId ? [{ ...combination, primaryStyleId: "style-046" }] : []),
            ],
          },
          sessionId: "proposal-session",
        };
      });
    const candidate = {
      ...combination,
      id: "direction",
      dimensions: { relevance: 1, clarity: 1, creativity: 1, feasibility: 1 },
      score: 100,
      confidence: 0.9,
    };
    vi.mocked(rankOptions).mockResolvedValueOnce({ candidates: [candidate], model: "jev-test" });
    const generate = vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
      job.phase = "ready";
    });
    try {
      await workflow.prepare(run);
      expect(run.phase, run.error).toBe("ready");
      expect(run.referenceScreenshots).toEqual([
        {
          name: "website-reference-1.png",
          title: "Product",
          text: "Rendered product content",
          url: "http://127.0.0.1:4317/",
        },
      ]);
      await workflow["setup"](run, run.jobs[0]);
      expect(
        await readFile(path.join(run.jobs[0].workspace, "assets/website-reference-1.png"), "utf8"),
      ).toBe("actual-screenshot-bytes");
      expect(run.brief).toMatchObject({
        ...brief,
        assetDescriptions: expect.arrayContaining([
          expect.stringContaining("http://127.0.0.1:4317/"),
          expect.stringContaining("assets/website-reference-1.png"),
        ]),
      });
      expect(run.brief?.assetPlan?.coreIdea).toBe("Explain an idea");
      expect(agentTurn).toHaveBeenCalledTimes(3);
      expect(agentTurn).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ provider, model: textModels[provider], readOnly: true }),
      );
      expect(agentTurn).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ provider, model: combinationModels[provider], readOnly: true }),
      );
      expect(agentTurn).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ provider, model: textModels[provider], readOnly: true }),
      );
      expect(rankOptions).toHaveBeenLastCalledWith(
        expect.objectContaining({ ...brief, assetDescriptions: run.brief?.assetDescriptions }),
        outputType === "page" || duration === 300
          ? [combination, minimalDirection, otherCombination]
          : [combination, otherCombination],
        catalog.styles,
        run.request,
        expect.any(AbortSignal),
        summaries,
        expect.any(Function),
        [],
      );
      expect(run.jobs[0]).toMatchObject({
        kind: "preview",
        model: models[provider],
        candidateId: "direction",
      });
      expect(generate).toHaveBeenCalledTimes(1);
      if (outputType === "video") {
        const proposalCall = vi.mocked(agentTurn).mock.calls[2][0];
        expect(proposalCall.prompt).toContain(
          duration === 300 ? "2–6 distinct Motion Graphics" : "2–5 distinct Motion Graphics",
        );
        expect(proposalCall.prompt).toContain("full video duration, not the 3-second preview");
      }
      for (const purpose of ["Brief preparation", "Motion Graphic combination proposals"]) {
        expect(store.events(run.id)).toContainEqual(
          expect.objectContaining({
            type: "invocation",
            data: expect.objectContaining({
              model:
                purpose === "Brief preparation"
                  ? textModels[provider]
                  : combinationModels[provider],
              purpose,
            }),
          }),
        );
      }
    } finally {
      await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
    }
  },
);
