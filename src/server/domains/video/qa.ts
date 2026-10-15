import {
  type ResultReview,
  type ReviewCorrection,
} from "../../../shared/agents/schemas/result-review";
import { z } from "zod";

export type CorrectionFocus = ReviewCorrection["focus"];
export interface CorrectionFinding {
  focus: CorrectionFocus;
  evidence: unknown;
  cheapEligible: boolean;
  issue?: string;
  expectedFix?: string;
  acceptanceCriteria?: string;
}
export class VideoQaError extends Error {
  constructor(readonly findings: CorrectionFinding[]) {
    super(
      `Video QA requires ${[...new Set(findings.map((finding) => finding.focus))].join(", ")} correction`,
    );
  }
}
export class VideoQaReportError extends Error {
  constructor(readonly diagnostics: { issue: string; expectedFix: string; evidence: unknown }) {
    super(`QA report processing failed: ${diagnostics.issue}`);
  }
}

const SectionSchema = z
  .object({
    ok: z.boolean(),
    findings: z.array(z.object({ severity: z.string() }).passthrough()),
  })
  .passthrough();
export const VideoQaReportSchema = z
  .object({
    ok: z.boolean(),
    browserSkipped: z.boolean(),
    lint: SectionSchema,
    runtime: SectionSchema,
    layout: SectionSchema,
    motion: SectionSchema,
    contrast: SectionSchema,
    snapshots: z
      .object({
        files: z.array(z.string()).optional(),
        findingFiles: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function videoQaFindings(report: z.infer<typeof VideoQaReportSchema>): CorrectionFinding[] {
  const findings: CorrectionFinding[] = [];
  for (const [section, focus] of [
    ["lint", "technical"],
    ["runtime", "technical"],
    ["layout", "layout"],
    ["contrast", "contrast"],
    ["motion", "style"],
  ] as const) {
    if (!report[section].ok) {
      const errors = report[section].findings.filter((finding) => finding.severity === "error");
      // One model call per individual issue, including multiple errors in the same category.
      for (const error of errors)
        findings.push({
          focus,
          cheapEligible: focus !== "style",
          evidence: { section, findings: [error], snapshots: report.snapshots },
        });
      if (!errors.length)
        findings.push({
          focus,
          cheapEligible: focus !== "style",
          evidence: { section, findings: [], snapshots: report.snapshots },
        });
    }
  }
  if (report.browserSkipped || (!report.ok && !findings.length))
    findings.push({
      focus: "technical",
      cheapEligible: false,
      evidence: { message: "QA did not complete all required browser checks", report },
    });
  return findings;
}

export function resultReviewFindings(review?: ResultReview): CorrectionFinding[] {
  const findings: CorrectionFinding[] = (review?.corrections || []).map((finding) => ({
    ...finding,
    cheapEligible: !["pacing", "style"].includes(finding.focus),
  }));
  if (
    review?.pacingPlan === "needs_review" &&
    !findings.some((finding) => finding.focus === "pacing")
  )
    findings.push({
      focus: "pacing",
      cheapEligible: false,
      evidence:
        "The storyboard needs richer content and more balanced pacing. Rework prolonged holds and subdivide stretched scenes into meaningful timed developments, keeping the requested duration.",
    });
  if (
    review?.styleMatch === "needs_review" &&
    !findings.some((finding) => finding.focus === "style")
  )
    findings.push({
      focus: "style",
      cheapEligible: false,
      evidence:
        "The delivered appearance needs correction to match the selected style combination.",
    });
  return findings;
}
