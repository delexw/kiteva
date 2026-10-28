import { LanguageTracksSchema, type LanguageMedia } from "../language-tracks";
import { normalizeSubtitleFields } from "../subtitle-compatibility";
import { ScriptItemsSchema, scriptItemsProblem } from "../script-items";
import type { VideoBuildPlan } from "../agents/schemas/video-build-plan";
import { validateStyleSelection } from "../style-selection";
import { z } from "zod";
import { VideoLanguageSchema, VideoTranslationsSchema } from "../video-language";
import { SharedRequestSchema } from "./common";
import { videoRendererIds } from "../video-renderers";
import { SpeechSettingsSchema, type SpeechTrack } from "../speech";
import type { JobState } from "./common";
import { assetLimits } from "../asset-limits";
export const VideoRefinementRequestSchema = z.object({
  jobId: z.string(),
  discardedRefinementJobIds: z.array(z.string().min(1)).max(200).optional(),
  prompt: z.string().trim().min(1).max(6000),
  assetIds: z.array(z.string().uuid()).max(assetLimits.images.count).default([]),
});
export { MAX_VIDEO_DURATION, MIN_AUTO_VIDEO_DURATION } from "../video-duration";
import { MAX_VIDEO_DURATION, MIN_AUTO_VIDEO_DURATION, videoDurationRange } from "../video-duration";
export const SubtitlesSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("off") }),
  z.object({ mode: z.literal("write") }),
  z.object({
    mode: z.literal("provided"),
    text: z.string().trim().min(1).max(8000),
  }),
]);
export type Subtitles = z.infer<typeof SubtitlesSchema>;
export function subtitlesFromInput(enabled: boolean, text: string): Subtitles {
  if (!enabled) return { mode: "off" };
  return text.trim() ? SubtitlesSchema.parse({ mode: "provided", text }) : { mode: "write" };
}
export const GeneratedSubtitlesSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  model: z.string().min(1),
});
export type GeneratedSubtitles = z.infer<typeof GeneratedSubtitlesSchema>;
export const VideoRequestSchema = z.preprocess(
  normalizeSubtitleFields,
  SharedRequestSchema.extend({
    outputType: z.literal("video").default("video"),
    viewport: z.never().optional(),
    duration: z
      .union([z.literal("auto"), z.number().int().min(3).max(MAX_VIDEO_DURATION)])
      .default("auto"),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
    resolution: z.enum(["1080p", "1440p"]).optional(),
    frameRate: z.union([z.literal(30), z.literal(60)]).optional(),
    renderer: z.enum(videoRendererIds).optional(),
    subtitles: SubtitlesSchema.optional(),
    languageTracks: LanguageTracksSchema.optional(),
    speech: SpeechSettingsSchema.optional(),
    scriptItems: ScriptItemsSchema.optional(),
    outputLanguage: VideoLanguageSchema.optional(),
    translations: VideoTranslationsSchema.optional(),
  })
    .superRefine(validateStyleSelection)
    .superRefine((request, context) => {
      const problem = scriptItemsProblem(
        request.scriptItems,
        typeof request.duration === "number" ? videoDurationRange(request.duration).max : undefined,
      );
      if (problem) context.addIssue({ code: "custom", path: ["scriptItems"], message: problem });
    }),
);
export type VideoRequest = z.infer<typeof VideoRequestSchema>;
export function resolveVideoDuration(
  duration: VideoRequest["duration"],
  suggestedDuration: number,
  scriptItems?: { endSeconds: number }[],
) {
  return Math.min(
    MAX_VIDEO_DURATION,
    duration === "auto"
      ? Math.max(
          MIN_AUTO_VIDEO_DURATION,
          suggestedDuration,
          ...(scriptItems || []).map((item) => item.endSeconds),
        )
      : Math.max(duration, ...(scriptItems || []).map((item) => item.endSeconds)),
  );
}
export { videoStyleCountRange } from "../style-selection";
export type VideoRefinementCheckpoint = {
  sourceJobId: string;
  sourceWorkspace: string;
  sourceSessionId: string;
  sourcePhase: "ready" | "cancelled";
  sourceFinishedAt?: string;
  workspace: string;
  requestedChanges: string;
  files: { path: string; available: boolean; sha256?: string; bytes?: number }[];
  inheritedCacheDirectories: string[];
};

export type VideoRefinementInstruction = {
  jobId: string;
  prompt: string;
  createdAt?: string;
  assetIds?: string[];
};
export interface VideoGenerationJob extends JobState {
  refinementHistory?: VideoRefinementInstruction[];
  discardedRefinementJobIds?: string[];
  refinementAssetIds?: string[];
  refinementCheckpoint?: VideoRefinementCheckpoint;
  speechTrack?: SpeechTrack;
  languageMedia?: LanguageMedia;
  outputType?: "video";
  page?: never;
  pageProduction?: never;
  duration: number;
  /** Original approximate setting, retained separately from the chosen production timeline. */
  targetDuration?: number;
  video?: string;
  viewingVideo?: string;
  cardClip?: string;
  playbackCopies?: PlaybackCopies;
  poster?: string;
  production?: Production;
  storyboardReady?: boolean;
  buildPlan?: { model: string; sessionId: string; value: VideoBuildPlan };
  correctionSession?: { model: string; sessionId: string };
}
export type PlaybackCopies = {
  profile: string;
  status: "making" | "ready" | "failed";
  error?: string;
  updatedAt: string;
};
export function playbackVideoOf(job: { video?: string; viewingVideo?: string }) {
  return job.viewingVideo || job.video;
}
export function cardClipOf(job: { kind?: string; cardClip?: string }) {
  return job.kind === "full" ? job.cardClip : undefined;
}
export { ProductionSchema } from "../agents/schemas/video";
export type { Production } from "../agents/schemas/video";
import type { Production } from "../agents/schemas/video";

export { BriefSchema, type Brief } from "../agents/schemas/video";
