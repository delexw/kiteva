import { z } from "zod";

export const ReviewCorrectionSchema = z.object({
  focus: z.enum(["layout", "contrast", "technical", "pacing", "style"]),
  issue: z.string().min(10),
  expectedFix: z.string().min(10),
  acceptanceCriteria: z.string().min(10),
  evidence: z.object({
    source: z.enum(["storyboard", "finalQa", "compositionQa", "visualAssessment", "visualSamples"]),
    observation: z.string().min(10),
    timestamps: z.array(z.number().nonnegative()),
    selectors: z.array(z.string()),
  }),
});

export type ReviewCorrection = z.infer<typeof ReviewCorrectionSchema>;

// Customer results are structured facts, never free-form production notes.
export const ResultReviewSchema = z.object({
  pacingPlan: z.enum(["balanced", "needs_review", "not_verified"]).optional(),
  styleMatch: z.enum(["matched", "needs_review", "not_verified"]),
  narration: z.enum(["added", "not_added", "not_verified"]),
  sungVocals: z.enum(["added", "not_added", "not_verified"]),
  music: z.enum(["added", "not_added", "not_verified"]),
  corrections: z.array(ReviewCorrectionSchema).optional(),
});
export type ResultReview = z.infer<typeof ResultReviewSchema>;

export const VideoResultReviewSchema = ResultReviewSchema.extend({
  pacingPlan: z.enum(["balanced", "needs_review", "not_verified"]),
  corrections: z.array(ReviewCorrectionSchema),
}).superRefine((review, context) => {
  for (const [status, focus] of [
    [review.pacingPlan, "pacing"],
    [review.styleMatch, "style"],
  ] as const) {
    if (
      (status === "needs_review") !==
      review.corrections.some((finding) => finding.focus === focus)
    )
      context.addIssue({
        code: "custom",
        path: ["corrections"],
        message: `${focus} needs_review must have a specific supported correction, and other statuses must not have one`,
      });
  }
});
