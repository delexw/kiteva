import { z } from "zod";
export const StyleSummarySchema = z.object({
  styleId: z.string(),
  name: z.string(),
  visualIdentity: z.string(),
  decisionGuidance: z.string().min(1).optional(),
  suitableUses: z.string(),
  limitations: z.string(),
  palette: z.string(),
  motionAndInteraction: z.string(),
  audio: z.string(),
  assetRequirements: z.string(),
  combinations: z.string(),
  productionApproach: z.string(),
});
export type StyleSummary = z.infer<typeof StyleSummarySchema>;
