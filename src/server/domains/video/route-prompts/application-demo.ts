import { readFileSync } from "node:fs";
import type { VideoRenderer } from "../../../../shared/video-renderers";
import { hyperframesDemoRoutePrompt } from "./application-demo-hyperframes";
import { multiplaneDemoRoutePrompt } from "./application-demo-multiplane";

const rendererPrompts: Record<VideoRenderer, string> = {
  hyperframes: hyperframesDemoRoutePrompt,
  multiplane: multiplaneDemoRoutePrompt,
};

const openScreenDemoGuidance = readFileSync(
  new URL("./openscreen-demo.md", import.meta.url),
  "utf8",
);

export function buildApplicationDemoRoutePrompt(renderer: VideoRenderer) {
  return `ROUTE A — APPLICATION DEMONSTRATION:
The main model planner owns feature selection, the demo story and timing. Brief preparation supplies evidence and uncertainties; verify them against the live application before planning.

DISCOVER: Check available sitemaps first, then navigation and reachable pages, tabs/search/filters/expanders, forms/buttons and resulting states, and complete workflows. Confirm sitemap entries in the live app; if no sitemap is available, continue with navigation. Record observed capabilities and distinguish inaccessible or unverified ones. Adapt to the actual app rather than assuming example workflows exist.

SCOPE AND STORY: Discover broadly, demonstrate selectively. Cover the main distinct functionalities and every explicitly requested feature; secondary filters, minor tabs and alternate views may be omitted unless requested or necessary. An explicit request for exhaustive control-level coverage takes precedence. In the existing storyboard, list the selected capabilities and briefly explain secondary omissions. Map each selected feature to its starting state, capture actions, visible result, connection to the next task and estimated timing. A main creation-to-viewing journey does not automatically cover separate core capabilities.
Use context → action → result with one consistent non-sensitive scenario and the same created item. Follow natural navigation and dependencies, respecting explicit user ordering. Preserve continuous action within each task; avoid unrelated page jumps, backtracking and unexplained state resets. Bridge necessary branches with context. This structure does not require extra narration. Reconcile captured coverage with the plan and record missing supported actions before assembly.

FOCUS PLAN: After thoroughly understanding the URL’s workflows and states through exploration, the main planner must storyboard each target component, context, zoom amount and timing. Use minimal enlargement without cropping components or labels; stay wide for navigation, scrolling and broad results.

UNSUPPORTED INTERACTIONS: If any component cannot be operated with available tools, report the limitation and skip only that interaction without a blocking question. Continue supported features using actual OpenScreen footage. Never substitute screenshots, stills or recreated UI for demo footage, invent success or fabricate dependent states. Record omissions in the storyboard and final report; bridge to the next reachable task coherently. Only if recording, export or footage integration itself is unavailable, stop with a blocking assetNeeds question; never assemble a substitute demo while awaiting an answer.

CHAPTERS: Group major functionalities into named chapters, not individual controls. At each major feature boundary, use a brief transition card: section title centered, actual supplied or application-derived product logo in the bottom-left or bottom-right corner. Keep one consistent corner, logo proportions, safe padding and title separation. Match typography, palette and motion to the selected Motion Graphics and act-specific direction. Allow a readable title beat, then continue the real recorded task. A chapter card must not conceal a state reset or replace feature coverage. Include chapter names, boundaries, card treatment and timing in the storyboard. Explicit user presentation instructions take precedence.

FILE PICKERS: For image, document, audio and other file uploads, assign permitted local files directly to the actual input[type="file"] using reference_browser upload_files (backed by Puppeteer uploadFile; Playwright equivalent: setInputFiles). Do not click the attachment button or open or operate the native file-picker window. Respect accepted types, multiple-file support and application limits; verify the filename, thumbnail or resulting app state before continuing. OpenScreen records the application response. If registered tools cannot assign files, follow UNSUPPORTED INTERACTIONS; do not bypass tool restrictions. This does not apply to date or other in-page selection controls.

FOOTAGE FIT: Scale exported footage proportionally to contain the entire captured frame inside the film's demo area. Preserve every edge; use padding or a matching background for aspect-ratio differences. Never use cover, stretching, overflow clipping or extra assembly zoom. Apply the same fit to extracted frames. Verify all edges at final resolution; OpenScreen's rendered zoom remains part of the source.

Follow the OpenScreen skill below for recording, review, editing and export. Use the integration guidance selected from the saved renderer setting; that setting never changes a required demo into Route B. Route D's demo sections also follow Route A.
${openScreenDemoGuidance}

${rendererPrompts[renderer]}`;
}
