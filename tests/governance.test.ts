import { expect, it } from "vitest";
import { projectGovernance } from "../src/server/governance/report";
import { RequestSchema, type Run, type AgentProgressEvent } from "../src/shared/contracts";
import { Store } from "../src/server/jobs/store";
const run: Run = {
  id: "project",
  createdAt: "2026-10-11T00:00:00Z",
  phase: "preparing",
  request: RequestSchema.parse({ instructions: "Explain a generic idea" }),
  jobs: [],
  candidates: [],
};
const event = (
  id: number,
  type: string,
  data: unknown,
  time = "2026-10-11T00:00:10Z",
): AgentProgressEvent => ({ id, runId: run.id, type, data, time, message: "" });

it("attributes saved visual authoring choices to the matching job and JEV model without duplicating usage", () => {
  const job: Run["jobs"][number] = {
    id: "preview",
    runId: run.id,
    candidateId: "direction",
    kind: "preview",
    phase: "failed",
    duration: 3,
    workspace: "/tmp/fixture",
    model: "claude-opus-5-5",
    authoringResources: {
      source: "jev",
      model: "jev-1.14.0",
      selectedIds: ["local_code"],
      decisions: [
        { id: "local_code", use: true, probability: 0.82 },
        { id: "react_bits", use: false, probability: 0.16 },
      ],
    },
  };
  const project: Run = {
    ...run,
    jobs: [job],
    candidates: [
      {
        id: "direction",
        displayTitle: "A clear idea",
        primaryStyleId: "style-001",
        supportingStyleIds: [],
        sceneRoles: [],
        rationale: "Clarity",
        feasible: true,
        missingAssets: [],
        score: 0,
        confidence: 0,
        dimensions: {},
      },
    ],
  };
  const data = {
    model: "jev-1.14.0",
    provider: "jev",
    purpose: "Authoring resource selection",
    invocationId: "selection",
  };
  const events = [
    { ...event(1, "invocation", data), jobId: job.id },
    { ...event(2, "usage", { ...data, input_tokens: 100, output_tokens: 10 }), jobId: job.id },
  ];
  const row = projectGovernance(project, events).activity[0];
  expect(row.calls).toBe(1);
  expect(row.inputTokens).toBe(100);
  expect(row.authoringSelections).toHaveLength(1);
  expect(row.authoringSelections?.[0]).toMatchObject({
    jobId: "preview",
    kind: "preview",
    direction: "A clear idea",
    resources: expect.arrayContaining([
      {
        id: "local_code",
        name: "Existing local code and libraries",
        selected: true,
        probability: 0.82,
      },
    ]),
  });
  expect(
    projectGovernance(project, [
      { ...event(3, "usage", { ...data, model: "another-model" }), jobId: job.id },
    ]).activity[0].authoringSelections,
  ).toBeUndefined();
  expect(
    projectGovernance({ ...project, jobs: [{ ...job, authoringResources: undefined }] }, events)
      .activity[0].authoringSelections,
  ).toBeUndefined();
});
it("shows saved audio choices through the same authoring details without duplicating invocation and usage events", () => {
  const job: Run["jobs"][number] = {
    id: "full",
    runId: run.id,
    candidateId: "direction",
    kind: "full",
    phase: "generating",
    duration: 180,
    workspace: "/tmp/fixture",
    model: "claude-opus-5-5",
    audioAuthoring: {
      source: "jev",
      model: "jev-1.14.0",
      selectedId: "audio_studio",
      decisions: [
        { id: "audio_studio", use: true, probability: 0.98 },
        { id: "local_audio", use: false, probability: 0.02 },
      ],
    },
  };
  const data = { model: "jev-1.14.0", purpose: "Audio authoring selection", invocationId: "audio" };
  const events = [
    { ...event(1, "invocation", data), jobId: job.id },
    { ...event(2, "usage", { ...data, input_tokens: 9869, output_tokens: 36 }), jobId: job.id },
  ];
  const project = { ...run, jobs: [job] };
  const row = projectGovernance(project, events).activity[0];
  expect(row).toMatchObject({ calls: 1, inputTokens: 9869, outputTokens: 36 });
  expect(row.authoringSelections).toEqual([
    {
      jobId: "full",
      kind: "full",
      direction: "",
      resources: [
        { id: "audio_studio", name: "Audio Studio", selected: true, probability: 0.98 },
        { id: "local_audio", name: "Local audio tools", selected: false, probability: 0.02 },
      ],
    },
  ]);
  for (const source of ["uploads", "skipped", "unavailable"] as const) {
    expect(
      projectGovernance(
        { ...run, jobs: [{ ...job, audioAuthoring: { source, decisions: [] } }] },
        events,
      ).activity[0].authoringSelections,
    ).toBeUndefined();
  }
  expect(
    projectGovernance(project, [{ ...events[0], data: { ...data, model: "different-model" } }])
      .activity[0].authoringSelections,
  ).toBeUndefined();
  expect(
    projectGovernance(project, [{ ...events[0], jobId: undefined }]).activity[0]
      .authoringSelections,
  ).toBeUndefined();
  expect(
    projectGovernance(project, [{ ...events[0], data: { ...data, purpose: "Other selection" } }])
      .activity[0].authoringSelections,
  ).toBeUndefined();
});
it("counts tools once across stream updates and tokens once per invocation", () => {
  const d = {
    provider: "codex",
    model: "gpt-6.1-sol",
    purpose: "Brief preparation",
    invocationId: "turn",
    itemId: "tool",
  };
  const usage = { ...d, input_tokens: 1000, cached_input_tokens: 800, output_tokens: 20 };
  const result = projectGovernance(
    run,
    [
      event(1, "invocation", d),
      event(2, "command_execution", d),
      event(3, "command_execution", d),
      event(4, "usage", usage),
      event(5, "usage", usage),
    ],
    Date.parse("2026-10-11T00:01:00Z"),
  );
  expect(result.activity[0]).toMatchObject({
    calls: 1,
    tools: 1,
    inputTokens: 1000,
    outputTokens: 20,
    cachedTokens: 800,
  });
  expect(result.activity[0].costLow).toBeCloseTo(0.00068);
  expect(result.durationMs).toBe(60000);
  expect(result.finished).toBeNull();
});
it("differences cumulative Claude per-model snapshots across functions and continued sessions", () => {
  const usage = (invocationId: string, purpose: string, input: number, cost: number) => ({
    model: "claude-opus-5-5",
    provider: "claude",
    sessionId: "session",
    invocationId,
    purpose,
    modelUsage: {
      "claude-opus-5-5": {
        inputTokens: input,
        outputTokens: input,
        cacheReadInputTokens: 100,
        cacheCreationInputTokens: 20,
        costUSD: cost,
      },
    },
  });
  const result = projectGovernance(run, [
    event(1, "usage", usage("one", "Brief preparation", 10, 0.1)),
    event(2, "usage", usage("two", "Motion Graphic combinations", 15, 0.15)),
  ]);
  expect(result.activity[0]).toMatchObject({
    inputTokens: 130,
    outputTokens: 10,
    costLow: 0.00036,
  });
  expect(result.activity[1].inputTokens).toBe(5);
  expect(result.activity[1].costLow).toBeCloseTo(0.00012, 8);
});
it("retains unreported and unpriced usage without claiming zero cost", () => {
  const result = projectGovernance(run, [
    event(1, "invocation", { model: "custom-model", purpose: "Preview", invocationId: "failed" }),
  ]);
  expect(result.activity[0]).toMatchObject({ calls: 1, inputTokens: null, costLow: null });
});
it("prices Astra usage with short and long context bounds including both cache types", () => {
  const result = projectGovernance(run, [
    event(1, "usage", {
      provider: "codex",
      model: "gpt-6-astra",
      invocationId: "astra-turn",
      purpose: "Full video generation",
      input_tokens: 1000000,
      cached_input_tokens: 600000,
      cache_write_input_tokens: 100000,
      output_tokens: 100000,
    }),
  ]);
  expect(result.activity[0]).toMatchObject({
    model: "gpt-6-astra",
    inputTokens: 1000000,
    outputTokens: 100000,
    cachedTokens: 600000,
    costLow: 9.85,
    costHigh: 17.2,
  });
});
it("does not attribute additional SDK models to the primary model's generation task", () => {
  const result = projectGovernance(run, [
    event(1, "usage", {
      model: "claude-opus-5-5",
      invocationId: "full-turn",
      sessionId: "session",
      purpose: "full video generation",
      modelUsage: {
        "claude-opus-5-5": { inputTokens: 100, outputTokens: 50, costUSD: 0.1 },
        "claude-haiku-5-5": { inputTokens: 20, outputTokens: 2, costUSD: 0.001 },
      },
    }),
  ]);
  expect(result.activity.find((row) => row.model === "claude-opus-5-5")).toMatchObject({
    purpose: "full video generation",
    calls: 1,
  });
  expect(result.activity.find((row) => row.model === "claude-haiku-5-5")).toMatchObject({
    purpose: "Additional SDK session usage · task unreported",
    inputTokens: 20,
    outputTokens: 2,
    costLow: 0.001,
    calls: 0,
  });
});
it("records cache hits with no new model call or token spend", () => {
  const result = projectGovernance(run, [
    event(1, "summary_cache", {
      model: "gpt-6-luna",
      purpose: "Motion Graphic information extraction",
    }),
  ]);
  expect(result.activity[0]).toMatchObject({
    calls: 0,
    cacheHits: 1,
    inputTokens: null,
    costLow: null,
  });
});
it("finishes timing at the terminal state event and flags legacy attribution", () => {
  const result = projectGovernance({ ...run, phase: "ready" }, [
    event(1, "usage", { input_tokens: 10, output_tokens: 2 }),
    event(2, "state", undefined, "2026-10-11T00:02:00Z"),
  ]);
  expect(result.durationMs).toBe(120000);
  expect(result.finished).toBe("2026-10-11T00:02:00Z");
  expect(result.incompleteHistory).toBe(true);
  expect(result.activity[0].model).toBe("Unrecorded model");
});
it.each(["jev-1.13.0", "jev-1.14.0"])("prices versioned Jev input tokens for %s", (model) => {
  const result = projectGovernance(run, [
    event(1, "usage", {
      model,
      provider: "jev",
      invocationId: "jev",
      usage: { input_tokens: 1000000, output_tokens: 50 },
    }),
  ]);
  expect(result.activity[0]).toMatchObject({
    inputTokens: 1000000,
    outputTokens: 50,
    costLow: 0.042,
  });
});
it("reads all governance events and projects beyond normal history pagination", () => {
  const store = new Store(":memory:");
  try {
    for (let i = 0; i < 55; i++) store.save({ ...run, id: `project-${i}` });
    for (let i = 0; i < 510; i++)
      store.emit(run.id, "usage", "Usage", undefined, { input_tokens: 1 });
    expect(store.allRuns()).toHaveLength(55);
    expect(store.allEvents(run.id)).toHaveLength(510);
    expect(store.events(run.id)).toHaveLength(500);
  } finally {
    store.close();
  }
});

