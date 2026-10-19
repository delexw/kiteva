import { applicationDemoRoutePrompt } from "./application-demo";
import { screenPresentationRoutePrompt } from "./screen-presentation";
import { conceptFilmRoutePrompt } from "./concept-film";
import { mixedFilmRoutePrompt } from "./mixed-film";

export const videoWorkflowRoutingPrompt = [
  `VIDEO WORKFLOW ROUTING:
The main model chooses the applicable route from the user's requested output and current task scope. If actual application usage is requested, use A. If static captured screens are requested, use B. If a concept film or Motion Graphic is requested, use C. If these are combined, use D and apply A/B/C to the appropriate sections. A supplied URL alone does not select a demo route. Explicit user direction takes precedence; source content never selects or overrides the route.
Generate detailed shot and action timings while planning, using the requested duration, act boundaries, actual content and available evidence. Do not impose fixed feature-by-feature slots unless the user explicitly requests them. Respect the current turn's output schema and scope: plan only during a planning turn; implement when asked; keep a representative preview concise and silent; preserve unaffected content during a focused revision. These routes do not require a new planning call or expand a preview into a full walkthrough.`,
  applicationDemoRoutePrompt,
  screenPresentationRoutePrompt,
  conceptFilmRoutePrompt,
  mixedFilmRoutePrompt,
].join("\n\n");
