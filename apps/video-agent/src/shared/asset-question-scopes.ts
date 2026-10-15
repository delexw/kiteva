import { z } from "zod";
import type { Run } from "./contracts";
import { AssetNeedSchema } from "./agents/schemas/asset-needs";
import type { AssetNeed, AssetQuestion } from "./asset-requirements-policy";

const savedProposalsSchema = z.object({
  value: z.object({
    options: z.array(z.object({ assetNeeds: z.array(AssetNeedSchema).optional() })),
  }),
});

/** Recover ownership only when a legacy question exactly matches retained source data. */
export function scopedAssetQuestions(run: Run): AssetQuestion[] {
  const proposals = run.preparation?.checkpoints.proposals;
  const saved =
    proposals?.state === "completed" ? savedProposalsSchema.safeParse(proposals.output) : undefined;
  const matches = (question: AssetQuestion, needs?: AssetNeed[]) =>
    needs?.some(
      (need) =>
        need.kind === question.kind &&
        need.question === question.question &&
        need.reason === question.reason,
    );
  return (run.assetQuestions || []).flatMap((question) => {
    if (question.jobId || matches(question, run.brief?.assetNeeds)) return [question];
    const owners = run.jobs.filter(
      (job) =>
        matches(question, (job.production || job.pageProduction)?.assetNeeds) ||
        (job.kind === "preview" &&
          matches(
            question,
            run.candidates.find((candidate) => candidate.id === job.candidateId)?.assetNeeds,
          )),
    );
    if (owners.length) return owners.map((job) => ({ ...question, jobId: job.id }));
    // Old preparation pooled questions from all proposals, including rejected directions.
    if (
      saved?.success &&
      saved.data.value.options.some((option) => matches(question, option.assetNeeds))
    )
      return [];
    return [question];
  });
}
