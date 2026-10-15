import { expect, it } from "vitest";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { scopedAssetQuestions } from "../src/shared/asset-question-scopes";
const need = {
  kind: "reference" as const,
  cause: "tool-capability" as const,
  reason: "Offline renderer unavailable",
  question: "Use a real-time approximation?",
  fallback: "Use available rendering",
};
function project(): Run {
  return {
    id: "scope-test",
    createdAt: "now",
    phase: "ready",
    request: RequestSchema.parse({ instructions: "An original film" }),
    candidates: [],
    jobs: [],
    assetQuestions: [{ ...need, id: "legacy", state: "open" }],
    preparation: {
      fingerprint: "test",
      checkpoints: {
        proposals: {
          state: "completed",
          completedAt: "now",
          output: { value: { options: [{ assetNeeds: [need] }] } },
        },
      },
    },
  };
}
it("hides legacy questions from discarded proposals without deleting stored decisions", () => {
  const run = project();
  expect(scopedAssetQuestions(run)).toEqual([]);
  expect(run.assetQuestions).toHaveLength(1);
});
it("restores a legacy question to the exact producing job", () => {
  const run = project();
  run.jobs = [
    { id: "preview-a", kind: "preview", production: { assetNeeds: [need] } },
  ] as Run["jobs"];
  expect(scopedAssetQuestions(run)).toEqual([{ ...run.assetQuestions![0], jobId: "preview-a" }]);
  expect(run.assetQuestions![0].jobId).toBeUndefined();
});
it("preserves explicit ownership and unknown legacy project questions", () => {
  const run = project();
  run.assetQuestions![0].jobId = "full-a";
  expect(scopedAssetQuestions(run)[0].jobId).toBe("full-a");
  delete run.assetQuestions![0].jobId;
  run.preparation!.checkpoints.proposals = {
    state: "completed",
    completedAt: "now",
    output: { invalid: true },
  };
  expect(scopedAssetQuestions(run)).toEqual(run.assetQuestions);
});
