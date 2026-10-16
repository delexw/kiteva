import { validStoryboard } from "./fixtures/storyboard";
import { type Production } from "../src/shared/agents/schemas/video";
import { beforeEach, expect, it, vi } from "vitest";
import {
  VideoCorrectionCoordinator,
  videoCorrectionPolicy,
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
it("allows five GPT-6.1 full-video repair rounds, charges once per round and reuses the build session", async () => {
  const { coordinator, job } = setup("codex", { kind: "full", model: "gpt-6.1-sol" });
  vi.mocked(agentTurn).mockResolvedValue({
    value: { ...production, storyboard: validStoryboard() },
    sessionId: "generation-session",
  });
  const findings = [
    { focus: "style" as const, cheapEligible: false, evidence: "Style needs repair" },
    { focus: "pacing" as const, cheapEligible: false, evidence: "Pacing needs repair" },
  ];
  for (let round = 0; round < videoCorrectionPolicy.gpt61Full.main; round++)
    await coordinator.correctRound(findings);
  expect(agentTurn).toHaveBeenCalledTimes(10);
  for (const [call] of vi.mocked(agentTurn).mock.calls) {
    expect(call).toMatchObject({ model: "gpt-6.1-sol", sessionId: "generation-session" });
    expect(call.prompt).toContain("rerun checks only after every issue in this round");
    expect(call.prompt).toContain("GPT-6.1 VIDEO PRODUCTION PRINCIPLES");
  }
  await expect(coordinator.correctRound(findings)).rejects.toThrow("round limit");
  expect(agentTurn).toHaveBeenCalledTimes(10);
  expect(job.sessionId).toBe("generation-session");
});
it.each([
  ["codex", "preview", "gpt-6.1-sol"],
  ["codex", "full", "gpt-6-astra"],
  ["claude", "full", "claude-opus-5-5"],
] as const)("preserves the two main-round limit for %s %s %s", async (provider, kind, model) => {
  const { coordinator } = setup(provider, { kind, model });
  vi.mocked(agentTurn).mockResolvedValue({
    value: { ...production, storyboard: validStoryboard() },
    sessionId: "generation-session",
  });
  const findings = [{ focus: "style" as const, cheapEligible: false, evidence: "Repair style" }];
  await coordinator.correctRound(findings);
  await coordinator.correctRound(findings);
  await expect(coordinator.correctRound(findings)).rejects.toThrow("round limit");
  expect(agentTurn).toHaveBeenCalledTimes(2);
});
it.each([
  ["claude", "claude-haiku-5-5"],
  ["codex", "gpt-6-luna"],
] as const)(
  "reuses a separate %s cheap session and escalates to the original main session",
  async (provider, model) => {
    const { job, coordinator } = setup(provider);
    vi.mocked(agentTurn).mockResolvedValue({
      value: { ...production, storyboard: validStoryboard() },
      sessionId: "cheap-session",
    });
    const finding = {
      focus: "layout" as const,
      cheapEligible: true,
      evidence: { selector: "#label", times: [1.5] },
    };
    for (let round = 0; round < 20; round++) await coordinator.correctRound([finding]);
    vi.mocked(agentTurn).mockResolvedValue({
      value: { ...production, storyboard: validStoryboard() },
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
    const { coordinator } = setup();
    vi.mocked(agentTurn).mockResolvedValue({
      value: { ...production, storyboard: validStoryboard() },
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
it("keeps the cheap session when it announces one before a failed turn and records focus metadata", async () => {
  const { coordinator, job, onEvent } = setup();
  vi.mocked(agentTurn)
    .mockImplementationOnce(async (options) => {
      options.onEvent({ type: "session", message: "Opened", data: { sessionId: "partial-cheap" } });
      throw Error("Interrupted turn");
    })
    .mockResolvedValueOnce({
      value: { ...production, storyboard: validStoryboard() },
      sessionId: "partial-cheap",
    });
  await expect(
    coordinator.correctRound([
      { focus: "contrast", cheapEligible: true, evidence: { contrast: 2 } },
    ]),
  ).rejects.toThrow("Interrupted turn");
  await coordinator.correctRound([
    { focus: "contrast", cheapEligible: true, evidence: { contrast: 2 } },
  ]);
  expect(vi.mocked(agentTurn).mock.calls[1][0].sessionId).toBe("partial-cheap");
  expect(job.sessionId).toBe("generation-session");
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
  expect(agentTurn).toHaveBeenCalledTimes(1);
  controller.abort();
  await expect(
    coordinator.correctRound([{ focus: "layout", cheapEligible: true, evidence: {} }]),
  ).rejects.toThrow();
  expect(agentTurn).toHaveBeenCalledTimes(1);
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

it("rejects a repair that changes selected settings without another call for the same issue", async () => {
  const { coordinator, job } = setup();
  vi.mocked(agentTurn).mockResolvedValue({
    value: { ...production, duration: 5 },
    sessionId: "cheap-session",
  });
  await expect(
    coordinator.correctRound([
      { focus: "layout", cheapEligible: true, evidence: { selector: "#label" } },
    ]),
  ).rejects.toThrow("Corrector changed");
  expect(job.production?.duration).toBe(3);
  expect(agentTurn).toHaveBeenCalledTimes(1);
});

it.each(["claude", "codex"] as const)(
  "fixes multiple issues sequentially in the same %s session with the latest manifest",
  async (provider) => {
    const { coordinator, job } = setup(provider);
    const first = { ...production, limitations: ["First issue fixed"] };
    vi.mocked(agentTurn)
      .mockResolvedValueOnce({
        value: { ...first, storyboard: validStoryboard() },
        sessionId: "round-session",
      })
      .mockResolvedValueOnce({
        value: { ...production, storyboard: validStoryboard() },
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
      value: { ...production, storyboard: validStoryboard() },
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
