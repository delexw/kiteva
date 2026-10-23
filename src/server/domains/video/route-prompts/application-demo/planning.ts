import {
  storyContinuityGuidance,
  unsupportedInteractionsGuidance,
  chapterCardsGuidance,
} from "./shared";

export const applicationDemoPlanningPrompt = `ROUTE A — APPLICATION DEMONSTRATION:
\`\`\`mermaid
flowchart TD
  discover["DISCOVER: verify live app capabilities"] --> scope["SCOPE AND STORY: select coverage and coherent scenario"]
  discover -->|Inaccessible or unverified| uncertainty["Record uncertainty; never invent capability"]
  scope --> storyboard["STORYBOARD READY: timed full-film scenes, beats, visuals, transitions and audio intentions"]
  storyboard --> footage{"Actual footage required?"}
  footage -->|No| none["Return capturePlan=null"]
  footage -->|Yes| chapters["FOCUS PLAN + CHAPTERS: starting states, actions, results, continuity, timing"]
  chapters --> plan["Return storyboard + structured capturePlan; code validates and saves before recording"]
\`\`\`

The main model planner owns feature selection, story and timing. Preparation supplies evidence; verify them against the live application before planning.

DISCOVER: Check available sitemaps first, then navigation and reachable pages, tabs/search/filters/expanders, forms/buttons and resulting states, and complete workflows. Confirm entries live; if no sitemap is available, continue with navigation. Record observed capabilities; distinguish inaccessible or unverified ones. Never assume example workflows exist.

SCOPE AND STORY: Discover broadly, demonstrate selectively. Cover the main distinct functionalities and every explicitly requested feature; secondary filters, minor tabs and alternate views may be omitted unless requested or necessary. An explicit request for exhaustive control-level coverage takes precedence. Document secondary omissions; each starting state must be reachable in a fresh browser. Map each selected feature to its starting state, capture actions, visible result, connection to the next task and estimated timing. A main creation-to-viewing journey does not automatically cover separate core capabilities.
${storyContinuityGuidance}

FOCUS PLAN: After thoroughly understanding the URL’s workflows and states through exploration, the main planner must storyboard each target component, context, zoom amount and timing. Use minimal enlargement without cropping components or labels; stay wide for navigation, scrolling and broad results.

${unsupportedInteractionsGuidance}

${chapterCardsGuidance}`;
