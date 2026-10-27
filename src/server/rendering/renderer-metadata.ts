import { hyperframesMetadata } from "./hyperframes/metadata";
import { multiplaneMetadata } from "./multiplane/metadata";
import { remotionMetadata } from "./remotion/metadata";

/** Renderer-owned facts for planning, JEV decisions and audio integration guidance. */
const rendererMetadata = {
  hyperframes: hyperframesMetadata,
  multiplane: multiplaneMetadata,
  remotion: remotionMetadata,
};
export function rendererMetadataFor(renderer: keyof typeof rendererMetadata) {
  return rendererMetadata[renderer];
}

/** Decision-time capabilities omit production CLI and audio-authoring instructions. */
export function rendererDecisionMetadataFor(renderer: keyof typeof rendererMetadata) {
  const metadata = rendererMetadataFor(renderer);
  return {
    id: metadata.id,
    name: metadata.name,
    selectionPolicy: metadata.selectionPolicy,
    visuals: metadata.visuals,
    limitations: metadata.limitations,
    audio: {
      generatesMusic: metadata.audio.generatesMusic,
      generationResponsibility: metadata.audio.generationResponsibility,
      previewPolicy: metadata.audio.previewPolicy,
    },
  };
}
