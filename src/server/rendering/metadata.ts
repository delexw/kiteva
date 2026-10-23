import type { VideoRenderer } from "../../shared/video-renderers";

export const sharedRendererAudioPolicy = {
  generatesMusic: false,
  generationResponsibility:
    "A renderer exports supplied audio; native playback/mixing does not establish music-generation availability. Choose an actually available authoring capability to create requested new audio.",
  narrationHandling:
    "Kiteva mixes its prepared narration after rendering and ducks the music. Do not embed or synthesize that prepared voice again.",
  previewPolicy: "Direction previews are silent; do not generate or integrate their music.",
  preferredGeneratedAsset:
    "A verified local WAV; preserve uploaded sources under their own instructions.",
} as const;

export interface RendererMetadata {
  id: VideoRenderer | "remotion";
  name: string;
  pipeline: string;
  selectionPolicy: string;
  entryPoint: string;
  execution: RendererExecutionPolicy;
  /** Provider-owned cache directories that may be inherited, never trusted without validation. */
  refinement?: { cacheDirectories: readonly string[] };
  visuals: {
    frameContract: string;
    reactComponents: string;
    recordedVideo: string;
  };
  audio: typeof sharedRendererAudioPolicy & {
    integration: "composition_media_tracks" | "single_premixed_file";
    multipleSources: string;
    manifestField: "audioFile" | null;
    cliArgument: "--audio" | null;
    pageAudio: string;
    optionalAuthoringHelpers?: string;
    preparationOrder: string[];
    guidance: string;
  };
  limitations: string[];
}

export type RendererJobKind = "preview" | "full";
export type RendererCommand = "check" | "inspect" | "verify" | "render";
export type RenderContractInput = {
  width: number;
  height: number;
  duration: number;
  fps: number;
  kind: RendererJobKind;
};
export interface RendererExecutionPolicy {
  cliPath: string;
  commonFlags: readonly string[];
  outputArgument: string | null;
  commandFlags: Partial<Record<RendererCommand, readonly string[]>>;
  stages: Record<RendererJobKind, readonly RendererCommand[]>;
  quality?: Record<RendererJobKind, string>;
  format?: Record<RendererJobKind, string>;
  compositionId?: string;
}
