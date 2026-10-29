import { fixedCorrectionOutcome } from "./fixtures/video-correction";
import { validStoryboard } from "./fixtures/storyboard";
import { type Production } from "../src/shared/agents/schemas/video";
import { beforeEach, expect, it, vi } from "vitest";
import {
  VideoCorrectionCoordinator,
  videoCorrectionPolicy,
  technicalCorrector,
} from "../src/server/domains/video/corrector";
import {
  videoQaFindings,
  VideoQaReportSchema,
  resultReviewFindings,
} from "../src/server/domains/video/qa";
import type { VideoGenerationJob } from "../src/shared/domains/video";
vi.mock("../src/server/domains/video/storyboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/domains/video/storyboard")>()),
  writeStoryboardJson: vi.fn(async (_workspace, value) => value),
}));
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
const production: Production = {
  pipeline: "HyperFrames",
  fallbackReason: null,
  styleRenderer: ["SVG"],
  motionEngine: ["GSAP"],
  sourceFile: "index.html",
  duration: 3,
  width: 1280,
  height: 720,
  audioDescription: "Silent",
  limitations: [],
};
function setup(
  provider: "claude" | "codex" = "claude",
  overrides: Partial<VideoGenerationJob> = {},
) {
  const job: VideoGenerationJob = {
    id: "job",
    runId: "project",
    candidateId: "direction",
    kind: "preview",
    duration: 3,
    model: "selected-main",
    sessionId: "generation-session",
    phase: "failed",
    workspace: "/tmp/example-video",
    production,
    ...overrides,
  };
  const onEvent = vi.fn();
  const controller = new AbortController();
  const coordinator = new VideoCorrectionCoordinator({
    job,
    provider,
    signal: controller.signal,
    onEvent,
    emit: vi.fn(),
    update: vi.fn(),
  });
  return { job, onEvent, controller, coordinator };
}
beforeEach(() => vi.clearAllMocks());
it.each(["claude", "codex"] as const)(
  "keeps exhausted repair budgets separate between shots for %s",
  async (provider) => {
    const { coordinator } = setup(provider);
    vi.mocked(agentTurn).mockResolvedValue({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
      sessionId: "repair-session",
    });
    const issue = (file: string) => ({
      focus: "technical" as const,
      cheapEligible: true,
      evidence: { file, code: "runtime_error" },
    });
    const total = provider === "claude" ? 12 : 22;
    for (let round = 0; round < total; round++)
      await coordinator.correctRound([issue("shots/01.html")]);
    await expect(coordinator.correctRound([issue("shots/01.html")])).rejects.toThrow("round limit");
    await coordinator.correctRound([issue("shots/02.html")]);
    const last = vi.mocked(agentTurn).mock.calls.at(-1)![0];
    expect(last.model).toBe(provider === "claude" ? "claude-haiku-5-5" : "gpt-6-luna");
    if (provider === "claude") expect(last.reasoningEffort).toBe("medium");
    await expect(coordinator.correctRound([issue("shots/01.html")])).rejects.toThrow("round limit");
  },
);
it("allows five GPT-6.1 full-video repair rounds, charges once per round and reuses the build session", async () => {
  const { coordinator, job } = setup("codex", { kind: "full", model: "gpt-6.1-sol" });
  vi.mocked(agentTurn).mockResolvedValue({
    value: {
      correctionOutcome: fixedCorrectionOutcome,
      ...production,
      storyboard: validStoryboard(),
    },
    sessionId: "generation-session",
  });
  const findings = [
    { focus: "style" as const, cheapEligible: false, evidence: "Motion Graphic needs repair" },
    { focus: "pacing" as const, cheapEligible: false, evidence: "Pacing needs repair" },
  ];
  for (let round = 0; round < videoCorrectionPolicy.gpt61Full.main; round++)
    await coordinator.correctRound(findings);
  expect(agentTurn).toHaveBeenCalledTimes(10);
  for (const [call] of vi.mocked(agentTurn).mock.calls) {
    expect(call).toMatchObject({
      model: "gpt-6.1-sol",
      sessionId: "generation-session",
      includeCreativeAlternatives: false,
    });
    expect(call.prompt).toContain("rerun checks only after every issue in this round");
    expect(call.prompt).toContain("GPT-6.1 VIDEO PRODUCTION PRINCIPLES");
    expect(call.prompt).toContain("CAPTURED FOOTAGE FRAMING:");
    expect(call.prompt).toContain("Preserve the recording's aspect ratio throughout extraction");
  }
  await expect(coordinator.correctRound(findings)).rejects.toThrow("round limit");
  expect(agentTurn).toHaveBeenCalledTimes(10);
  expect(job.sessionId).toBe("generation-session");
});
it.each([
  ["codex", "preview", "gpt-6.1-sol"],
  ["codex", "full", "gpt-6-astra"],
] as const)("preserves the two main-round limit for %s %s %s", async (provider, kind, model) => {
  const { coordinator } = setup(provider, { kind, model });
  vi.mocked(agentTurn).mockResolvedValue({
    value: {
      correctionOutcome: fixedCorrectionOutcome,
      ...production,
      storyboard: validStoryboard(),
    },
    sessionId: "generation-session",
  });
  const findings = [
    { focus: "style" as const, cheapEligible: false, evidence: "Repair Motion Graphic" },
  ];
  await coordinator.correctRound(findings);
  await coordinator.correctRound(findings);
  await expect(coordinator.correctRound(findings)).rejects.toThrow("round limit");
  expect(agentTurn).toHaveBeenCalledTimes(2);
});
it.each([["codex", "gpt-6-luna"]] as const)(
  "reuses a separate %s cheap session and escalates to the original main session",
  async (provider, model) => {
    const { job, coordinator } = setup(provider);
    vi.mocked(agentTurn).mockResolvedValue({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
      sessionId: "cheap-session",
    });
    const finding = {
      focus: "layout" as const,
      cheapEligible: true,
      evidence: { selector: "#label", times: [1.5] },
    };
    for (let round = 0; round < 20; round++) await coordinator.correctRound([finding]);
    vi.mocked(agentTurn).mockResolvedValue({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
      sessionId: "generation-session",
    });
    await coordinator.correctRound([finding]);
    const calls = vi.mocked(agentTurn).mock.calls.map(([options]) => options);
    expect([calls[0], calls[1], calls[20]].map((call) => [call.model, call.sessionId])).toEqual([
      [model, undefined],
      [model, "cheap-session"],
      ["selected-main", "generation-session"],
    ]);
    expect(job.sessionId).toBe("generation-session");
    expect(job.correctionSession).toEqual({ model, sessionId: "cheap-session" });
    expect(JSON.stringify(calls[0].promptContext)).toContain("#label");
    expect(calls[0].prompt).toContain("saved QA screenshots");
    expect(calls[0].prompt).toContain("Never suppress checks");
  },
);
it.each(["pacing", "style"] as const)(
  "resumes the main generation session directly for %s",
  async (focus) => {
    const { coordinator } = setup("codex");
    vi.mocked(agentTurn).mockResolvedValue({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
      sessionId: "generation-session",
    });
    await coordinator.correctRound([
      { focus, cheapEligible: false, evidence: "Review needs changes" },
    ]);
    expect(agentTurn).toHaveBeenCalledWith(
      expect.objectContaining({ model: "selected-main", sessionId: "generation-session" }),
    );
  },
);
it("retains the failed cheap session separately and escalates to the main session", async () => {
  const { coordinator, job, onEvent } = setup();
  vi.mocked(agentTurn)
    .mockImplementationOnce(async (options) => {
      options.onEvent({ type: "session", message: "Opened", data: { sessionId: "partial-cheap" } });
      throw Error("Interrupted turn");
    })
    .mockResolvedValueOnce({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
      sessionId: "partial-cheap",
    });
  await coordinator.correctRound([
    { focus: "contrast", cheapEligible: true, evidence: { contrast: 2 } },
  ]);
  expect(vi.mocked(agentTurn).mock.calls[1][0].sessionId).toBe("generation-session");
  expect(job.correctionSession?.sessionId).toBe("partial-cheap");
  expect(job.sessionId).toBe("partial-cheap");
  expect(onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ correctionFocus: "contrast", correctionTier: "cheap" }),
    }),
  );
});
it("bounds failed corrections and never marks cancellation as another repair", async () => {
  const { coordinator, controller } = setup();
  vi.mocked(agentTurn).mockRejectedValue(Error("Cannot repair"));
  await expect(
    coordinator.correctRound([
      { focus: "technical", cheapEligible: true, evidence: { code: "runtime" } },
    ]),
  ).rejects.toThrow("Cannot repair");
  expect(agentTurn).toHaveBeenCalledTimes(3);
  controller.abort();
  await expect(
    coordinator.correctRound([{ focus: "layout", cheapEligible: true, evidence: {} }]),
  ).rejects.toThrow();
  expect(agentTurn).toHaveBeenCalledTimes(3);
});
it("routes structured QA categories and ignores advisory findings", () => {
  const pass = { ok: true, findings: [] };
  const report = VideoQaReportSchema.parse({
    ok: false,
    browserSkipped: false,
    lint: pass,
    runtime: pass,
    motion: pass,
    contrast: pass,
    layout: {
      ok: false,
      findings: [
        { severity: "error", code: "content_overlap", selector: "#label", times: [1.5] },
        { severity: "info", code: "content_overlap" },
      ],
    },
    snapshots: { files: ["snapshots/frame.png"] },
  });
  expect(videoQaFindings(report)).toMatchObject([
    {
      focus: "layout",
      cheapEligible: true,
      evidence: {
        diagnostics: [
          {
            renderer: "hyperframes",
            stage: "layout",
            severity: "error",
            code: "content_overlap",
            details: { selector: "#label", times: [1.5] },
          },
        ],
        reportFile: "renders/qa-report.json",
        snapshots: { files: ["snapshots/frame.png"] },
      },
    },
  ]);
  expect(videoQaFindings({ ...report, ok: true, layout: pass })).toEqual([]);
  expect(
    videoQaFindings({ ...report, ok: true, layout: pass, browserSkipped: true })[0],
  ).toMatchObject({ focus: "technical", cheapEligible: false });
  expect(
    resultReviewFindings({
      pacingPlan: "needs_review",
      styleMatch: "needs_review",
      narration: "not_added",
      sungVocals: "not_added",
      music: "added",
    }).map((f) => f.focus),
  ).toEqual(["pacing", "style"]);
});

