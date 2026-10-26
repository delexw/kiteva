import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultSummary } from "../src/client/components/result-summary";
import { ResultReviewSchema } from "../src/shared/result-review";
import { RequestSchema, type GenerationJob, type StyleCandidate } from "../src/shared/contracts";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/rendering/review-frames", () => ({ prepareReviewFrames: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { prepareReviewFrames } from "../src/server/rendering/review-frames";
import { reviewFinishedResult } from "../src/server/jobs/subworkflows/result-review";
const request = RequestSchema.parse({
  instructions: "A folded shape takes flight",
  provider: "claude",
});
const job: GenerationJob = {
  id: "job",
  runId: "run",
  candidateId: "direction",
  kind: "full",
  outputType: "video",
  phase: "rendering",
  workspace: "",
  model: "claude-opus-5-5",
  duration: 15,
};
const candidate = { primaryStyleId: "style-018" } as StyleCandidate;
const review = {
  styleMatch: "not_verified",
  narration: "not_added",
  sungVocals: "not_added",
  music: "added",
} as const;
afterEach(() => vi.resetAllMocks());
it("reviews full videos with their selected main model and explicit evidence, keeping telemetry", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "result-review-"));
  try {
    await mkdir(path.join(workspace, "renders"));
    await writeFile(
      path.join(workspace, "renders/validation.json"),
      JSON.stringify({
        verifiedAt: "2026-10-11",
        probe: { streams: [{ width: 1920, height: 1080 }] },
      }),
    );
    await writeFile(
      path.join(workspace, "STORYBOARD.json"),
      JSON.stringify({
        durationSeconds: 120,
        scenes: [{ description: "0–15s: one short headline holds throughout." }],
      }),
    );
    vi.mocked(agentTurn).mockImplementation(async (options) => {
      options.onEvent({ type: "usage", message: "Done", data: { input_tokens: 20 } });
      return { value: { ...review, pacingPlan: "not_verified", corrections: [] } };
    });
    const onEvent = vi.fn();
    expect(
      await reviewFinishedResult({
        job: { ...job, workspace },
        request,
        candidate,
        signal: new AbortController().signal,
        emit: vi.fn(),
        onEvent,
      }),
    ).toEqual({ ...review, pacingPlan: "not_verified", corrections: [] });
    expect(vi.mocked(agentTurn).mock.calls[0][0]).toMatchObject({
      model: "claude-opus-5-5",
      readOnly: true,
    });
    expect(JSON.stringify(vi.mocked(agentTurn).mock.calls[0][0].promptContext)).toContain(
      '"verifiedAt":"2026-10-11"',
    );
    expect(JSON.stringify(vi.mocked(agentTurn).mock.calls[0][0].promptContext)).toContain(
      "0–15s: one short headline holds throughout.",
    );
    expect(vi.mocked(agentTurn).mock.calls[0][0].prompt).toContain("needs_review");
    expect(vi.mocked(agentTurn).mock.calls[0][0].schema.safeParse(review).success).toBe(false);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: { input_tokens: 20, resultReview: true } }),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
it("does not add review spend to previews or discard a result when evidence is missing", async () => {
  const input = {
    job,
    request,
    candidate,
    signal: new AbortController().signal,
    emit: vi.fn(),
    onEvent: vi.fn(),
  };
  expect(
    await reviewFinishedResult({ ...input, job: { ...job, kind: "preview" } }),
  ).toBeUndefined();
  expect(await reviewFinishedResult(input)).toBeUndefined();
  expect(agentTurn).not.toHaveBeenCalled();
  expect(input.emit).toHaveBeenCalledWith("warning", expect.any(String));
});
it("shows customer facts instead of technical details and avoids unverified claims", () => {
  const html = renderToStaticMarkup(
    <ResultSummary
      job={{ ...job, phase: "ready", resultReview: review }}
      request={request}
      styleNames={["Minimalism"]}
    />,
  );
  for (const text of [
    "Minimalism",
    "No narration or sung vocals added",
    "Music added",
    "16:9",
    "Auto duration",
    "15s",
    "Claude Opus 5.5",
    "hasn’t been verified",
  ])
    expect(html).toContain(text);
  expect(html).not.toMatch(/GSAP|renderer|chroma-js|Production choices/);
  expect(
    ResultReviewSchema.safeParse({ ...review, narration: "ffmpeg audio stream" }).success,
  ).toBe(false);
  const legacy = renderToStaticMarkup(
    <ResultSummary
      job={{ ...job, phase: "ready" }}
      request={request}
      styleNames={["Minimalism"]}
    />,
  );
  expect(legacy).toContain("Audio details haven’t been verified");
  expect(legacy).not.toContain("No narration or sung vocals added");
});

