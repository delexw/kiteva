import { z } from "zod";
import { assetNeedCauses, assetRequirementKinds } from "../../asset-requirements-policy";
export const AssetNeedSchema = z.object({
  mode: z
    .enum(["optional", "blocking"])
    .default("blocking")
    .describe(
      "Use blocking for every question: wait for an explicit answer before continuing. Legacy optional values are accepted for compatibility but also pause work. Missing optional uploads never justify asking.",
    ),
  kind: z.enum(assetRequirementKinds),
  cause: z
    .enum(assetNeedCauses)
    .optional()
    .describe(
      "Only report an actual inability of the model and available tools to fulfil the requirement, or inaccessible supplied URL. Missing optional uploads or fidelity improvements are not capability failures.",
    ),
  reason: z.string().min(1).max(400),
  question: z.string().min(1).max(300),
  fallback: z.string().min(1).max(400),
});
export const AssetQuestionAnswerSchema = z.object({
  answer: z.string().trim().max(2000).default(""),
  assetIds: z.array(z.string().uuid()).max(20).default([]),
});