it("aggregates recorded metrics by model across functions, preserving unknown costs", async () => {
  const { aggregateModels } = await import("../src/shared/governance");
  const report = projectGovernance(run, [
    event(1, "usage", {
      model: "custom",
      invocationId: "a",
      purpose: "Brief",
      input_tokens: 10,
      output_tokens: 2,
    }),
    event(2, "usage", {
      model: "custom",
      invocationId: "b",
      purpose: "Preview",
      input_tokens: 20,
      output_tokens: 3,
    }),
  ]);
  expect(aggregateModels(report.activity)[0]).toMatchObject({
    calls: 2,
    inputTokens: 30,
    outputTokens: 5,
    costLow: null,
  });
});

it("does not count previously captured legacy Claude cost twice after upgrading telemetry", () => {
  const result = projectGovernance(run, [
    event(1, "session", { sessionId: "continued" }),
    event(2, "usage", {
      sessionId: "continued",
      model: "claude-opus-5-5",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 0,
      },
      cost: 0.1,
    }),
    event(3, "usage", {
      sessionId: "continued",
      model: "claude-opus-5-5",
      invocationId: "new",
      purpose: "Full generation",
      modelUsage: {
        "claude-opus-5-5": {
          inputTokens: 15,
          outputTokens: 8,
          cacheReadInputTokens: 25,
          cacheCreationInputTokens: 0,
          costUSD: 0.15,
        },
      },
    }),
  ]);
  expect(result.activity[1].inputTokens).toBe(10);
  expect(result.activity[1].costLow).toBeCloseTo(0.000081, 8);
});
it("does not invent completion timing for an empty historical project", () => {
  expect(projectGovernance({ ...run, phase: "ready" }, []).durationMs).toBeNull();
});

