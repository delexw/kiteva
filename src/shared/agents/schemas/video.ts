import { AssetNeedSchema } from "./asset-needs";
import { StoryboardSchema } from "./storyboard";
import { z } from "zod";
import { ContentBriefSchema } from "./content-brief";
import { CandidateCopySchema } from "./candidate-copy";
import { MAX_VIDEO_DURATION, videoDurationRange } from "../../video-duration";
export { MAX_VIDEO_DURATION } from "../../video-duration";
export const ProductionSchema = z.object({
  assetNeeds: z.array(AssetNeedSchema).max(6).optional(),
  displayTitle: CandidateCopySchema.shape.displayTitle.optional(),
  displayDescription: CandidateCopySchema.shape.displayDescription.optional(),
  pipeline: z.enum(["HyperFrames", "Remotion", "Multiplane"]),
  fallbackReason: z.string().nullable(),
  styleRenderer: z.array(z.string()).min(1),
  motionEngine: z.array(z.string()).min(1),
  sourceFile: z.string(),
  shots: z
    .array(z.object({ sourceFile: z.string(), duration: z.number().positive() }))
    .min(1)
    .max(120)
    .optional()
    .describe(
      "Multiplane only: ordered independently loadable HTML shots. Each duration is in seconds, aligned to output frames; durations sum to the full film. sourceFile is the first shot. Omit for a single shot.",
    ),
  duration: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.union([z.literal(30), z.literal(60)]).optional(),
  audioDescription: z.string(),
  audioFile: z.string().nullable().optional(),
  limitations: z.array(z.string()),
});

export const VideoGenerationOutputSchema = ProductionSchema.extend({
  storyboard: StoryboardSchema,
});
export function videoGenerationOutputSchemaForDuration(duration: number) {
  return VideoGenerationOutputSchema.extend({
    duration: z.literal(duration),
    storyboard: StoryboardSchema.safeExtend({ durationSeconds: z.literal(duration) }),
  });
}

export function videoRefinementOutputSchemaForTarget(targetDuration: number) {
  const range = videoDurationRange(targetDuration);
  const duration = z.number().finite().min(range.min).max(range.max);
  return VideoGenerationOutputSchema.extend({
    duration,
    storyboard: StoryboardSchema.safeExtend({ durationSeconds: duration }),
  }).superRefine((output, context) => {
    if (output.duration !== output.storyboard.durationSeconds)
      context.addIssue({
        code: "custom",
        path: ["storyboard", "durationSeconds"],
        message: "Storyboard duration must match the revised production",
      });
  });
}

export const BriefSchema = ContentBriefSchema.extend({
  suggestedDuration: z.number().int().min(3).max(MAX_VIDEO_DURATION),
  durationReason: z.string(),
});
export type Brief = z.infer<typeof BriefSchema>;

export type Production = z.infer<typeof ProductionSchema>;
