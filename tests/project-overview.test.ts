import { expect, it } from "vitest";
import { projectOverview } from "../src/client/lib/project-overview";
import { RequestSchema, type Run, type GenerationJob } from "../src/shared/contracts";
const job = (
  id: string,
  kind: "full" | "preview",
  phase: GenerationJob["phase"],
  date: string,
): GenerationJob => ({
  id,
  runId: "project",
  model: "example-model",
  candidateId: id,
  outputType: "video",
  kind,
  phase,
  createdAt: date,
  duration: 3,
  workspace: "/tmp/example",
  video: "renders/video.mp4",
});
const project: Run = {
  id: "project",
  request: RequestSchema.parse({ instructions: "An original idea" }),
  phase: "ready",
  createdAt: "2026-01-01T00:00:00Z",
  jobs: [],
  candidates: [],
};
it("counts active work even when the run phase is settled and gives full builds priority", () => {
  const overview = projectOverview({
    ...project,
    jobs: [
      job("preview", "preview", "generating", "2026-01-02"),
      job("full", "full", "rendering", "2026-01-03"),
    ],
  });
  expect(overview.active).toBe(true);
  expect(overview.stage).toBe("Rendering result");
  expect(overview.previewCount).toBe(1);
  expect(overview.readyPreviews).toBe(0);
  expect(overview.media).toBeUndefined();
});
it("prefers the latest finished full result over a newer preview or unfinished full build", () => {
  const overview = projectOverview({
    ...project,
    jobs: [
      job("old", "full", "ready", "2026-01-02"),
      job("latest", "full", "ready", "2026-01-03"),
      job("preview", "preview", "ready", "2026-01-04"),
      job("unfinished", "full", "failed", "2026-01-05"),
    ],
  });
  expect(overview.media?.id).toBe("latest");
  expect(overview.fullResults.map((result) => result.id)).toEqual(["latest", "old"]);
  expect(overview.active).toBe(false);
  expect(overview.readyPreviews).toBe(1);
});
it("does not substitute a direction preview or unavailable media for a full result", () => {
  const overview = projectOverview({
    ...project,
    jobs: [
      job("preview", "preview", "ready", "2026-01-02"),
      { ...job("missing", "full", "ready", "2026-01-03"), video: undefined },
    ],
  });
  expect(overview.media).toBeUndefined();
  expect(projectOverview(project).media).toBeUndefined();
});
