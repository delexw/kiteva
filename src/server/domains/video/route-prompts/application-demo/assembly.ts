import type { VideoRenderer } from "../../../../../shared/video-renderers";
import { hyperframesDemoRoutePrompt } from "../application-demo-hyperframes";
import { multiplaneDemoRoutePrompt } from "../application-demo-multiplane";
import { chapterCardsGuidance, footagePlacementGuidance } from "./shared";

export const rendererDemoPrompts: Record<VideoRenderer, string> = {
  hyperframes: hyperframesDemoRoutePrompt,
  multiplane: multiplaneDemoRoutePrompt,
};

export function buildApplicationDemoAssemblyPrompt(renderer: VideoRenderer) {
  return `ROUTE A — APPLICATION DEMONSTRATION: ASSEMBLY
\`\`\`mermaid
flowchart TD
  plan["Approved plan"] --> required{"Footage required?"}
  required -->|Yes| handoff["Read CAPTURED_CHAPTERS.json: exports, actual durations, results, omissions"]
  required -->|No| none["capturePlan=null: no footage"]
  handoff --> reconcile["Reconcile storyboard, timing and chapter cards"]
  none --> reconcile
  reconcile --> placement["Apply shared FOOTAGE PLACEMENT rule"]
  placement --> integrate["Integrate with saved renderer"]
  integrate --> verify["Verify coverage, frame edges and deterministic seeking"]
  handoff -->|Required footage missing| block["Report exact assetNeeds limitation and stop"]
  integrate -->|Integration unavailable| block
\`\`\`

Use reviewed exports intact, preserving their complete action sequence and native speed regions. Do not cut, trim, skip frames or retime captured footage to fit narration. Align narration and chapter cards with the accepted footage; if the storyboard allocation is infeasible, report a timing conflict before implementation rather than silently compressing the footage. Use reviewed exports. Do not discover new workflows, record or edit OpenScreen takes; capture tools are unavailable. Never invent actions, conceal omissions or substitute screenshots/recreated UI. Report exact blocking limitations and stop.

${chapterCardsGuidance}

${footagePlacementGuidance}

Use the integration guidance selected from the saved renderer setting; that setting never changes a required demo into Route B. Route D's demo sections also follow Route A.
${rendererDemoPrompts[renderer]}`;
}
