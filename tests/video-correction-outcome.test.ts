import { expect, it } from "vitest";
import { videoCorrectionOutputSchemaForDuration } from "../src/shared/agents/schemas/video-correction";
import { correctionIdentity } from "../src/server/agents/correction-identity";
import {
  isCorrectionBypassed,
  remainingCorrectionFindings,
  runVideoValidation,
} from "../src/server/domains/video/correction-bypass";
import { VideoQaError, type CorrectionFinding } from "../src/server/domains/video/qa";
import type { VideoGenerationJob } from "../src/shared/domains/video";

const finding: CorrectionFinding = {
  focus: "technical",
  cheapEligible: true,
  evidence: { sourceFile: "scene.html", code: "frame_mismatch" },
};
const job = (): VideoGenerationJob => ({
  id: "job",
  runId: "project",
  candidateId: "direction",
  kind: "full",
  duration: 3,
  phase: "validating",
  workspace: "/unused",
  model: "claude-opus-5-5",
  correctionBypasses: [
    {
      issueKey: correctionIdentity(finding),
      decisions: [
        { model: "small", outcome: { status: "unresolved", reason: "Cannot establish a fix." } },
        { model: "main", outcome: { status: "refused", reason: "No justified change." } },
      ],
    },
  ],
});
it("requires an explicit status and nonblank reason without requiring a manifest on refusal", () => {
  const schema = videoCorrectionOutputSchemaForDuration(3);
  expect(
    schema.safeParse({ correctionOutcome: { status: "unresolved", reason: "Missing evidence." } })
      .success,
  ).toBe(true);
  expect(schema.safeParse({}).success).toBe(false);
  expect(schema.safeParse({ correctionOutcome: { status: "fixed", reason: " " } }).success).toBe(
    false,
  );
});
it("matches one finding identity and requires two distinct non-repair decisions", () => {
  const value = job();
  expect(isCorrectionBypassed(value, finding)).toBe(true);
  expect(
    isCorrectionBypassed(value, {
      ...finding,
      evidence: { sourceFile: "other.html", code: "frame_mismatch" },
    }),
  ).toBe(false);
  value.correctionBypasses![0].decisions[1].model = "small";
  expect(isCorrectionBypassed(value, finding)).toBe(false);
  value.correctionBypasses![0].decisions[1].model = "main";
  value.correctionBypasses![0].decisions[1].outcome.status = "fixed";
  expect(isCorrectionBypassed(value, finding)).toBe(false);
});
it("continues a waived check but preserves other findings, infrastructure errors and cancellation", async () => {
  const value = job(),
    events: unknown[] = [];
  const emit = (...args: unknown[]) => {
    events.push(args);
  };
  await expect(
    runVideoValidation(
      value,
      async () => {
        throw new VideoQaError([finding]);
      },
      emit,
    ),
  ).resolves.toBeUndefined();
  expect(events).toHaveLength(1);
  const other = { ...finding, evidence: "Unrelated failure" };
  expect(remainingCorrectionFindings(value, [finding, other], emit)).toEqual([other]);
  await expect(
    runVideoValidation(
      value,
      async () => {
        throw new VideoQaError([finding, other]);
      },
      emit,
    ),
  ).rejects.toMatchObject({ findings: [other] });
  await expect(
    runVideoValidation(
      value,
      async () => {
        throw Error("Missing report");
      },
      emit,
    ),
  ).rejects.toThrow("Missing report");
  await expect(
    runVideoValidation(
      value,
      async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
      emit,
    ),
  ).rejects.toThrow("Cancelled");
});
