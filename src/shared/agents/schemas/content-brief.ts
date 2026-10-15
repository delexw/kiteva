import { AssetNeedSchema } from "./asset-needs";
import { z } from "zod";
import { BriefAssetPlanSchema } from "./brief-assets";
export const ContentBriefSchema = z.object({
  assetNeeds: z.array(AssetNeedSchema).max(6).optional(),
  subject: z
    .string()
    .describe(
      "A short idea title for the project heading, ideally 4–10 words. Summarize the core idea only; never repeat the full user prompt, scene list, requirements or project settings.",
    ),
  audience: z.string(),
  objective: z.string(),
  facts: z.array(z.string()),
  exactCopy: z.array(z.string()),
  previewBeat: z.string(),
  assetDescriptions: z.array(z.string()),
  constraints: z.array(z.string()),
  assetPlan: BriefAssetPlanSchema.optional(),
});
