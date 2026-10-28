import type { PreferenceHistoryRecord } from "../src/server/catalog/preference-history";
import { type Brief } from "../src/shared/agents/schemas/video";
import { type Proposal } from "../src/shared/agents/schemas/proposals";
import { it, expect, vi, afterEach } from "vitest";
import { rankOptions, weightedScore } from "../src/server/jev/strategies/style-combination";
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
function choiceResponse(
  body: {
    questions: Record<string, { type: string; criteria: Record<string, string> }>;
    state: { preliminaryEvaluations: { id: string; score: number }[] };
  },
  preferred?: string,
) {
  const criteria = body.questions.direction.criteria;
  const winner =
    preferred || [...body.state.preliminaryEvaluations].sort((a, b) => b.score - a.score)[0].id;
  return new Response(
    JSON.stringify({
      model: "jev-test-version",
      answers: {
        direction: {
          type: "choice",
          choice: winner,
          confidence: 0.9,
          probabilities: Object.fromEntries(
            Object.keys(criteria).map((id) => [id, id === winner ? 1 : 0]),
          ),
        },
      },
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses the official SDK wire format and excludes conflicting candidates", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-only-placeholder");
  let observed = false;
  vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    if (body.questions.direction?.type === "choice") return choiceResponse(body);
    observed = true;
    expect(body.model).toBe("jev-1.14.0");
    expect(body.state.brief.subject).toBe("Generic system");
    expect(body.state.renderer.id).toBe("hyperframes");
    expect(body.state.renderer.audio.generatesMusic).toBe(false);
    expect(body.state.assetPolicy).toContain("Video previews are silent");
    expect(body.state).not.toHaveProperty("combinationGuidance");
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
  expect(result.candidates[0].evaluationConfidence).toBe(0.9);
  expect(result.candidates[0].selectionDecision).toMatchObject({
    round: 1,
    comparedIds: ["candidate-1", "candidate-3"],
    probabilities: { "candidate-1": 1, "candidate-3": 0 },
  });
});
it("reports missing ranking credentials and real SDK API failures without invented scores", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "");
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
  "retains separately ranked combinations with the same primary Motion Graphic (%s)",
  async (pinnedStyleId) => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-only-placeholder");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.questions.direction?.type === "choice") return choiceResponse(body);
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
    if (body.questions.direction?.type === "choice") return choiceResponse(body);
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
  expect(calls).toBe(3);
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

it("preserves original instructions and evaluates readable combination tradeoffs without production inventories or a proposal veto", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
  const catalog = await loadCatalog();
  const extracted = summaries(catalog.styles).map((summary) => ({
    ...summary,
    decisionGuidance:
      "Identity: marker diagrams. Advantages: causal clarity. Disadvantages: limited material depth. Combination fit: preserve line weight and reading pauses. Visual constraints: no invented hand.",
    palette: "CONTRAST_INVENTORY",
    audio: "AUDIO_DISCLAIMER",
    productionApproach: "WRONG_RENDERER_DEFAULT",
  }));
  const originalIdea =
    "Keep this exact request: " + "A visual explanation. ".repeat(100) + "END_OF_ORIGINAL";
  const request = RequestSchema.parse({
    instructions: originalIdea,
    candidateCount: 2,
    requirements: {
      main: { instructions: "Preserve all main requirements" },
      images: { instructions: "No presenter figures" },
      music: { instructions: "Quiet instrumental" },
      urls: { instructions: "Use the live site" },
    },
  });
  const requestBefore = structuredClone(request);
  const options: Proposal[] = [
    {
      primaryStyleId: "style-026",
      supportingStyleIds: ["style-097"],
      sceneRoles: ["Explain causality", "Show real quantities"],
      rationale:
        "Creative result: clear explanation. Contributions: charts quantify the line story. Advantages: causal clarity. Disadvantages: less spectacle. Compatibility and adaptation: matching strokes and reading holds.",
      feasible: false,
      missingAssets: ["No uploaded chart"],
    },
    {
      primaryStyleId: "style-032",
      supportingStyleIds: [],
      sceneRoles: ["Illustrate"],
      rationale: "Conflicting alternative",
      feasible: true,
      missingAssets: [],
    },
  ];
  let calls = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    calls++;
    const payload = JSON.parse(String(init.body));
    if (payload.questions.direction?.type === "choice") return choiceResponse(payload);
    expect(payload.state.originalIdea).toBe(originalIdea);
    expect(payload.state.sectionInstructions).toEqual({
      main: "Preserve all main requirements",
      images: "No presenter figures",
      music: "Quiet instrumental",
      urls: "Use the live site",
    });
    expect(payload.state.options[0].rationale).toBe(options[0].rationale);
    expect(payload.state.options[0]).not.toHaveProperty("styles");
    expect(payload.state.options[0]).not.toHaveProperty("compatibility");
    expect(payload.state.options[0].sceneRoles).toEqual(options[0].sceneRoles);
    expect(JSON.stringify(payload.state)).not.toContain(extracted[0].decisionGuidance);
    expect(payload.state.options[0]).not.toHaveProperty("feasible");
    expect(payload.state.options[0]).not.toHaveProperty("displayTitle");
    expect(JSON.stringify(payload.state)).not.toMatch(
      /CONTRAST_INVENTORY|AUDIO_DISCLAIMER|WRONG_RENDERER_DEFAULT/,
    );
    expect(payload.questions.option0_constraints.instructions).toContain("originalIdea");
    const answers = Object.fromEntries(
      Object.entries(payload.questions).map(([key, q]) => {
        const question = q as { type: string; criteria: string[] };
        return [
          key,
          question.type === "noul"
            ? { type: "noul", noul: key.startsWith("option1") ? 1 : 0 }
            : {
                type: "score",
                score: 3,
                confidence: 0.9,
                legend: Object.fromEntries(question.criteria.map((text, index) => [index, text])),
                probabilities: { 0: 0, 1: 0, 2: 0, 3: 1 },
              },
        ];
      }),
    );
    return new Response(JSON.stringify({ model: "jev-test", answers, usage: {} }), {
      headers: { "content-type": "application/json" },
    });
  });
  const result = await rankOptions(
    brief,
    options,
    catalog.styles,
    request,
    new AbortController().signal,
    extracted,
  );
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({
    primaryStyleId: "style-026",
    feasible: true,
    score: 100,
  });
  expect(request).toEqual(requestBefore);
  expect(options[0].feasible).toBe(false);
  expect(calls).toBe(2);
});

