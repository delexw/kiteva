import type { Brief } from "../../../../shared/agents/schemas/video";
import type { VideoGenerationJob, VideoRequest } from "../../../../shared/domains/video";
import type { VideoLanguage } from "../../../../shared/video-language";
import type { ProviderEvent } from "../../../agents/providers";
import type { prepareSpeech } from "../../../audio/speech";
export type SubtitleCue = { text: string; startSeconds: number; endSeconds: number };
export type LanguageMediaInput = {
  job: VideoGenerationJob;
  request: VideoRequest;
  brief: Brief;
  signal: AbortSignal;
  onEvent: (event: ProviderEvent) => void;
  emit: (type: string, message: string) => void;
};
export type TrackTranslator = (
  text: string,
  language: VideoLanguage,
  window: number,
  attempt: number,
) => Promise<string>;
export type LanguageMediaDependencies = {
  translate?: TrackTranslator;
  speak?: typeof prepareSpeech;
};
