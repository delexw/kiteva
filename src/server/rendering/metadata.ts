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
