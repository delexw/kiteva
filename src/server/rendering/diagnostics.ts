import { z } from "zod";

export const RendererDiagnosticSchema = z.object({
  renderer: z.enum(["hyperframes", "multiplane"]),
  stage: z.string(),
  code: z.string(),
  severity: z.string(),
  message: z.string(),
  hint: z.string().nullable(),
  location: z.object({
    file: z.string().nullable(),
    line: z.number().nullable(),
    column: z.number().nullable(),
  }),
  source: z.enum(["bundled dependency", "authored source", "unknown"]),
  details: z.record(z.string(), z.unknown()),
});
export type RendererDiagnostic = z.infer<typeof RendererDiagnosticSchema>;
const NativeFindingSchema = z
  .object({
    code: z.string().optional(),
    severity: z.string(),
    message: z.string().optional(),
    hint: z.string().nullable().optional(),
    fixHint: z.string().optional(),
    sourceFile: z.string().optional(),
    line: z.number().optional(),
    column: z.number().optional(),
    location: z
      .object({
        file: z.string().optional(),
        line: z.number().optional(),
        column: z.number().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();
function formatFinding(
  renderer: RendererDiagnostic["renderer"],
  stage: string,
  input: unknown,
): RendererDiagnostic {
  const finding = NativeFindingSchema.parse(input);
  const file = finding.location?.file ?? finding.sourceFile ?? null;
  return RendererDiagnosticSchema.parse({
    renderer,
    stage,
    code: finding.code ?? "check_failed",
    severity: finding.severity,
    message: finding.message ?? `${stage} check failed`,
    hint: finding.hint ?? finding.fixHint ?? null,
    location: {
      file,
      line: finding.location?.line ?? finding.line ?? null,
      column: finding.location?.column ?? finding.column ?? null,
    },
    source: file
      ? /(^|[\\/])(vendor|node_modules)[\\/]/.test(file)
        ? "bundled dependency"
        : "authored source"
      : "unknown",
    details: finding,
  });
}
export function formatHyperframesDiagnostic(stage: string, finding: unknown) {
  return formatFinding("hyperframes", stage, finding);
}
export function formatMultiplaneDiagnostic(stage: string, finding: unknown) {
  return formatFinding("multiplane", stage, finding);
}
export function rendererCorrectionEvidence(diagnostics: RendererDiagnostic[], reportFile?: string) {
  const included: RendererDiagnostic[] = [];
  let size = 0;
  for (const diagnostic of diagnostics) {
    const length = JSON.stringify(diagnostic).length;
    if (size + length > 24000) break;
    included.push(diagnostic);
    size += length;
  }
  return {
    diagnostics: included,
    reportFile,
    omittedFindings: diagnostics.length - included.length,
  };
}
export class RendererDiagnosticError extends Error {
  constructor(
    message: string,
    readonly diagnostics: RendererDiagnostic[],
    readonly reportFile?: string,
  ) {
    super(message);
  }
}