it.each([
  ["claude", "claude-opus-5-5"],
  ["codex", "gpt-6.1-sol"],
  ["codex", "gpt-6-sol"],
] as const)(
  "uses %s's selected job model for review and forwards concrete pacing findings to the corrector",
  async (provider, model) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "main-model-review-"));
    try {
      await mkdir(path.join(workspace, "renders"));
      await writeFile(
        path.join(workspace, "renders/validation.json"),
        JSON.stringify({ probe: { streams: [{ codec_type: "video" }] } }),
      );
      await writeFile(
        path.join(workspace, "STORYBOARD.json"),
        JSON.stringify({
          durationSeconds: 120,
          scenes: [{ description: "0–15s: a short headline stays unchanged." }],
        }),
      );
      const correction = {
        focus: "pacing" as const,
        issue: "The short headline stays unchanged throughout 0–15s.",
        expectedFix: "Add distinct grounded developments after a brief reading hold.",
        acceptanceCriteria:
          "The storyboard documents meaningful timed developments throughout 0–15s.",
        evidence: {
          source: "storyboard" as const,
          observation: "0–15s: a short headline stays unchanged.",
          timestamps: [0, 15],
          selectors: [],
        },
      };
      vi.mocked(agentTurn).mockResolvedValue({
        value: { ...review, pacingPlan: "needs_review", corrections: [correction] },
      });
      const result = await reviewFinishedResult({
        job: { ...job, workspace, model },
        request: { ...request, provider, mainModel: "different-request-model" },
        candidate,
        signal: new AbortController().signal,
        onEvent: vi.fn(),
        emit: vi.fn(),
      });
      expect(vi.mocked(agentTurn).mock.calls[0][0]).toMatchObject({
        model,
        readOnly: true,
      });
      expect(vi.mocked(agentTurn).mock.calls[0][0].sessionId).toBeUndefined();
      const { resultReviewFindings } = await import("../src/server/domains/video/qa");
      const { correctionTask } = await import("../src/server/domains/video/corrector");
      expect(correctionTask(resultReviewFindings(result)[0])).toEqual({
        issue: correction.issue,
        expectedFix: correction.expectedFix,
        acceptanceCriteria: correction.acceptanceCriteria,
        evidence: correction.evidence,
      });
      const html = renderToStaticMarkup(
        <ResultSummary
          job={{ ...job, phase: "ready", resultReview: result }}
          request={request}
          styleNames={["Minimalism"]}
        />,
      );
      expect(html).not.toContain(correction.issue);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);

it("rejects vague or inconsistent review failures and keeps uncertainty separate from defects", async () => {
  const { VideoResultReviewSchema } = await import("../src/shared/result-review");
  expect(
    VideoResultReviewSchema.safeParse({ ...review, pacingPlan: "needs_review", corrections: [] })
      .success,
  ).toBe(false);
  expect(
    VideoResultReviewSchema.safeParse({ ...review, pacingPlan: "not_verified", corrections: [] })
      .success,
  ).toBe(true);
  expect(
    VideoResultReviewSchema.safeParse({
      ...review,
      pacingPlan: "balanced",
      styleMatch: "needs_review",
      corrections: [],
    }).success,
  ).toBe(false);
  expect(
    VideoResultReviewSchema.safeParse({
      ...review,
      pacingPlan: "needs_review",
      corrections: [
        {
          focus: "pacing",
          issue: "Bad",
          expectedFix: "Fix",
          acceptanceCriteria: "Pass",
          evidence: {},
        },
      ],
    }).success,
  ).toBe(false);
});

