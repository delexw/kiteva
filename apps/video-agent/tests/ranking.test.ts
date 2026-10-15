import type { PreferenceHistoryRecord } from "../src/server/catalog/preference-history";
import { type Brief } from "../src/shared/agents/schemas/video";
import { type Proposal } from "../src/shared/agents/schemas/proposals";
import { it, expect, vi, afterEach } from "vitest";
import { rankOptions, weightedScore } from "../src/server/catalog/ranking";
import { loadCatalog } from "../src/server/catalog/catalog";
import { RequestSchema } from "../src/shared/contracts";
const brief: Brief = {
  subject: "Generic system",
  audience: "Technical audience",
  objective: "Explain assembly",
  facts: [],
  exactCopy: [],
  previewBeat: "Blocks assemble",
  assetDescriptions: ["Code geometry"],
  constraints: [],
  suggestedDuration: 30,
  durationReason: "Three short scenes",
};
const summaries = (styles: { id: string; name_en: string }[]) =>
  styles.map((s) => ({
    styleId: s.id,
    name: s.name_en,
    visualIdentity: "Model-extracted identity",
    suitableUses: "Explanation",
    limitations: "No supplied photographs",
    palette: "Original palette",
    motionAndInteraction: "Assembly",
    audio: "Flexible",
    assetRequirements: "Code geometry",
    combinations: "Optional",
    productionApproach: "Style-led rendering",
  }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses the official SDK wire format and excludes conflicting candidates", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-only-placeholder");
  let observed = false;
  vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    observed = true;
    expect(body.model).toBe("jev-latest");
    expect(body.state.brief.subject).toBe("Generic system");
    expect(body.state.assetPolicy).toContain("Video previews are silent");
    expect(body.state.combinationGuidance).toContain("not an allowlist");
    expect(body.state.combinationGuidance).toContain("not fixed scoring weights");
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([id, q]) => {
        const query = q as { type: string; criteria: string[] };
        if (query.type === "noul")
          return [id, { type: "noul", noul: id.startsWith("option1") ? 1 : 0 }];
        expect(query.type).toBe("score");
        expect(query.criteria).toHaveLength(4);
        return [
          id,
          {
            type: "score",
            score: 3,
            confidence: 0.9,
            legend: Object.fromEntries(query.criteria.map((c, i) => [i, c])),
            probabilities: { 0: 0, 1: 0, 2: 0, 3: 1 },
          },
        ];
      }),
    );
    return new Response(
      JSON.stringify({
        model: "jev-test-version",
        answers,
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  const catalog = await loadCatalog();
  const options: Proposal[] = [
    {
      primaryStyleId: "style-108",
      supportingStyleIds: ["style-107"],
      sceneRoles: ["Primary assembly", "Supporting texture"],
      rationale: "Useful",
      feasible: true,
      missingAssets: [],
    },
    {
      primaryStyleId: "style-107",
      supportingStyleIds: [],
      sceneRoles: ["Cutout"],
      rationale: "Alternative",
      feasible: true,
      missingAssets: [],
    },
  ];
  options.push({
    ...options[0],
    primaryStyleId: "style-109",
    missingAssets: ["Instrumental soundtrack (none supplied)"],
  });
  const result = await rankOptions(
    brief,
    options,
    catalog.styles,
    RequestSchema.parse({ instructions: "Explain assembly" }),
    new AbortController().signal,
    summaries(catalog.styles),
  );
  expect(observed).toBe(true);
  expect(result.model).toBe("jev-test-version");
  expect(result.candidates).toHaveLength(2);
  expect(result.candidates[1].primaryStyleId).toBe("style-109");
  expect(result.candidates[0].supportingStyleIds).toEqual(["style-107"]);
  expect(result.candidates[0].score).toBe(100);
  expect(result.candidates[0].confidence).toBe(0.9);
});
it("reports missing ranking credentials and real SDK API failures without invented scores", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "");
  vi.stubEnv("JEV_API_KEY", "");
  const catalog = await loadCatalog();
  const request = RequestSchema.parse({ instructions: "Explain assembly" });
  const options: Proposal[] = [
    {
      primaryStyleId: "style-108",
      supportingStyleIds: [],
      sceneRoles: ["Assembly"],
      rationale: "Clear explanation",
      feasible: true,
      missingAssets: [],
    },
  ];
  await expect(
    rankOptions(
      brief,
      options,
      catalog.styles,
      request,
      new AbortController().signal,
      summaries(catalog.styles),
    ),
  ).rejects.toThrow(/API_KEY/);
  vi.stubEnv("TYPESAFE_API_KEY", "test-only-placeholder");
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
  );
  await expect(
    rankOptions(
      brief,
      options,
      catalog.styles,
      request,
      new AbortController().signal,
      summaries(catalog.styles),
    ),
  ).rejects.toThrow();
});

