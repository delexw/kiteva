import type { GenerationJob, Run } from "./contracts";
import type { VideoRefinementInstruction } from "./domains/video";

/** Job order is submission order; cancelled work still represents submitted user instructions. */
export function previousRefinementInstructions(
  jobs: GenerationJob[],
  candidateId: string,
  discardedIds: readonly string[] = [],
) {
  const history = new Map<string, VideoRefinementInstruction>();
  for (const job of jobs) {
    if (job.outputType === "page" || job.kind !== "full" || job.candidateId !== candidateId)
      continue;
    for (const entry of job.refinementHistory || []) history.set(entry.jobId, entry);
    if (job.refinementPrompt?.trim())
      history.set(job.id, {
        jobId: job.id,
        prompt: job.refinementPrompt,
        ...(job.createdAt ? { createdAt: job.createdAt } : {}),
        ...(job.refinementAssetIds?.length ? { assetIds: job.refinementAssetIds } : {}),
      });
  }
  const discarded = new Set(discardedIds);
  return [...history.values()].filter((entry) => !discarded.has(entry.jobId));
}

/** Only requests from surviving versions can be selected for a new refinement. */
export function availableRefinementInstructions(run: Run, candidateId: string) {
  return previousRefinementInstructions(
    run.jobs,
    candidateId,
    (run.deletedVersions || []).map((version) => version.id),
  );
}