it("compares survivors across all batches repeatedly and obeys JEV choice order over batch scores", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
  const catalog = await loadCatalog();
  const options: Proposal[] = catalog.styles.slice(0, 6).map((style) => ({
    primaryStyleId: style.id,
    supportingStyleIds: [],
    sceneRoles: ["Explain"],
    rationale:
      "A distinct option. Asset evidence: reference coverage is limited; suitable for diagrams; private source code remains unverified.",
    feasible: true,
    missingAssets: [],
  }));
  let calls = 0;
  const request = RequestSchema.parse({ instructions: "A generic explanation", candidateCount: 2 });
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    calls++;
    const payload = JSON.parse(String(init.body));
    if (payload.questions.direction?.type === "choice") {
      const round = payload.state.selectionRound;
      expect(payload.state).not.toHaveProperty("styleDefinitions");
      expect(payload.state.brief).not.toHaveProperty("assetPlan");
      expect(payload.state.brief).not.toHaveProperty("assetEvidence");
      for (const description of Object.values(payload.questions.direction.criteria))
        expect(description).toContain(
          "Asset evidence: reference coverage is limited; suitable for diagrams; private source code remains unverified.",
        );
      expect(JSON.stringify(payload)).not.toContain("Model-extracted identity");
      expect(Object.keys(payload.questions.direction.criteria)).toHaveLength(round === 1 ? 6 : 5);
      expect(payload.state.selectedDirections).toHaveLength(round - 1);
      expect(payload.questions.direction.instructions).toContain("ALL evaluation batches");
      if (round === 2) {
        expect(payload.state.selectedDirections[0].id).toBe("candidate-6");
        expect(payload.questions.direction.criteria).not.toHaveProperty("candidate-6");
      }
      return choiceResponse(payload, round === 1 ? "candidate-6" : "candidate-2");
    }
    expect(payload.state.originalIdea).toBe(request.instructions);
    expect(payload.state.evaluationGuidance).toContain(
      "same absolute scoring standards across batches",
    );
    const answers = Object.fromEntries(
      Object.entries(payload.questions).map(([key, value]) => {
        const question = value as { type: string; criteria: string[] };
        const index = Number(key.match(/^option(\d+)_/)![1]);
        const rating =
          payload.state.options[index].primaryStyleId === options[0].primaryStyleId ? 3 : 2;
        return [
          key,
          question.type === "noul"
            ? { type: "noul", noul: 0 }
            : {
                type: "score",
                score: rating,
                confidence: 0.9,
                legend: Object.fromEntries(question.criteria.map((text, index) => [index, text])),
                probabilities: { 0: 0, 1: 0, 2: rating === 2 ? 1 : 0, 3: rating === 3 ? 1 : 0 },
              },
        ];
      }),
    );
    return new Response(JSON.stringify({ model: "jev-test", answers, usage: {} }), {
      headers: { "content-type": "application/json" },
    });
  });
  const result = await rankOptions(
    brief,
    options,
    catalog.styles,
    request,
    new AbortController().signal,
    summaries(catalog.styles),
  );
  expect(calls).toBe(4);
  expect(result.candidates).toHaveLength(2);
  expect(result.candidates[0]).toMatchObject({
    primaryStyleId: options[5].primaryStyleId,
    score: 66.7,
  });
  expect(result.candidates[1].primaryStyleId).toBe(options[1].primaryStyleId);
});

