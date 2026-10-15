import { z } from "zod";
export const BriefAssetPlanSchema = z.object({
  coreIdea: z.string().min(1),
  scenes: z
    .array(
      z.object({
        id: z.string().min(1),
        purpose: z.string().min(1),
        assetPaths: z.array(z.string()),
        use: z.string().min(1),
        coverage: z.enum(["supported", "limited", "not_needed"]),
        limitation: z.string(),
      }),
    )
    .min(1),
  assets: z.array(
    z.object({
      path: z.string(),
      sceneIds: z.array(z.string()),
      observedContent: z.string().min(1),
      relevance: z.string().min(1),
      suitability: z.enum(["verified", "limited", "unused"]),
      plannedUse: z.string().min(1),
      limitation: z.string(),
    }),
  ),
  limitations: z.array(z.string()),
});
export type BriefAssetPlan = z.infer<typeof BriefAssetPlanSchema>;
export const BriefAssetReviewSchema = z
  .object({
    status: z.enum(["passed", "needs_repair"]),
    plan: BriefAssetPlanSchema,
    issues: z.array(
      z.object({
        sceneId: z.string(),
        assetPath: z.string(),
        issue: z.string().min(10),
        expectedFix: z.string().min(10),
        acceptanceCriteria: z.string().min(10),
      }),
    ),
  })
  .superRefine((review, context) => {
    if ((review.status === "needs_repair") !== review.issues.length > 0)
      context.addIssue({
        code: "custom",
        path: ["issues"],
        message:
          "Failed reviews need actionable findings; passed reviews must have no unresolved defects",
      });
  });