it("bounds rejected settings across cheap and main attempts while preserving the accepted manifest", async () => {
  const { coordinator, job } = setup();
  vi.mocked(agentTurn).mockResolvedValue({
    value: { correctionOutcome: fixedCorrectionOutcome, ...production, duration: 5 },
    sessionId: "cheap-session",
  });
  await expect(
    coordinator.correctRound([
      { focus: "layout", cheapEligible: true, evidence: { selector: "#label" } },
    ]),
  ).rejects.toThrow("Corrector changed");
  expect(job.production?.duration).toBe(3);
  expect(agentTurn).toHaveBeenCalledTimes(3);
});

it.each(["claude", "codex"] as const)(
  "fixes multiple issues sequentially in the same %s session with the latest manifest",
  async (provider) => {
    const { coordinator, job } = setup(provider);
    const first = { ...production, limitations: ["First issue fixed"] };
    vi.mocked(agentTurn)
      .mockResolvedValueOnce({
        value: {
          correctionOutcome: fixedCorrectionOutcome,
          ...first,
          storyboard: validStoryboard(),
        },
        sessionId: "round-session",
      })
      .mockResolvedValueOnce({
        value: {
          correctionOutcome: fixedCorrectionOutcome,
          ...production,
          storyboard: validStoryboard(),
        },
        sessionId: "round-session",
      });
    await coordinator.correctRound([
      { focus: "layout", cheapEligible: true, evidence: { selector: "#first" } },
      { focus: "contrast", cheapEligible: true, evidence: { selector: "#second" } },
    ]);
    const calls = vi.mocked(agentTurn).mock.calls.map(([call]) => call);
    expect(calls).toHaveLength(2);
    expect(calls[1].sessionId).toBe("round-session");
    expect(calls[1].model).toBe(calls[0].model);
    expect(calls[1].promptContext).toMatchObject({ currentManifest: first });
    expect(JSON.stringify(calls[0].promptContext)).not.toContain("#second");
    expect(JSON.stringify(calls[1].promptContext)).not.toContain("#first");
    expect(job.production).toEqual(production);
  },
);

