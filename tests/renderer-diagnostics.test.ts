import { expect, it } from "vitest";
import {
  formatHyperframesDiagnostic,
  formatMultiplaneDiagnostic,
  RendererDiagnosticSchema,
  rendererCorrectionEvidence,
} from "../src/server/rendering/diagnostics";
import { multiplaneFailure, multiplaneDiagnostics } from "../src/server/rendering/multiplane";
import { correctionTask } from "../src/server/domains/video/corrector";

it("maps each renderer into the same schema while preserving native evidence", () => {
  const hyper = formatHyperframesDiagnostic("layout", {
    severity: "error",
    code: "content_overlap",
    message: "Text overlaps",
    fixHint: "Separate labels",
    sourceFile: "index.html",
    line: 12,
    selector: "#label",
    time: 1.5,
    bbox: { x: 10 },
  });
  const multi = formatMultiplaneDiagnostic("inspect", {
    severity: "warning",
    code: "timer_driven",
    message: "Uses timer",
    hint: "Use render(t)",
    location: { file: "vendor/gsap.min.js", line: 10, column: 100 },
    details: { snippet: "setTimeout()" },
  });
  expect(RendererDiagnosticSchema.safeParse(hyper).success).toBe(true);
  expect(RendererDiagnosticSchema.safeParse(multi).success).toBe(true);
  expect(Object.keys(hyper)).toEqual(Object.keys(multi));
  expect(hyper).toMatchObject({
    hint: "Separate labels",
    source: "authored source",
    location: { file: "index.html", line: 12 },
    details: { selector: "#label", time: 1.5, bbox: { x: 10 } },
  });
  expect(multi).toMatchObject({
    source: "bundled dependency",
    location: { column: 100 },
    severity: "warning",
  });
});

it("passes normalized Multiplane diagnostics through to the correction task", () => {
  const native = {
    type: "finding",
    code: "wall_clock",
    severity: "error",
    message: "Uses wall clock",
    location: { file: "shot.html", line: 8 },
  };
  const error = multiplaneFailure(
    "verify",
    { type: "result", ok: false },
    multiplaneDiagnostics(JSON.stringify(native)),
    "report.jsonl",
  );
  expect("diagnostics" in error).toBe(true);
  if (!("diagnostics" in error)) throw Error("Missing diagnostics");
  const evidence = rendererCorrectionEvidence(
    error.diagnostics as ReturnType<typeof formatMultiplaneDiagnostic>[],
    "report.jsonl",
  );
  expect(correctionTask({ focus: "technical", cheapEligible: false, evidence }).evidence).toEqual(
    evidence,
  );
  expect(evidence.diagnostics[0]).toMatchObject({
    renderer: "multiplane",
    stage: "verify",
    code: "wall_clock",
  });
});

it("limits prompt evidence and points to the complete report", () => {
  const finding = formatHyperframesDiagnostic("runtime", { severity: "error", message: "Failure" });
  const evidence = rendererCorrectionEvidence(Array(1000).fill(finding), "renders/report.json");
  expect(evidence.omittedFindings).toBeGreaterThan(0);
  expect(evidence.diagnostics.length + evidence.omittedFindings).toBe(1000);
  expect(JSON.stringify(evidence).length).toBeLessThan(25000);
  expect(evidence.reportFile).toBe("renders/report.json");
});

it("preserves verification findings with frame locations and comparison images", () => {
  const native = {
    type: "finding",
    code: "nondeterministic_output",
    severity: "error",
    message: "Frame pixels differ.",
    hint: "Make render(t) depend only on t and seeded inputs.",
    location: { t: 1.5, frame: 90 },
    details: {
      check: "reorder",
      changedPixels: 439,
      maxChannelDiff: 51,
      images: {
        reference: "verify/reference.png",
        actual: "verify/actual.png",
        diff: "verify/diff.png",
      },
    },
  };
  const failure = multiplaneFailure(
    "verify",
    { type: "result", ok: false },
    multiplaneDiagnostics(JSON.stringify(native)),
  );
  expect(failure).toHaveProperty("diagnostics");
  if (!("diagnostics" in failure)) throw Error("Missing diagnostics");
  expect(failure.diagnostics).toMatchObject([
    {
      renderer: "multiplane",
      stage: "verify",
      code: "nondeterministic_output",
      source: "unknown",
      details: { location: { t: 1.5, frame: 90 }, details: native.details },
    },
  ]);
});
