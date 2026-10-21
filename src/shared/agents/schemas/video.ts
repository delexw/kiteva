import { AssetNeedSchema } from "./asset-needs";
import { StoryboardSchema } from "./storyboard";
import { z } from "zod";
import { ContentBriefSchema } from "./content-brief";
import { CandidateCopySchema } from "./candidate-copy";
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

export const MAX_VIDEO_DURATION = 300;
export const BriefSchema = ContentBriefSchema.extend({
  suggestedDuration: z.number().int().min(3).max(MAX_VIDEO_DURATION),
  durationReason: z.string(),
});
export type Brief = z.infer<typeof BriefSchema>;

export type Production = z.infer<typeof ProductionSchema>;
