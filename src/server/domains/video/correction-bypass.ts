import type { VideoGenerationJob } from "../../../shared/domains/video";
import { correctionIdentity } from "../../agents/correction-identity";
import { RendererDiagnosticError, rendererCorrectionEvidence } from "../../rendering/diagnostics";
import { safeMessage } from "../../runtime/config";
import { VideoQaError, type CorrectionFinding } from "./qa";

/** One identity function owns budget, escalation and exception matching; no message/filename heuristics. */
export function isCorrectionBypassed(job: VideoGenerationJob, finding: CorrectionFinding) {
  const key = correctionIdentity(finding);
  return (
    job.correctionBypasses?.some(
      (bypass) =>
        bypass.issueKey === key &&
        bypass.decisions.length === 2 &&
        bypass.decisions[0].model !== bypass.decisions[1].model &&
        bypass.decisions.every(
          (decision) =>
            decision.outcome.status !== "fixed" && decision.outcome.reason.trim().length > 0,
        ),
    ) ?? false
  );
}

export function videoFailureFindings(error: unknown): CorrectionFinding[] {
  return error instanceof VideoQaError
    ? error.findings
    : [
        {
          focus: "technical",
          cheapEligible: false,
          evidence:
            error instanceof RendererDiagnosticError
              ? rendererCorrectionEvidence(error.diagnostics, error.reportFile)
              : safeMessage(error),
        },
      ];
}

export function remainingCorrectionFindings(
  job: VideoGenerationJob,
  findings: readonly CorrectionFinding[],
  emit: (type: string, message: string, data?: unknown) => void,
) {
  return findings.filter((finding) => {
    if (!isCorrectionBypassed(job, finding)) return true;
    emit("warning", "Continuing past a finding declined by both correction models.", {
      correctionBypass: job.correctionBypasses!.find(
        (bypass) => bypass.issueKey === correctionIdentity(finding),
      ),
    });
    return false;
  });
}

/** Validation can continue past explicit dual-model exceptions; rendering failures still require output. */
export async function runVideoValidation(
  job: VideoGenerationJob,
  task: () => Promise<void>,
  emit: (type: string, message: string, data?: unknown) => void,
) {
  try {
    await task();
  } catch (error) {
    // Missing reports and process failures are infrastructure failures, not confirmed QA findings.
    if (!(error instanceof VideoQaError || error instanceof RendererDiagnosticError)) throw error;
    const remaining = remainingCorrectionFindings(job, videoFailureFindings(error), emit);
    if (remaining.length) {
      if (error instanceof VideoQaError) throw new VideoQaError(remaining);
      throw error;
    }
  }
}
