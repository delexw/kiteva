import { expect, it } from "vitest";
import {
  RequestSchema,
  type Run,
  type StyleCandidate,
  type GenerationJob,
} from "../src/shared/contracts";
import {
  preferenceHistoryPolicy,
  relevantPreferenceHistory,
} from "../src/server/catalog/preference-history";
const brief = {
  subject: "Ocean conservation",
  audience: "Families",
  objective: "Explain coral reef protection",
  facts: [],
  exactCopy: [],
  previewBeat: "Coral regrows",
  assetDescriptions: [],
  constraints: [],
  suggestedDuration: 30,
  durationReason: "Short explanation",
};
const candidate: StyleCandidate = {
  id: "direction",
  primaryStyleId: "style-032",
  supportingStyleIds: ["style-105"],
  sceneRoles: ["Story"],
  rationale: "Clear illustrated coral reef",
  displayDescription: "Coral regrows under the waves",
  feasible: true,
  missingAssets: [],
  score: 90,
  confidence: 0.9,
  dimensions: {},
};
function historyRun(id = "past"): Run {
  const request = RequestSchema.parse({
    instructions: "Protect the ocean",
    duration: 30,
    aspectRatio: "16:9",
    resolution: "1440p",
    frameRate: 60,
  });
  const job = (kind: "preview" | "full"): GenerationJob => ({
    id: `${id}-${kind}`,
    runId: id,
    candidateId: candidate.id,
    kind,
    phase: "ready",
    workspace: "/tmp/private-project",
    model: "gpt-6.1-sol",
    outputType: "video",
    duration: kind === "preview" ? 3 : 30,
  });
  return {
    id,
    request,
    createdAt: "2026-10-01T00:00:00Z",
    phase: "ready",
    brief: { ...brief },
    candidates: [{ ...candidate }],
    jobs: [job("preview"), job("full")],
  };
}
const current = { id: "current", brief, request: historyRun().request };
it("derives concise positive selection evidence from full jobs without relying on winnerId", () => {
  const run = historyRun();
  run.winnerId = undefined;
  const [record] = relevantPreferenceHistory([run], current);
  expect(record).toMatchObject({
    projectId: "past",
    candidateId: "direction",
    createdAt: run.createdAt,
    brief: { subject: brief.subject, audience: brief.audience, objective: brief.objective },
    direction: {
      primaryStyleId: "style-032",
      supportingStyleIds: ["style-105"],
      rationale: candidate.rationale,
      previewDescription: candidate.displayDescription,
    },
    evidence: { selectedForFullBuild: true, fullBuildStatus: "ready", requestedChanges: [] },
    context: {
      durationSeconds: 30,
      outputType: "video",
      aspectRatio: "16:9",
      resolution: "1440p",
      frameRate: 60,
    },
  });
});
it("excludes self, other output types, unrelated tasks and mere audience overlap", () => {
  const self = historyRun("current");
  const page = historyRun("page");
  page.request = RequestSchema.parse({ instructions: "Protect the ocean", outputType: "page" });
  const unrelated = historyRun("other");
  unrelated.brief = { ...brief, subject: "Database indexing", objective: "Tune database queries" };
  expect(relevantPreferenceHistory([self, page, unrelated], current)).toEqual([]);
});
it("does not infer preference from winnerId alone, unchosen previews or failed previews", () => {
  const run = historyRun();
  run.jobs = run.jobs.filter((job) => job.kind === "preview");
  run.winnerId = candidate.id;
  expect(relevantPreferenceHistory([run], current)).toEqual([]);
  const failed = historyRun("failed-preview");
  failed.jobs[0].phase = "failed";
  expect(relevantPreferenceHistory([failed], current)).toEqual([]);
});
it("keeps selection intent when the full build fails and labels explicit fine-tune requests", () => {
  const run = historyRun();
  run.jobs[1].phase = "failed";
  run.jobs.push({
    ...run.jobs[1],
    id: "refinement",
    sourceJobId: run.jobs[1].id,
    refinementPrompt: "Use softer motion",
  });
  const result = relevantPreferenceHistory([run], current);
  expect(result).toHaveLength(1);
  expect(result[0].evidence).toEqual({
    selectedForFullBuild: true,
    selectedAt: run.createdAt,
    fullBuildStatus: "failed",
    requestedChanges: ["Use softer motion"],
  });
});
it("retains multiple chosen directions but deduplicates retries and limits each project", () => {
  const run = historyRun();
  for (const id of ["second", "third"]) {
    run.candidates.push({ ...candidate, id });
    run.jobs.push(
      { ...run.jobs[0], id: `${id}-preview`, candidateId: id },
      { ...run.jobs[1], id: `${id}-full`, candidateId: id },
    );
  }
  run.jobs.push({ ...run.jobs[1], id: "same-selection-retry" });
  const records = relevantPreferenceHistory([run], current);
  expect(records).toHaveLength(preferenceHistoryPolicy.maxPerProject);
  expect(new Set(records.map((record) => record.candidateId)).size).toBe(records.length);
});
it("bounds records and text, excludes private prompt/assets/log fields, and prefers recent ties", () => {
  const runs = Array.from({ length: 6 }, (_, i) => {
    const run = historyRun(`past-${i}`);
    run.createdAt = `2026-10-0${i + 1}T00:00:00Z`;
    run.request.instructions = "PRIVATE MAIN PROMPT";
    run.request.urls = ["https://private.example.com"];
    run.request.assetIds = ["PRIVATE ASSET"];
    run.candidates[0].rationale = "Long rationale ".repeat(1000);
    return run;
  });
  const records = relevantPreferenceHistory(runs, current);
  expect(records).toHaveLength(preferenceHistoryPolicy.maxRecords);
  expect(records[0].projectId).toBe("past-5");
  expect(records.every((record) => record.direction.rationale.length <= 320)).toBe(true);
  const serialized = JSON.stringify(records);
  expect(serialized.length).toBeLessThanOrEqual(preferenceHistoryPolicy.maxSerializedCharacters);
  expect(serialized).not.toMatch(
    /PRIVATE|private.example.com|private-project|instructions|workspace|assetIds/,
  );
});