it("includes pacing calibration cases and explicit evidence boundaries in review guidance", async () => {
  const { videoResultReviewGuidance, videoReviewTestCases } =
    await import("../src/server/jobs/result-review-guidance");
  expect(videoReviewTestCases).toHaveLength(27);
  for (const id of ["motivated-long-reaction", "varied-content-led-rhythm"])
    expect(videoReviewTestCases.find((test) => test.id === id)).toMatchObject({
      pacingPlan: "balanced",
    });
  for (const id of ["rushed-dense-copy", "reveal-without-reading-time", "unmotivated-beat-cuts"])
    expect(videoReviewTestCases.find((test) => test.id === id)).toMatchObject({
      pacingPlan: "needs_review",
      focus: "pacing",
    });
  expect(videoResultReviewGuidance).toContain("Do not use a universal seconds threshold");
  expect(videoReviewTestCases.find((test) => test.id === "stretched-simple-reveal")).toMatchObject({
    pacingPlan: "needs_review",
    focus: "pacing",
  });
  expect(
    videoReviewTestCases.find((test) => test.id === "bounded-actions-readable-holds"),
  ).toMatchObject({ pacingPlan: "balanced" });
  expect(videoResultReviewGuidance).toContain("Read calibrationTestCases");
  expect(videoResultReviewGuidance).not.toContain(JSON.stringify(videoReviewTestCases));
  expect(videoResultReviewGuidance).toContain("Inspect every attached sample");
  expect(videoResultReviewGuidance).not.toContain("You are not seeing video frames");
  expect(videoResultReviewGuidance).toContain("Missing evidence is not a correction");
  const { visualReadabilityRules } = await import("../src/server/agents/visual-readability");
  expect(videoResultReviewGuidance).toContain(visualReadabilityRules);
  expect(videoResultReviewGuidance).toContain(
    "Do not infer unreadability without rendered evidence",
  );
  expect(videoResultReviewGuidance).toContain(
    "completed visualAssessment documenting clipped required footage content",
  );
  expect(videoResultReviewGuidance).toContain(
    "Do not infer clipping from a filename, intended zoom or missing visual assessment",
  );
});

it("shares footage framing safeguards across production, capture and final review", async () => {
  const { capturedFootageFramingRules, fullVideoQualityRules } =
    await import("../src/server/domains/video/full-video-quality");
  const { websiteCaptureInstructions } =
    await import("../src/server/agents/capabilities/reference-browser/prompt");
  const { videoResultReviewGuidance } = await import("../src/server/jobs/result-review-guidance");
  for (const guidance of [
    fullVideoQualityRules,
    websiteCaptureInstructions,
    videoResultReviewGuidance,
  ])
    expect(guidance).toContain(capturedFootageFramingRules);
});

it("keeps the strict nested structured-output schema", async () => {
  const { z } = await import("zod");
  const { VideoResultReviewSchema } = await import("../src/shared/result-review");
  const schema = z.toJSONSchema(VideoResultReviewSchema, { target: "draft-7" });
  const evidence = (
    schema.properties!.corrections as {
      items: { properties: { evidence: { required: string[] } } };
    }
  ).items.properties.evidence;
  expect(evidence.required).toEqual(["source", "observation", "timestamps", "selectors"]);
});

it.each(["unavailable source", "outside duration"])(
  "rejects invented review evidence: %s",
  async (kind) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "review-evidence-"));
    try {
      await mkdir(path.join(workspace, "renders"));
      await writeFile(path.join(workspace, "renders/validation.json"), "{}");
      await writeFile(
        path.join(workspace, "STORYBOARD.json"),
        JSON.stringify({
          durationSeconds: 120,
          scenes: [{ description: "0–15s: unchanged headline." }],
        }),
      );
      vi.mocked(agentTurn).mockResolvedValue({
        value: {
          ...review,
          pacingPlan: "needs_review",
          corrections: [
            {
              focus: "pacing",
              issue: "The headline holds for too long.",
              expectedFix: "Add substantive timed content after the headline.",
              acceptanceCriteria: "Meaningful content fills the selected duration.",
              evidence: {
                source: kind === "unavailable source" ? "visualAssessment" : "storyboard",
                observation: "The headline remains unchanged throughout.",
                timestamps: kind === "outside duration" ? [100] : [],
                selectors: [],
              },
            },
          ],
        },
      });
      const onEvent = vi.fn();
      expect(
        await reviewFinishedResult({
          job: { ...job, workspace },
          request,
          candidate,
          signal: new AbortController().signal,
          onEvent,
          emit: vi.fn(),
        }),
      ).toBeUndefined();
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "review_diagnostic",
          data: expect.objectContaining({ audience: "internal", model: "claude-opus-5-5" }),
        }),
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);

