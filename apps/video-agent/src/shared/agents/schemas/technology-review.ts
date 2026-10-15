import { z } from "zod";
export const TechnologyReviewSchema = z.object({
  assessments: z.array(
    z.object({
      key: z.string(),
      matchingStyleIds: z.array(z.string()),
      reason: z.string().min(1),
    }),
  ),
  styles: z.array(
    z.object({
      styleId: z.string(),
      rendererKeys: z.array(z.string()).min(1).max(3),
      motionKeys: z.array(z.string()).min(1).max(3),
      supportingKeys: z.array(z.string()).max(4),
      implementation: z.string().min(1),
      rationale: z.string().min(1),
    }),
  ),
});
