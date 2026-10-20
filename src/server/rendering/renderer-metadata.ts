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
