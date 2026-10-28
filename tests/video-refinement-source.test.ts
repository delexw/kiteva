import { expect, it } from "vitest";
import { isVideoRefinementSource } from "../src/shared/video-refinement-source";
import type { GenerationJob } from "../src/shared/contracts";
const source: GenerationJob = {
  id: "version",
  runId: "project",
  candidateId: "direction",
  kind: "full",
  phase: "cancelled",
  model: "example",
  duration: 20,
  workspace: "/unused",
  sessionId: "builder",
};
it("shares eligibility between both selectors and backend workspace validation", () => {
  expect(isVideoRefinementSource(source)).toBe(true);
  expect(isVideoRefinementSource({ ...source, phase: "ready" })).toBe(true);
  for (const phase of ["queued", "generating", "rendering", "failed", "interrupted"] as const)
    expect(isVideoRefinementSource({ ...source, phase })).toBe(false);
  expect(isVideoRefinementSource({ ...source, sessionId: undefined })).toBe(false);
  expect(isVideoRefinementSource({ ...source, kind: "preview" })).toBe(false);
  expect(
    isVideoRefinementSource({
      id: "page",
      runId: "project",
      candidateId: "direction",
      kind: "full",
      phase: "ready",
      model: "example",
      workspace: "/unused",
      outputType: "page",
      sessionId: "builder",
    }),
  ).toBe(false);
});