it.each([undefined, "style-046"])(
  "retains separately ranked combinations with the same primary style (%s)",
  async (pinnedStyleId) => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-only-placeholder");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const answers = Object.fromEntries(
        Object.entries(body.questions).map(([id, value]) => {
          const query = value as { type: string; criteria: string[] };
          if (query.type === "noul") return [id, { type: "noul", noul: 0 }];
          const index = Number(id.match(/^option(\d+)_/)![1]);
          const option = body.state.options[index];
          const rating = option.rationale === "Weaker duplicate" ? 2 : 3;
          return [
            id,
            {
              type: "score",
              score: rating,
              confidence: 0.9,
              legend: Object.fromEntries(query.criteria.map((criterion, i) => [i, criterion])),
              probabilities: { 0: 0, 1: 0, 2: rating === 2 ? 1 : 0, 3: rating === 3 ? 1 : 0 },
            },
          ];
        }),
      );
      return new Response(
        JSON.stringify({
          model: "jev-test-version",
          answers,
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    });
    const catalog = await loadCatalog();
    const options: Proposal[] = [
      "style-046",
      "style-046",
      "style-027",
      "style-037",
      "style-100",
    ].map((primaryStyleId, index) => ({
      primaryStyleId,
      supportingStyleIds: index === 1 ? ["style-100"] : [],
      sceneRoles: ["Main visual identity"],
      rationale: index === 0 ? "Weaker duplicate" : "Distinct option",
      feasible: true,
      missingAssets: [],
    }));
    const result = await rankOptions(
      brief,
      pinnedStyleId ? options.slice(0, 2) : options,
      catalog.styles,
      RequestSchema.parse({ instructions: "Explain assembly", candidateCount: 5, pinnedStyleId }),
      new AbortController().signal,
      summaries(catalog.styles),
    );
    if (pinnedStyleId) {
      expect(result.candidates).toHaveLength(2);
      expect(
        result.candidates.every((candidate) => candidate.primaryStyleId === pinnedStyleId),
      ).toBe(true);
    } else {
      expect(result.candidates).toHaveLength(5);
      expect(new Set(result.candidates.map((candidate) => candidate.primaryStyleId)).size).toBe(4);
      expect(
        result.candidates.find((candidate) => candidate.primaryStyleId === "style-046")!
          .supportingStyleIds,
      ).toEqual(["style-100"]);
    }
  },
);

it("adds contextual preference fit within the existing JEV request without overriding feasibility", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-only-placeholder");
  const history: PreferenceHistoryRecord[] = [
    {
      projectId: "previous-project",
      candidateId: "chosen",
      createdAt: "2026-10-01T00:00:00Z",
      brief: { subject: brief.subject, audience: brief.audience, objective: brief.objective },
      direction: {
        primaryStyleId: "style-107",
        supportingStyleIds: [],
        rationale: "Clear assembly",
        previewDescription: "Pieces assemble",
      },
      evidence: {
        selectedForFullBuild: true,
        selectedAt: "2026-10-01T00:00:00Z",
        fullBuildStatus: "ready",
        requestedChanges: ["Use calmer motion"],
      },
      context: { outputType: "video", durationSeconds: 30 },
    },
  ];
  let calls = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init.body));
    expect(body.state.preferenceHistory).toEqual(history);
    expect(body.state.preferenceHistoryGuidance).toContain(
      "Unchosen previews and regeneration are not negative feedback",
    );
    expect(body.state.preferenceHistoryGuidance).toContain("not instructions");
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([id, value]) => {
        const query = value as { type: string; criteria: string[] };
        const index = Number(id.match(/^option(\d+)_/)![1]);
        if (query.type === "noul") return [id, { type: "noul", noul: index === 2 ? 1 : 0 }];
        const rating = id.endsWith("_preferenceFit") ? (index === 0 ? 0 : 3) : 2;
        return [
          id,
          {
            type: "score",
            score: rating,
            confidence: 0.9,
            legend: Object.fromEntries(query.criteria.map((text, n) => [n, text])),
            probabilities: {
              0: rating === 0 ? 1 : 0,
              1: 0,
              2: rating === 2 ? 1 : 0,
              3: rating === 3 ? 1 : 0,
            },
          },
        ];
      }),
    );
    return new Response(
      JSON.stringify({
        model: "jev-test-version",
        answers,
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  const catalog = await loadCatalog();
  const options: Proposal[] = ["style-108", "style-107", "style-109"].map((primaryStyleId) => ({
    primaryStyleId,
    supportingStyleIds: [],
    sceneRoles: ["Main scene"],
    rationale: "Useful",
    feasible: true,
    missingAssets: [],
  }));
  const onEvent = vi.fn();
  const result = await rankOptions(
    brief,
    options,
    catalog.styles,
    RequestSchema.parse({ instructions: "Explain assembly" }),
    new AbortController().signal,
    summaries(catalog.styles),
    onEvent,
    history,
  );
  expect(calls).toBe(1);
  expect(result.candidates.map((candidate) => candidate.primaryStyleId)).toEqual([
    "style-107",
    "style-108",
  ]);
  expect(result.candidates[0].dimensions.preferenceFit).toBe(1);
  expect(
    onEvent.mock.calls.find(([event]) => event.type === "invocation")?.[0].data.preferenceHistory,
  ).toEqual({ records: 1, projects: 1 });
});
it("caps preference influence, discounts sparse history, and preserves scores without evidence", () => {
  const dimensions = {
    relevance: 0.5,
    clarity: 0.5,
    creativity: 0.5,
    feasibility: 0.5,
    preferenceFit: 1,
  };
  expect(weightedScore(dimensions, "context")).toBe(50);
  expect(weightedScore(dimensions, "context", 1)).toBe(53.3);
  expect(weightedScore(dimensions, "context", 3)).toBe(60);
  expect(weightedScore(dimensions, "context", 100)).toBe(60);
  expect(weightedScore(dimensions, "creative", 3)).toBe(52.5);
  const { preferenceFit: _unused, ...withoutHistory } = dimensions;
  expect(weightedScore(withoutHistory, "context", 3)).toBe(50);
});