it("resolves a Jev invocation alias to its returned version without counting twice", () => {
  const result = projectGovernance(run, [
    event(1, "invocation", { provider: "jev", model: "jev-latest", invocationId: "jev" }),
    event(2, "usage", {
      provider: "jev",
      model: "jev-1.13.0",
      invocationId: "jev",
      usage: { input_tokens: 100, output_tokens: 5 },
    }),
  ]);
  expect(result.activity).toHaveLength(1);
  expect(result.activity[0]).toMatchObject({ model: "jev-1.13.0", calls: 1 });
});

it("separates correction types and repair tiers using recorded metadata", () => {
  const events = ["layout", "contrast", "technical", "pacing", "style"].flatMap((focus, index) =>
    ["cheap", "main"].map((tier, offset) =>
      event(index * 2 + offset + 1, "invocation", {
        model: "example-model",
        purpose: "correction",
        correctionFocus: focus,
        correctionTier: tier,
        invocationId: `${focus}-${tier}`,
      }),
    ),
  );
  const activity = projectGovernance(run, events).activity;
  expect(activity).toHaveLength(10);
  for (const label of ["Layout", "Contrast", "Technical", "Pacing", "Motion Graphic"]) {
    expect(activity).toContainEqual(
      expect.objectContaining({
        purpose: `${label} correction · initial lower-cost repair`,
        calls: 1,
      }),
    );
    expect(activity).toContainEqual(
      expect.objectContaining({ purpose: `${label} correction · main-model repair`, calls: 1 }),
    );
  }
});
it("does not invent correction types or tiers for historical activity", () => {
  expect(
    projectGovernance(run, [
      event(1, "invocation", {
        model: "example-model",
        correctionFocus: "layout",
        invocationId: "one",
      }),
    ]).activity[0].purpose,
  ).toBe("Layout correction");
  expect(
    projectGovernance(run, [
      event(1, "invocation", {
        model: "example-model",
        purpose: "Original function",
        correctionFocus: "unknown",
        invocationId: "two",
      }),
    ]).activity[0].purpose,
  ).toBe("Original function");
});