it.each(["layout", "contrast", "technical", "pacing", "style"] as const)(
  "supplies an explicit issue, expected fix, acceptance criteria and exact evidence for %s",
  async (focus) => {
    const { coordinator } = setup();
    vi.mocked(agentTurn).mockResolvedValue({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
      sessionId: "generation-session",
    });
    await coordinator.correctRound([
      {
        focus,
        cheapEligible: false,
        evidence: {
          message: "Affected label is clipped",
          selector: "#label",
          time: 1.5,
          fixHint: "Increase the label container height",
          sourceFile: "index.html",
        },
      },
    ]);
    const prompt = JSON.stringify(vi.mocked(agentTurn).mock.calls[0][0].promptContext);
    expect(prompt).toContain('"issue":');
    expect(prompt).toContain('"expectedFix":');
    expect(prompt).toContain('"acceptanceCriteria":');
    expect(prompt).toContain('"selector":"#label"');
    expect(prompt).toContain('"time":1.5');
    expect(prompt).toContain("Increase the label container height");
    expect(vi.mocked(agentTurn).mock.calls[0][0].prompt).toContain(
      "do not guess or edit unrelated video code",
    );
  },
);

it("directs determinism repairs to frame evidence without weakening validation", () => {
  expect(technicalCorrector.instructions).toContain("reference/actual/diff images before editing");
  expect(technicalCorrector.instructions).toContain("cleared Canvas 2D overlay");
  expect(technicalCorrector.instructions).toContain("identical DOM, geometry and loaded fonts");
  expect(technicalCorrector.instructions).toContain("shape-rendering: geometricPrecision");
  expect(technicalCorrector.instructions).toContain("text-rendering: geometricPrecision");
  expect(technicalCorrector.instructions).toContain(
    "Do not guess at unrelated code or weaken comparison thresholds",
  );
});

