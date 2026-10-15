import { MAX_VIDEO_STYLE_COUNT } from "../../style-selection";
import { z } from "zod";
export const MAX_SUPPORTING_STYLES = MAX_VIDEO_STYLE_COUNT - 1;
export const StyleCombinationSchema = z.object({
  supporting_styles: z
    .array(z.object({ style_id: z.string(), role: z.string().min(1) }))
    .min(1)
    .max(MAX_SUPPORTING_STYLES),
  rationale: z.string().min(1),
  best_for: z.string().min(1),
  video_application: z.string().min(1),
  html_application: z.string().min(1),
  consistency_rules: z.array(z.string().min(1)).min(1).max(4),
  avoid: z.array(z.string().min(1)).min(1).max(3),
});
export const StyleCombinationsSchema = z.object({
  selection_guidance: z.string().min(1),
  suggestions: z.array(StyleCombinationSchema).max(3),
});
export type StyleCombinations = z.infer<typeof StyleCombinationsSchema>;
export const CombinationReviewSchema = z.object({
  styles: z.array(
    z.object({ style_id: z.string(), suggested_combinations: StyleCombinationsSchema }),
  ),
});
