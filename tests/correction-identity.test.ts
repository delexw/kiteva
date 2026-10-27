import { expect, it } from "vitest";
import { correctionIdentity } from "../src/server/agents/correction-identity";
import { formatMultiplaneDiagnostic } from "../src/server/rendering/diagnostics";

function finding(file: string, report = "first.jsonl", time = 1) {
  return {
    focus: "technical",
    evidence: {
      reportFile: report,
      diagnostics: [
        formatMultiplaneDiagnostic("verify", {
          code: "nondeterministic_output",
          severity: "error",
          message: "Frame pixels differ",
          location: { file, t: time },
          details: { changedPixels: time * 100 },
        }),
      ],
    },
  };
}
it("keeps repeated failures together despite new reports, pixels and timestamps", () => {
  expect(correctionIdentity(finding("shots/01.html"))).toBe(
    correctionIdentity(finding("shots/01.html", "second.jsonl", 9)),
  );
});
it("separates the same error in different shots and distinct element issues", () => {
  expect(correctionIdentity(finding("shots/01.html"))).not.toBe(
    correctionIdentity(finding("shots/02.html")),
  );
  expect(correctionIdentity({ focus: "layout", evidence: { selector: "#first" } })).not.toBe(
    correctionIdentity({ focus: "layout", evidence: { selector: "#second" } }),
  );
});