it.each([true, false])(
  "uses ten Haiku rounds before main escalation regardless of cheap eligibility (%s)",
  async (cheapEligible) => {
    const { coordinator, job } = setup("claude", { model: "claude-opus-5-5" });
    vi.mocked(agentTurn).mockImplementation(async (options) => ({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
      sessionId: options.model === "claude-haiku-5-5" ? "haiku-session" : "generation-session",
    }));
    const findings = [
      { focus: "technical" as const, cheapEligible, evidence: "Same reload mismatch" },
    ];
    for (let round = 0; round < 12; round++) await coordinator.correctRound(findings);
    await expect(coordinator.correctRound(findings)).rejects.toThrow("round limit");
    const calls = vi.mocked(agentTurn).mock.calls.map(([call]) => call);
    expect(calls.slice(0, 10).every((call) => call.model === "claude-haiku-5-5")).toBe(true);
    expect(calls.slice(0, 10).map((call) => call.reasoningEffort)).toEqual([
      "medium",
      "medium",
      "medium",
      "high",
      "high",
      "high",
      "xhigh",
      "xhigh",
      "xhigh",
      "xhigh",
    ]);
    expect(calls[1].sessionId).toBe("haiku-session");
    expect(calls.slice(10).map((call) => [call.model, call.sessionId])).toEqual([
      ["claude-opus-5-5", "generation-session"],
      ["claude-opus-5-5", "generation-session"],
    ]);
    expect(calls[10].promptContext).toMatchObject({
      correctionHistory: expect.stringContaining("10 attempts"),
    });
    expect(job.sessionId).toBe("generation-session");
  },
);

it("escalates a rejected Haiku manifest with the previous failure", async () => {
  const { coordinator, job } = setup();
  vi.mocked(agentTurn)
    .mockResolvedValueOnce({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        width: 640,
        storyboard: validStoryboard(),
      },
      sessionId: "repair-session",
    })
    .mockResolvedValueOnce({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
      sessionId: "repair-session",
    });
  await coordinator.correctRound([{ focus: "layout", cheapEligible: true, evidence: "Clip" }]);
  expect(agentTurn).toHaveBeenCalledTimes(2);
  expect(vi.mocked(agentTurn).mock.calls[1][0]).toMatchObject({
    sessionId: "generation-session",
    model: "claude-opus-5-5",
    reasoningEffort: "xhigh",
    promptContext: { previousFailure: expect.stringContaining("Corrector changed") },
  });
  expect(job.production).toEqual(production);
});

