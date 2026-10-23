import type { VideoRenderer } from "../../../../shared/video-renderers";
import { applicationDemoPlanningPrompt } from "./application-demo/planning";
import { openScreenDemoGuidance } from "./application-demo/capture";
import { filePickerGuidance, footagePlacementGuidance } from "./application-demo/shared";
import {
  buildApplicationDemoAssemblyPrompt,
  rendererDemoPrompts,
} from "./application-demo/assembly";

/** Legacy saved plans and previews still record within their implementation turn. */
export type ApplicationDemoStage = "planning" | "assembly" | "legacy";

export function buildApplicationDemoRoutePrompt(
  renderer: VideoRenderer,
  stage: ApplicationDemoStage = "legacy",
) {
  if (stage === "planning") return applicationDemoPlanningPrompt;
  if (stage === "assembly") return buildApplicationDemoAssemblyPrompt(renderer);
  return `${applicationDemoPlanningPrompt}

${filePickerGuidance}

${footagePlacementGuidance}

Follow the OpenScreen workflow below for recording, review, editing and export. Use the integration guidance selected from the saved renderer setting; that setting never changes a required demo into Route B. Route D's demo sections also follow Route A.
${openScreenDemoGuidance}

${rendererDemoPrompts[renderer]}`;
}