it.each(["all-conflict", "invalid-choice", "cancel"] as const)(
  "does not invent or fall back to a score winner when cross-batch selection is %s",
  async (scenario) => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
    const catalog = await loadCatalog();
    const controller = new AbortController();
    let calls = 0;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls++;
      const payload = JSON.parse(String(init.body));
      if (payload.questions.direction?.type === "choice") {
        if (scenario === "cancel") {
          controller.abort(Error("Cancelled selection"));
          throw controller.signal.reason;
        }
        return choiceResponse(payload, "not-a-remaining-direction");
      }
      const answers = Object.fromEntries(
        Object.entries(payload.questions).map(([key, value]) => {
          const question = value as { type: string; criteria: string[] };
          return [
            key,
            question.type === "noul"
              ? { type: "noul", noul: scenario === "all-conflict" ? 1 : 0 }
              : {
                  type: "score",
                  score: 3,
                  confidence: 0.9,
                  legend: Object.fromEntries(question.criteria.map((text, index) => [index, text])),
                  probabilities: { 0: 0, 1: 0, 2: 0, 3: 1 },
                },
          ];
        }),
      );
      return new Response(JSON.stringify({ model: "jev-test", answers, usage: {} }), {
        headers: { "content-type": "application/json" },
      });
    });
    const task = rankOptions(
      brief,
      [
        {
          primaryStyleId: catalog.styles[0].id,
          supportingStyleIds: [],
          sceneRoles: ["Explain"],
          rationale: "An option",
          feasible: true,
          missingAssets: [],
        },
      ],
      catalog.styles,
      RequestSchema.parse({ instructions: "A generic explanation", candidateCount: 2 }),
      controller.signal,
      summaries(catalog.styles),
    );
    if (scenario === "all-conflict") {
      expect((await task).candidates).toEqual([]);
      expect(calls).toBe(1);
    } else {
      await expect(task).rejects.toThrow();
      expect(calls).toBe(2);
    }
  },
);

it.each(["unknown-id", "missing-extraction"] as const)(
  "validates %s locally before sending combination briefs",
  async (scenario) => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
    const catalog = await loadCatalog();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const id = scenario === "unknown-id" ? "missing-style" : catalog.styles[0].id;
    await expect(
      rankOptions(
        brief,
        [
          {
            primaryStyleId: id,
            supportingStyleIds: [],
            sceneRoles: ["Explain"],
            rationale: "A concise combination brief",
            feasible: true,
            missingAssets: [],
          },
        ],
        catalog.styles,
        RequestSchema.parse({ instructions: "Explain an example" }),
        new AbortController().signal,
        scenario === "missing-extraction" ? [] : summaries(catalog.styles),
      ),
    ).rejects.toThrow(
      scenario === "unknown-id"
        ? "Missing Motion Graphic metadata"
        : "Missing model-extracted summary",
    );
    expect(fetch).not.toHaveBeenCalled();
  },
);