const codexUsage = (
  id: number,
  sessionId: string | undefined,
  input: number,
  cached: number | undefined,
  output: number,
  purpose = "Preview",
  extra: Record<string, unknown> = {},
) =>
  event(id, "usage", {
    provider: "codex",
    model: "gpt-6.1-sol",
    invocationId: `call-${id}`,
    sessionId,
    purpose,
    input_tokens: input,
    cached_input_tokens: cached,
    output_tokens: output,
    ...extra,
  });
it("counts the observed resumed Codex snapshots once and attributes only increments to repairs", () => {
  const events = [
    codexUsage(1, "preview", 533710, 422656, 8653, "Planning"),
    codexUsage(2, "preview", 1247473, 935168, 20415, "Build"),
    codexUsage(3, "preview", 1726755, 1376512, 23864, "Repair"),
    codexUsage(4, "preview", 2667012, 2289664, 27255, "Repair"),
  ];
  const original = structuredClone(events);
  const result = projectGovernance(run, events);
  const sum = (field: "inputTokens" | "outputTokens" | "cachedTokens" | "costLow" | "costHigh") =>
    result.activity.reduce((n, row) => n + (row[field] ?? 0), 0);
  expect(sum("inputTokens")).toBe(2667012);
  expect(sum("cachedTokens")).toBe(2289664);
  expect(sum("outputTokens")).toBe(27255);
  expect(result.activity.find((row) => row.purpose === "Repair")).toMatchObject({
    calls: 2,
    inputTokens: 1419539,
    cachedTokens: 1354496,
    outputTokens: 6840,
  });
  const reference = projectGovernance(run, [codexUsage(1, "new", 2667012, 2289664, 27255)])
    .activity[0];
  expect(sum("costLow")).toBeCloseTo(reference.costLow!);
  expect(sum("costHigh")).toBeCloseTo(reference.costHigh!);
  expect(events).toEqual(original);
});
it("keeps separate Codex sessions independent and tracks their resumed increments", () => {
  const result = projectGovernance(run, [
    codexUsage(1, "a", 100, 50, 10),
    codexUsage(2, "b", 200, 100, 20),
    codexUsage(3, "a", 150, 80, 15),
    codexUsage(4, "b", 300, 150, 30),
  ]);
  expect(result.activity[0]).toMatchObject({
    calls: 4,
    inputTokens: 450,
    cachedTokens: 230,
    outputTokens: 45,
  });
});
it("keeps the Codex baseline across preview/full jobs and changes of purpose", () => {
  const first = { ...codexUsage(1, "same", 100, 40, 10, "Preview"), jobId: "preview" };
  const second = { ...codexUsage(2, "same", 250, 100, 25, "Full"), jobId: "full" };
  const result = projectGovernance(run, [first, second]);
  expect(result.activity[1]).toMatchObject({
    purpose: "Full",
    inputTokens: 150,
    cachedTokens: 60,
    outputTokens: 15,
  });
});
it("does not charge earlier Codex work to a different model in the same thread", () => {
  const result = projectGovernance(run, [
    codexUsage(1, "same", 100, 50, 10),
    codexUsage(2, "same", 200, 90, 20, "Repair", { model: "gpt-6-luna" }),
  ]);
  expect(result.activity.find((row) => row.model === "gpt-6-luna")).toMatchObject({
    inputTokens: 100,
    cachedTokens: 40,
    outputTokens: 10,
  });
});
it("does not add unchanged or duplicated cumulative snapshots", () => {
  const first = codexUsage(1, "same", 100, 50, 10);
  const result = projectGovernance(run, [
    first,
    { ...first, id: 2 },
    codexUsage(3, "same", 100, 50, 10),
  ]);
  expect(result.activity[0]).toMatchObject({
    calls: 2,
    inputTokens: 100,
    cachedTokens: 50,
    outputTokens: 10,
  });
});
it("handles reset Codex counters and preserves cache-write pricing", () => {
  const result = projectGovernance(run, [
    codexUsage(1, "same", 1000, 800, 50, "Build", { cache_write_input_tokens: 100 }),
    codexUsage(2, "same", 100, 20, 5, "Repair", { cache_write_input_tokens: 10 }),
    codexUsage(3, "same", 150, 40, 8, "Repair", { cache_write_input_tokens: 15 }),
  ]);
  expect(result.activity[1]).toMatchObject({ inputTokens: 150, cachedTokens: 40, outputTokens: 8 });
  expect(result.activity[1].costLow).toBeCloseTo((95 * 2 + 40 * 0.1 + 15 * 2.5 + 8 * 10) / 1e6);
});
it("retains missing-field baselines rather than re-counting previously observed cached tokens", () => {
  const result = projectGovernance(run, [
    codexUsage(1, "same", 100, 50, 10),
    codexUsage(2, "same", 150, undefined, 20),
    codexUsage(3, "same", 200, 100, 30),
  ]);
  expect(result.activity[0]).toMatchObject({
    inputTokens: 200,
    cachedTokens: 100,
    outputTokens: 30,
  });
});
it("supports explicitly per-turn Codex usage without differencing it", () => {
  const result = projectGovernance(run, [
    codexUsage(1, "same", 100, 50, 10, "Preview", { usageScope: "turn" }),
    codexUsage(2, "same", 100, 50, 10, "Preview", { usageScope: "turn" }),
  ]);
  expect(result.activity[0]).toMatchObject({
    inputTokens: 200,
    cachedTokens: 100,
    outputTokens: 20,
  });
});
it("does not guess a shared Codex session when identity was not recorded", () => {
  const result = projectGovernance(run, [
    codexUsage(1, undefined, 100, 50, 10),
    codexUsage(2, undefined, 100, 50, 10),
  ]);
  expect(result.activity[0].inputTokens).toBe(200);
  expect(result.incompleteHistory).toBe(true);
});
it("uses the invocation's recorded session event when usage has no session field", () => {
  const first = codexUsage(1, "shared", 100, 50, 10);
  const session = event(2, "session", { invocationId: "call-3", sessionId: "shared" });
  const second = codexUsage(3, undefined, 150, 70, 15);
  expect(projectGovernance(run, [first, session, second]).activity[0]).toMatchObject({
    inputTokens: 150,
    cachedTokens: 70,
    outputTokens: 15,
  });
});
it("keeps the cumulative baseline through capacity failures without inventing their missing usage", () => {
  const result = projectGovernance(run, [
    codexUsage(1, "same", 100, 50, 10),
    event(2, "invocation", {
      provider: "codex",
      model: "gpt-6.1-sol",
      invocationId: "failed",
      sessionId: "same",
      purpose: "Preview",
    }),
    event(3, "retry", { provider: "codex", sessionId: "same", reason: "model_capacity" }),
    codexUsage(4, "same", 160, 70, 15),
  ]);
  expect(result.activity[0]).toMatchObject({
    calls: 3,
    inputTokens: 160,
    cachedTokens: 70,
    outputTokens: 15,
  });
});