it("retries only the failed issue and keeps previously accepted corrections", async () => {
  const { coordinator } = setup();
  const first = { ...production, limitations: ["First fixed"] };
  vi.mocked(agentTurn)
    .mockResolvedValueOnce({
      value: { correctionOutcome: fixedCorrectionOutcome, ...first, storyboard: validStoryboard() },
      sessionId: "repair",
    })
    .mockRejectedValueOnce(Error("Invalid response"))
    .mockResolvedValueOnce({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
      sessionId: "repair",
    });
  await coordinator.correctRound([
    { focus: "layout", cheapEligible: true, evidence: "First" },
    { focus: "contrast", cheapEligible: true, evidence: "Second" },
  ]);
  const calls = vi.mocked(agentTurn).mock.calls.map(([call]) => call);
  expect(calls).toHaveLength(3);
  expect(calls[2].promptContext).toMatchObject({
    currentManifest: first,
    correctionTask: { evidence: "Second" },
  });
});

it("stops immediately when a Haiku correction is cancelled", async () => {
  const { coordinator, controller } = setup();
  vi.mocked(agentTurn).mockImplementationOnce(async () => {
    controller.abort();
    throw Error("Cancelled");
  });
  await expect(
    coordinator.correctRound([{ focus: "layout", cheapEligible: true, evidence: {} }]),
  ).rejects.toThrow();
  expect(agentTurn).toHaveBeenCalledTimes(1);
});

it("inherits an omitted frame rate from the accepted production rather than defaulting it to 30", async () => {
  const { coordinator, job } = setup("claude", { production: { ...production, fps: 60 } });
  vi.mocked(agentTurn).mockResolvedValue({
    value: {
      correctionOutcome: fixedCorrectionOutcome,
      ...production,
      storyboard: validStoryboard(),
    },
    sessionId: "repair",
  });
  await coordinator.correctRound([{ focus: "layout", cheapEligible: true, evidence: "Clip" }]);
  expect(agentTurn).toHaveBeenCalledTimes(1);
  expect(job.production?.fps).toBe(60);
});

it("stops retrying a blocking capability decision and preserves the accepted production", async () => {
  const { coordinator, job } = setup("claude", { production: { ...production, fps: 60 } });
  const need = {
    mode: "blocking" as const,
    kind: "voice" as const,
    cause: "tool-capability" as const,
    reason: "Required voice unavailable",
    question: "Which available voice should be used?",
    fallback: "Use another configured voice",
  };
  vi.mocked(agentTurn).mockResolvedValue({
    value: {
      correctionOutcome: fixedCorrectionOutcome,
      ...production,
      assetNeeds: [need],
      storyboard: validStoryboard(),
    },
    sessionId: "repair",
  });
  await expect(
    coordinator.correctRound([{ focus: "pacing", cheapEligible: false, evidence: "Voice" }]),
  ).rejects.toThrow("Waiting for a user decision");
  expect(agentTurn).toHaveBeenCalledTimes(1);
  expect(job.production).toMatchObject({ ...production, fps: 60, assetNeeds: [need] });
});

