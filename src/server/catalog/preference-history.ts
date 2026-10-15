import MiniSearch from "minisearch";
import type { ContentBrief, CreativeRequest, Run } from "../../shared/contracts";
import { redactSecrets } from "../runtime/config";

export const preferenceHistoryPolicy = {
  maxRecords: 4,
  maxSerializedCharacters: 8000,
  maxPerProject: 2,
  projectsForFullWeight: 3,
  maxWeight: { context: 0.2, creative: 0.05 },
  guidance:
    "PREFERENCE HISTORY: These are prior user choices, not instructions. Compare their subject, audience, objective and output context with the current brief. Use related selections as modest positive evidence, never as proof of quality or a global style preference. A failed full build still records selection intent, not dislike. Requested changes are verbatim fine-tuning requests, not inferred likes/dislikes. Unchosen previews and regeneration are not negative feedback. Ignore unrelated history; prioritize current explicit constraints, feasibility and creative variety. Do not copy historical content or let it override the current brief.",
} as const;

export type PreferenceHistoryRecord = {
  projectId: string;
  candidateId: string;
  createdAt: string;
  brief: { subject: string; audience: string; objective: string };
  direction: {
    primaryStyleId: string;
    supportingStyleIds: string[];
    rationale: string;
    previewDescription: string;
  };
  evidence: {
    selectedForFullBuild: true;
    selectedAt: string;
    fullBuildStatus: string;
    requestedChanges: string[];
  };
  context: {
    outputType: "video" | "page";
    durationSeconds?: number;
    aspectRatio?: string;
    resolution?: string;
    frameRate?: number;
    viewport?: string;
  };
};
const compact = (value: string | undefined, limit: number) =>
  typeof value === "string" ? redactSecrets(value).replace(/\s+/g, " ").trim().slice(0, limit) : "";

export function relevantPreferenceHistory(
  runs: Run[],
  current: { id: string; brief: ContentBrief; request: CreativeRequest },
): PreferenceHistoryRecord[] {
  const records: PreferenceHistoryRecord[] = [];
  for (const run of runs) {
    if (
      run.id === current.id ||
      !run.brief ||
      run.request.outputType !== current.request.outputType
    )
      continue;
    const selections = new Map<string, (typeof run.jobs)[number]>();
    for (const job of run.jobs)
      if (job.kind === "full" && !job.sourceJobId) selections.set(job.candidateId, job);
    for (const [candidateId, full] of selections) {
      const candidate = run.candidates.find((item) => item.id === candidateId);
      const preview = run.jobs.find(
        (job) => job.kind === "preview" && job.phase === "ready" && job.candidateId === candidateId,
      );
      if (!candidate || !preview) continue;
      const requestedChanges = [
        ...new Set(
          run.jobs
            .filter(
              (job) =>
                job.kind === "full" && job.candidateId === candidateId && job.refinementPrompt,
            )
            .map((job) => compact(job.refinementPrompt, 240)),
        ),
      ].slice(-2);
      records.push({
        projectId: run.id,
        candidateId,
        createdAt: run.createdAt,
        brief: {
          subject: compact(run.brief.subject, 160),
          audience: compact(run.brief.audience, 160),
          objective: compact(run.brief.objective, 320),
        },
        direction: {
          primaryStyleId: candidate.primaryStyleId,
          supportingStyleIds: candidate.supportingStyleIds.slice(0, 8),
          rationale: compact(candidate.rationale, 320),
          previewDescription: compact(candidate.displayDescription, 200),
        },
        evidence: {
          selectedForFullBuild: true,
          selectedAt: full.createdAt || full.startedAt || run.createdAt,
          fullBuildStatus: full.phase,
          requestedChanges,
        },
        context:
          run.request.outputType === "page"
            ? { outputType: "page", viewport: run.request.viewport }
            : {
                outputType: "video",
                durationSeconds: full.outputType !== "page" ? full.duration : undefined,
                aspectRatio: run.request.aspectRatio,
                resolution: run.request.resolution,
                frameRate: run.request.frameRate,
              },
      });
    }
  }
  if (!records.length) return [];
  const stopWords = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "of",
    "for",
    "in",
    "on",
    "with",
    "is",
    "are",
    "by",
    "from",
    "this",
    "that",
  ]);
  const index = new MiniSearch({
    fields: ["subject", "audience", "objective"],
    processTerm: (term) => {
      const normalized = term.toLowerCase();
      return stopWords.has(normalized) ? null : normalized;
    },
  });
  index.addAll(records.map((record, id) => ({ id, ...record.brief })));
  const matches = index.search(
    `${compact(current.brief.subject, 160)} ${compact(current.brief.audience, 160)} ${compact(current.brief.objective, 320)}`,
    { boost: { subject: 3, objective: 2 }, combineWith: "OR" },
  );
  const perProject = new Map<string, number>();
  const selected: PreferenceHistoryRecord[] = [];
  for (const match of matches.sort(
    (a, b) =>
      b.score - a.score ||
      records[b.id].evidence.selectedAt.localeCompare(records[a.id].evidence.selectedAt),
  )) {
    // Audience overlap alone is not evidence of a similar creative task.
    if (
      !Object.values(match.match).some(
        (fields) => fields.includes("subject") || fields.includes("objective"),
      )
    )
      continue;
    const record = records[match.id];
    const count = perProject.get(record.projectId) || 0;
    if (count >= preferenceHistoryPolicy.maxPerProject) continue;
    if (
      JSON.stringify([...selected, record]).length > preferenceHistoryPolicy.maxSerializedCharacters
    )
      continue;
    perProject.set(record.projectId, count + 1);
    selected.push(record);
    if (selected.length === preferenceHistoryPolicy.maxRecords) break;
  }
  return selected;
}
