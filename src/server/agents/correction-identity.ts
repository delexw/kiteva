import { z } from "zod";
import { RendererDiagnosticSchema } from "../rendering/diagnostics";
interface CorrectionIssue {
  focus: string;
  evidence: unknown;
  issue?: string;
}

const EvidenceSchema = z.object({
  diagnostics: z.array(RendererDiagnosticSchema).optional(),
  file: z.string().optional(),
  sourceFile: z.string().optional(),
  selector: z.string().optional(),
  sceneId: z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  issue: z.string().optional(),
});
const DetailsSchema = z.object({
  selector: z.string().optional(),
  reason: z.string().optional(),
  details: z.object({ reason: z.string().optional() }).optional(),
});

/** Diagnostic artifacts, attempt IDs, timestamps and pixel counts are not new issues. */
export function correctionIdentity(finding: CorrectionIssue) {
  const evidence = EvidenceSchema.safeParse(finding.evidence);
  if (evidence.success && evidence.data.diagnostics?.length) {
    const issues = evidence.data.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => {
        const details = DetailsSchema.safeParse(diagnostic.details);
        return JSON.stringify([
          diagnostic.renderer,
          diagnostic.stage,
          diagnostic.code,
          diagnostic.location.file,
          details.success ? details.data.selector : undefined,
          details.success ? details.data.reason || details.data.details?.reason : undefined,
        ]);
      });
    if (issues.length) return JSON.stringify([finding.focus, [...new Set(issues)].sort()]);
  }
  return JSON.stringify([
    finding.focus,
    evidence.success ? evidence.data.file || evidence.data.sourceFile : undefined,
    evidence.success ? evidence.data.selector || evidence.data.sceneId : undefined,
    evidence.success ? evidence.data.code : undefined,
    evidence.success ? evidence.data.issue || evidence.data.message : undefined,
    finding.issue || (typeof finding.evidence === "string" ? finding.evidence : undefined),
  ]);
}