it.each(["claude", "codex"] as const)(
  "retains a segmented film when a %s correction omits the unchanged shot list",
  async (provider) => {
    const shots = [
      { sourceFile: "shots/first.html", duration: 1 },
      { sourceFile: "shots/second.html", duration: 2 },
    ];
    const current = {
      ...production,
      pipeline: "Multiplane" as const,
      sourceFile: shots[0].sourceFile,
      shots,
    };
    const { coordinator, job } = setup(provider, { production: current });
    const { shots: _shots, ...withoutShots } = current;
    vi.mocked(agentTurn).mockResolvedValue({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...withoutShots,
        storyboard: validStoryboard(),
      },
    });
    await coordinator.correctRound([
      { focus: "layout", cheapEligible: true, evidence: "Fix one clipped heading" },
    ]);
    expect(job.production?.shots).toEqual(shots);
    expect(job.production?.sourceFile).toBe(shots[0].sourceFile);
  },
);
it("accepts an explicit valid shot revision without replacing it with the previous list", async () => {
  const shots = [
    { sourceFile: "shots/first.html", duration: 1 },
    { sourceFile: "shots/second.html", duration: 2 },
  ];
  const current = {
    ...production,
    pipeline: "Multiplane" as const,
    sourceFile: shots[0].sourceFile,
    shots,
  };
  const { coordinator, job } = setup("claude", { production: current });
  const revised = [
    { ...shots[0], duration: 2 },
    { ...shots[1], duration: 1 },
  ];
  vi.mocked(agentTurn).mockResolvedValue({
    value: {
      correctionOutcome: fixedCorrectionOutcome,
      ...current,
      shots: revised,
      storyboard: validStoryboard(),
    },
  });
  await coordinator.correctRound([
    { focus: "pacing", cheapEligible: true, evidence: "Rebalance the two shots" },
  ]);
  expect(job.production?.shots).toEqual(revised);
});
it("rejects invalid shot totals without replacing the accepted production", async () => {
  const shots = [
    { sourceFile: "shots/first.html", duration: 1 },
    { sourceFile: "shots/second.html", duration: 2 },
  ];
  const current = {
    ...production,
    pipeline: "Multiplane" as const,
    sourceFile: shots[0].sourceFile,
    shots,
  };
  const { coordinator, job } = setup("codex", { production: current });
  vi.mocked(agentTurn).mockResolvedValue({
    value: {
      correctionOutcome: fixedCorrectionOutcome,
      ...current,
      shots: [shots[0]],
      storyboard: validStoryboard(),
    },
  });
  await expect(
    coordinator.correctRound([
      { focus: "technical", cheapEligible: true, evidence: "Fix initialization" },
    ]),
  ).rejects.toThrow("sum to the requested film duration");
  expect(job.production).toEqual(current);
});

it.each(["claude", "codex"] as const)(
  "merges %s corrections without dropping any omitted optional production fields",
  async (provider) => {
    const current = {
      ...production,
      fps: 60 as const,
      audioFile: "audio/score.wav",
      displayTitle: "Existing title",
      displayDescription: "Existing description",
    };
    const { coordinator, job } = setup(provider, { production: current });
    vi.mocked(agentTurn).mockResolvedValue({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        limitations: [],
        storyboard: validStoryboard(),
      },
    });
    await coordinator.correctRound([
      { focus: "layout", cheapEligible: true, evidence: "Fix clipped heading" },
    ]);
    expect(job.production).toMatchObject({
      audioFile: "audio/score.wav",
      fps: 60,
      displayTitle: "Existing title",
      displayDescription: "Existing description",
      limitations: [],
    });
  },
);
it("honors explicit permitted audio removal rather than treating null as omission", async () => {
  const { coordinator, job } = setup("claude", {
    production: { ...production, audioFile: "audio/score.wav" },
  });
  vi.mocked(agentTurn).mockResolvedValue({
    value: {
      correctionOutcome: fixedCorrectionOutcome,
      ...production,
      audioFile: null,
      storyboard: validStoryboard(),
    },
  });
  await coordinator.correctRound([
    { focus: "technical", cheapEligible: true, evidence: "Remove incorrect audio" },
  ]);
  expect(job.production?.audioFile).toBeNull();
});

it("accepts a focused JSON correction that omits unchanged required manifest fields", async () => {
  const { coordinator, job } = setup("claude", {
    production: { ...production, audioFile: "audio/score.wav" },
  });
  vi.mocked(agentTurn).mockResolvedValue({
    value: {
      correctionOutcome: fixedCorrectionOutcome,
      limitations: ["Repaired"],
      storyboard: validStoryboard(),
    },
  });
  await coordinator.correctRound([
    { focus: "layout", cheapEligible: true, evidence: "Fix heading" },
  ]);
  expect(job.production).toEqual({
    ...production,
    audioFile: "audio/score.wav",
    limitations: ["Repaired"],
  });
});

