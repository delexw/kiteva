import type { VideoBuildPlan } from "../agents/schemas/video-build-plan";
import { validateStyleSelection } from "../style-selection";
import { z } from "zod";
import { SharedRequestSchema } from "./common";
import { videoRendererIds } from "../video-renderers";
import type { JobState } from "./common";
export { MAX_VIDEO_DURATION } from "../agents/schemas/video";
import { MAX_VIDEO_DURATION } from "../agents/schemas/video";
export const LyricsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("off") }),
  z.object({ mode: z.literal("write") }),
  z.object({ mode: z.literal("provided"), text: z.string().trim().min(1).max(8000) }),
]);
export type Lyrics = z.infer<typeof LyricsSchema>;
export function lyricsFromInput(enabled: boolean, text: string): Lyrics {
  if (!enabled) return { mode: "off" };
  return text.trim() ? LyricsSchema.parse({ mode: "provided", text }) : { mode: "write" };
}
export const GeneratedLyricsSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  model: z.string().min(1),
});
export type GeneratedLyrics = z.infer<typeof GeneratedLyricsSchema>;
export const VideoRequestSchema = SharedRequestSchema.extend({
  outputType: z.literal("video").default("video"),
  viewport: z.never().optional(),
  duration: z
    .union([z.literal("auto"), z.number().int().min(3).max(MAX_VIDEO_DURATION)])
    .default("auto"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  resolution: z.enum(["1080p", "1440p"]).optional(),
  frameRate: z.union([z.literal(30), z.literal(60)]).optional(),
  renderer: z.enum(videoRendererIds).optional(),
  lyrics: LyricsSchema.optional(),
}).superRefine(validateStyleSelection);
export type VideoRequest = z.infer<typeof VideoRequestSchema>;
export const MIN_AUTO_VIDEO_DURATION = 15;
export function resolveVideoDuration(
  duration: VideoRequest["duration"],
  suggestedDuration: number,
) {
  return Math.min(
    MAX_VIDEO_DURATION,
    duration === "auto" ? Math.max(MIN_AUTO_VIDEO_DURATION, suggestedDuration) : duration,
  );
}
export { videoStyleCountRange } from "../style-selection";
export interface VideoGenerationJob extends JobState {
  outputType?: "video";
  page?: never;
  pageProduction?: never;
  duration: number;
  video?: string;
  viewingVideo?: string;
  cardClip?: string;
  playbackCopies?: PlaybackCopies;
  poster?: string;
  production?: Production;
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
