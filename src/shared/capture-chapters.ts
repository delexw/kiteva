import { z } from "zod";

export const captureChapterRetryLimit = 10;

export const captureChapterDirectory = "capture-chapters";

const text = z.string().trim().min(1);
export const CaptureChapterSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: text,
  purpose: text,
  startingState: text,
  actions: z.array(text).min(1),
  expectedResults: z.array(text).min(1),
  nextChapterContext: text,
  estimatedDurationSeconds: z.number().finite().positive(),
});
export const CaptureChapterPlanSchema = z
  .object({
    scope: text,
    story: text,
    chapters: z.array(CaptureChapterSchema).min(1),
  })
  .superRefine((plan, context) => {
    if (new Set(plan.chapters.map((chapter) => chapter.id)).size !== plan.chapters.length)
      context.addIssue({
        code: "custom",
        path: ["chapters"],
        message: "Chapter IDs must be unique",
      });
  });
export type CaptureChapter = z.infer<typeof CaptureChapterSchema>;
export type CaptureChapterPlan = z.infer<typeof CaptureChapterPlanSchema>;

/** Measured completed chapters, never an estimate of model or recording progress. */
export const CaptureChapterProgressSchema = z
  .object({
    completed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    index: z.number().int().positive(),
    chapterId: z.string().min(1),
    title: text,
    status: z.enum(["running", "complete", "failed", "stopped"]),
  })
  .refine(
    (progress) => progress.completed <= progress.total && progress.index <= progress.total,
    "Chapter progress must fit the plan",
  );
export type CaptureChapterProgress = z.infer<typeof CaptureChapterProgressSchema>;

export const CaptureChapterTimingSchema = z.object({
  chapterId: text,
  title: text,
  index: z.number().int().positive(),
  total: z.number().int().positive(),
  phase: z.enum([
    "recording",
    "speed",
    "review",
    "validation",
    "accepted",
    "conflict",
    "replanning",
    "revised",
    "retry",
  ]),
  status: z.enum(["running", "complete", "failed", "stopped"]),
  targetDurationSeconds: z.number().finite().positive(),
  actualDurationSeconds: z.number().finite().positive().optional(),
  revision: z.number().int().min(1).max(captureChapterRetryLimit).optional(),
});
export type CaptureChapterTiming = z.infer<typeof CaptureChapterTimingSchema>;