it("leaves review effort at the provider default and removes duplicate production metadata while preserving actionable QA evidence", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "review-compact-"));
  try {
    await mkdir(path.join(workspace, "renders"));
    await writeFile(
      path.join(workspace, "renders/validation.json"),
      JSON.stringify({
        verifiedAt: "verified-date",
        probe: { streams: [{ codec_type: "video" }] },
        production: { styleRenderer: ["unneeded-renderer-details"] },
      }),
    );
    await writeFile(
      path.join(workspace, "renders/qa-report.json"),
      JSON.stringify({
        ok: false,
        browserSkipped: false,
        layout: {
          ok: false,
          findings: [
            { severity: "error", message: "Clipped text", selector: "#label", time: 4 },
            { severity: "warning", message: "Advisory-only metadata" },
          ],
        },
      }),
    );
    await writeFile(
      path.join(workspace, "STORYBOARD.json"),
      JSON.stringify({
        durationSeconds: 120,
        scenes: [{ description: "0–15s: explicit meaningful scene developments." }],
      }),
    );
    vi.mocked(agentTurn).mockResolvedValue({
      value: { ...review, pacingPlan: "not_verified", corrections: [] },
    });
    await reviewFinishedResult({
      job: { ...job, workspace },
      request,
      candidate,
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      emit: vi.fn(),
    });
    const call = vi.mocked(agentTurn).mock.calls[0][0];
    expect(call).not.toHaveProperty("reasoningEffort");
    expect(JSON.stringify(call.promptContext)).toContain("Clipped text");
    expect(JSON.stringify(call.promptContext)).toContain('"selector":"#label"');
    expect(JSON.stringify(call.promptContext)).toContain("verified-date");
    expect(JSON.stringify(call.promptContext)).not.toContain("unneeded-renderer-details");
    expect(JSON.stringify(call.promptContext)).not.toContain("Advisory-only metadata");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it.each([false, true])(
  "attaches final-export samples and validates visual evidence timestamps (invented=%s)",
  async (invented) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "visual-result-review-"));
    try {
      await mkdir(path.join(workspace, "renders"));
      const filename = path.join(workspace, "renders/full.mp4");
      await writeFile(
        path.join(workspace, "renders/validation.json"),
        JSON.stringify({
          probe: { format: { filename, duration: "15" }, streams: [{ codec_type: "video" }] },
        }),
      );
      const frames = [{ timestamp: 0.5, path: path.join(workspace, "sample.png") }];
      vi.mocked(prepareReviewFrames).mockResolvedValue(frames);
      const value = {
        ...review,
        styleMatch: "needs_review",
        pacingPlan: "not_verified",
        corrections: [
          {
            focus: "style",
            issue: "The focal artwork lacks the required layered construction.",
            expectedFix: "Restore the documented structural detail and depth in the opening.",
            acceptanceCriteria:
              "The sampled opening shows layered forms and readable shadow masses.",
            evidence: {
              source: "visualSamples",
              observation:
                "The attached frame shows one flat silhouette without the required layered structure.",
              timestamps: [invented ? 2 : 0.5],
              selectors: [],
            },
          },
        ],
      };
      vi.mocked(agentTurn).mockResolvedValue({ value });
      const onEvent = vi.fn();
      const result = await reviewFinishedResult({
        job: { ...job, workspace },
        request,
        candidate,
        signal: new AbortController().signal,
        emit: vi.fn(),
        onEvent,
      });
      expect(vi.mocked(agentTurn).mock.calls[0][0]).toMatchObject({
        images: [frames[0].path],
        readOnly: true,
        model: job.model,
        promptContext: { visualSamples: frames },
      });
      if (invented) {
        expect(result).toBeUndefined();
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining("without an attached visual sample"),
          }),
        );
      } else expect(result).toEqual(value);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);

it("retains the technical review and reports a limitation when visual extraction fails", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "visual-review-failure-"));
  try {
    await mkdir(path.join(workspace, "renders"));
    await writeFile(
      path.join(workspace, "renders/validation.json"),
      JSON.stringify({ probe: { format: { filename: "renders/full.mp4", duration: "15" } } }),
    );
    vi.mocked(prepareReviewFrames).mockRejectedValue(Error("Frame decode failed"));
    vi.mocked(agentTurn).mockResolvedValue({
      value: { ...review, pacingPlan: "not_verified", corrections: [] },
    });
    await reviewFinishedResult({
      job: { ...job, workspace },
      request,
      candidate,
      signal: new AbortController().signal,
      emit: vi.fn(),
      onEvent: vi.fn(),
    });
    expect(vi.mocked(agentTurn).mock.calls[0][0]).toMatchObject({
      images: undefined,
      promptContext: { visualSamplingLimitation: "Frame decode failed" },
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
