import { jobVersions } from "../../shared/job-versions";
import { z } from "zod";
import type { AgentProgressEvent, Run } from "../../shared/contracts";
import type { ModelActivity } from "../../shared/governance";
import { candidateDisplayTitle } from "../../shared/candidate-copy";

const stateSchema = z.object({
  state: z.object({
    shot: z.string().optional(),
    changeBrief: z
      .object({
        summary: z.string().optional(),
        renderImpact: z.string().optional(),
        uncertain: z.boolean().optional(),
      })
      .optional(),
  }),
});
const probability = z.number().finite().min(0).max(1);
const decisionSchema = z.object({
  questionKey: z.literal("cache"),
  answer: z.object({
    choice: z.enum(["reuse", "refresh"]),
    confidence: probability.nullish(),
    probabilities: z
      .object({ reuse: probability.nullish(), refresh: probability.nullish() })
      .optional(),
  }),
});

/** Reconstruct recorded reviews, including historical calls, without executing any model. */
export function renderCacheReviewDetails(run: Run, events: AgentProgressEvent[]) {
  const reviews = new Map<string, NonNullable<ModelActivity["renderCacheReviews"]>[number]>();
  for (const event of events) {
    const data = event.data as
      | {
          purpose?: string;
          invocationId?: string;
          prompt?: { user?: string };
          decision?: unknown;
        }
      | undefined;
    if (
      data?.purpose !== "Render cache review" ||
      !data.invocationId ||
      !["invocation", "usage"].includes(event.type)
    )
      continue;
    let review = reviews.get(data.invocationId);
    if (!review) {
      review = {
        id: data.invocationId,
        time: event.time,
        shot: null,
        choice: null,
        confidence: null,
        probabilities: { reuse: null, refresh: null },
        promptUrl: `/api/admin/governance/${encodeURIComponent(run.id)}/prompts/${encodeURIComponent(data.invocationId)}`,
      };
      reviews.set(data.invocationId, review);
    }
    if (event.type === "invocation") {
      review.time = event.time;
      review.jobId = event.jobId;
      const job = run.jobs.find((job) => job.id === event.jobId);
      if (job) {
        const candidate = run.candidates.find((candidate) => candidate.id === job.candidateId);
        review.direction = candidateDisplayTitle(
          candidate,
          candidate ? run.candidates.indexOf(candidate) + 1 : undefined,
        );
        review.version = job.kind === "full" ? jobVersions(run.jobs).get(job.id) : 1;
      }
      if (data.prompt?.user) {
        let payload: unknown;
        try {
          payload = JSON.parse(data.prompt.user);
        } catch {
          payload = null;
        }
        const parsed = stateSchema.safeParse(payload);
        if (parsed.success) {
          review.shot = parsed.data.state.shot ?? null;
          Object.assign(review, parsed.data.state.changeBrief);
        }
      }
    } else {
      const parsed = decisionSchema.safeParse(data.decision);
      if (parsed.success) {
        review.choice = parsed.data.answer.choice;
        review.confidence = parsed.data.answer.confidence ?? null;
        review.probabilities = {
          reuse: parsed.data.answer.probabilities?.reuse ?? null,
          refresh: parsed.data.answer.probabilities?.refresh ?? null,
        };
      }
    }
  }
  return reviews;
}
