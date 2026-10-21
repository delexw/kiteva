import type { VideoRenderer } from "../../shared/video-renderers";
import type { RenderContractInput } from "./metadata";
import { hyperframesContract } from "./hyperframes/contract";
import { multiplaneContract } from "./multiplane/contract";

export function renderContract(renderer: VideoRenderer, input: RenderContractInput) {
  return renderer === "multiplane" ? multiplaneContract(input) : hyperframesContract(input);
}
