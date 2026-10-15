import { AssetNeedSchema } from "./asset-needs";
import { z } from "zod";
import { CandidateCopySchema } from "./candidate-copy";
import { MAX_SUPPORTING_STYLES } from "./style-combinations";
export const ProposalSchema = z.object({
  options: z
    .array(
      z.object({
        assetNeeds: z.array(AssetNeedSchema).max(6).optional(),
        primaryStyleId: z.string(),
        supportingStyleIds: z.array(z.string()).max(MAX_SUPPORTING_STYLES),
        sceneRoles: z.array(z.string()),
        rationale: z.string(),
        displayTitle: CandidateCopySchema.shape.displayTitle.optional(),
        displayDescription: CandidateCopySchema.shape.displayDescription.optional(),
        feasible: z.boolean(),
        missingAssets: z.array(z.string()),
      }),
    )
    .min(1)
    .max(24),
});
export type Proposal = z.infer<typeof ProposalSchema>["options"][number];
export function proposalSchemaForStyleRange(range: { min: number; max: number }) {
  return ProposalSchema.extend({
    options: z
      .array(
        ProposalSchema.shape.options.element.extend({
          ...CandidateCopySchema.shape,
          supportingStyleIds: z
            .array(z.string())
            .min(range.min - 1)
            .max(range.max - 1),
        }),
      )
      .min(1)
      .max(24),
  });
}