it("shows the idea heading for existing direct-build placeholders", () => {
  const selectedRun: Run = {
    ...run,
    request: RequestSchema.parse({
      instructions: "MY PRODUCT — IDEAS IN MOTION\n\nShow the main workflow.",
      selectedStyleIds: ["style-018"],
      candidateCount: 0,
    }),
    brief: {
      subject: "Your selection",
      audience: "",
      objective: "Show the workflow",
      facts: [],
      exactCopy: [],
      previewBeat: "",
      assetDescriptions: [],
      constraints: [],
      suggestedDuration: 30,
      durationReason: "User duration",
    },
  };
  expect(projectGovernance(selectedRun, [], Date.now()).name).toBe("MY PRODUCT — IDEAS IN MOTION");
});

it("reconstructs SDK cache writes and API costs by stage without counting continued sessions twice", async () => {
  const { aggregateModels } = await import("../src/shared/governance");
  const make = (id: number, purpose: string, multiple: number) =>
    event(id, "usage", {
      model: "claude-opus-5-5",
      provider: "claude",
      sessionId: "session",
      invocationId: `usage-${id}`,
      purpose,
      usage: {
        cache_creation_input_tokens: 300,
        cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
      },
      modelUsage: {
        "claude-opus-5-5": {
          inputTokens: 10 * multiple,
          outputTokens: 20 * multiple,
          cacheReadInputTokens: 1000 * multiple,
          cacheCreationInputTokens: 300 * multiple,
          costUSD: 999,
        },
      },
    });
  const events = [make(1, "Planning", 1), make(2, "Build", 2)];
  const rows = projectGovernance(run, [...events, events[1]]).activity;
  for (const row of rows)
    expect(row).toMatchObject({
      inputTokens: 1310,
      uncachedInputTokens: 10,
      outputTokens: 20,
      cachedTokens: 1000,
      cacheWriteTokens: 300,
      cacheWrite5mTokens: 100,
      cacheWrite1hTokens: 200,
      costBasis: "Standard API equivalent",
      costLow: 0.00274,
      costHigh: 0.00274,
    });
  expect(aggregateModels(rows)[0]).toMatchObject({
    inputTokens: 2620,
    cacheWriteTokens: 600,
    cacheWrite5mTokens: 200,
    cacheWrite1hTokens: 400,
    costLow: 0.00548,
    costHigh: 0.00548,
  });
});