it.each(["claude", "codex"] as const)(
  "authorizes effect implementation repairs while preserving visual intent for %s",
  async (provider) => {
    const { coordinator } = setup(provider);
    vi.mocked(agentTurn).mockResolvedValue({
      value: {
        correctionOutcome: fixedCorrectionOutcome,
        ...production,
        storyboard: validStoryboard(),
      },
    });
    await coordinator.correctRound([
      {
        focus: "technical",
        cheapEligible: true,
        evidence: {
          message: "Repeated frames differ in the animated heading",
          sourceFile: "index.html",
          time: 0.5,
        },
      },
    ]);
    const prompt = vi.mocked(agentTurn).mock.calls[0][0].prompt;
    expect(prompt).toContain(
      "Preserve the overall visual design and timing while fixing the reported issue",
    );
    expect(prompt).toContain("not the exact implementation of the failing effect");
    expect(prompt).toContain(
      "does not by itself make the repair a redesign or require user approval",
    );
    expect(prompt).toContain(
      "Do not return the known failing implementation unchanged merely to preserve it",
    );
    expect(prompt).toContain("the application will rerun validation after the repair");
    expect(prompt).toContain("Do not guess at unrelated code or weaken comparison thresholds");
  },
);

it.each(["refused", "unresolved"] as const)(
  "escalates Haiku %s directly to Opus with its structured reason",
  async (status) => {
    const { coordinator, job } = setup();
    const outcome = {
      status,
      reason: "The effect needs a different implementation; I did not change it.",
    };
    vi.mocked(agentTurn)
      .mockResolvedValueOnce({ value: { correctionOutcome: outcome, width: 1 } })
      .mockResolvedValueOnce({
        value: {
          correctionOutcome: fixedCorrectionOutcome,
          ...production,
          storyboard: validStoryboard(),
        },
      });
    await coordinator.correctRound([
      {
        focus: "technical",
        cheapEligible: true,
        evidence: { sourceFile: "scene.html", code: "frame_mismatch" },
      },
    ]);
    expect(vi.mocked(agentTurn).mock.calls.map(([call]) => call.model)).toEqual([
      "claude-haiku-5-5",
      "claude-opus-5-5",
    ]);
    expect(vi.mocked(agentTurn).mock.calls[1][0].promptContext).toMatchObject({
      previousCorrectionOutcome: outcome,
      previousFailure: expect.stringContaining(outcome.reason),
    });
    expect(job.production?.width).toBe(1280);
    expect(job.correctionBypasses).toBeUndefined();
  },
);
it.each(["refused", "unresolved"] as const)(
  "bypasses only the same finding when both models return %s and continues other issues",
  async (status) => {
    const { coordinator, job, onEvent } = setup();
    vi.mocked(agentTurn)
      .mockResolvedValueOnce({
        value: { correctionOutcome: { status, reason: "Small model could not apply a repair." } },
      })
      .mockResolvedValueOnce({
        value: {
          correctionOutcome: { status, reason: "Main model independently declined the repair." },
        },
      })
      .mockResolvedValue({
        value: {
          correctionOutcome: fixedCorrectionOutcome,
          ...production,
          storyboard: validStoryboard(),
        },
      });
    const finding = {
      focus: "technical" as const,
      cheapEligible: true,
      evidence: { sourceFile: "first.html", code: "frame_mismatch" },
    };
    await coordinator.correctRound([
      finding,
      { ...finding, evidence: { sourceFile: "second.html", code: "other_failure" } },
    ]);
    expect(agentTurn).toHaveBeenCalledTimes(3);
    expect(job.correctionBypasses).toHaveLength(1);
    expect(job.correctionBypasses![0].decisions.map((decision) => decision.model)).toEqual([
      "claude-haiku-5-5",
      "claude-opus-5-5",
    ]);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ correctionBypass: job.correctionBypasses![0] }),
      }),
    );
    await coordinator.correctRound([finding]);
    expect(agentTurn).toHaveBeenCalledTimes(3);
  },
);
it("does not create a dual-model exception from a provider error followed by an Opus refusal", async () => {
  const { coordinator, job } = setup();
  vi.mocked(agentTurn)
    .mockRejectedValueOnce(Error("Transport failed"))
    .mockResolvedValueOnce({
      value: { correctionOutcome: { status: "refused", reason: "Insufficient evidence." } },
    });
  await expect(
    coordinator.correctRound([{ focus: "technical", cheapEligible: true, evidence: "Failure" }]),
  ).rejects.toThrow("Insufficient evidence");
  expect(agentTurn).toHaveBeenCalledTimes(2);
  expect(job.correctionBypasses).toBeUndefined();
});
