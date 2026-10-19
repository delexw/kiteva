import { animateUiCapability } from "./animate-ui";
import { animateUiGuidance } from "./animate-ui-prompt";
import { reactBitsCapability } from "./react-bits";
import { creativePoolCapability } from "./creative-pool";
import { creativePoolGuidance } from "./creative-pool-prompt";
import { reactBitsGuidance } from "./react-bits-prompt";
import type { AgentMcpCapability } from "./types";

// Add each capability's registration and guidance in its own files, separate from skills.
export function agentCapabilities(workspace: string, readOnly = false, textOnly = false) {
  const servers: Record<string, AgentMcpCapability> = textOnly
    ? {}
    : {
        react_bits: reactBitsCapability(workspace, readOnly),
        animate_ui: animateUiCapability(workspace, readOnly),
        creative_pool: creativePoolCapability(),
      };
  return {
    servers,
    guidance: textOnly
      ? ""
      : `${reactBitsGuidance}\n${animateUiGuidance}\n${creativePoolGuidance}\nAUTHORING RESOURCE SELECTION: Read authoringResources in style-context.json when present. JEV chose exactly one primary authoring resource using its Choice API for this specific brief and renderer. Use that chosen capability, bundled skill or local-code approach; read its skill or component guidance before implementation. Do not mix in an alternative component library or bundled skill by default. Ordinary local implementation code remains available. This is not a Motion Graphic selection or a replacement for the main model's production plan. If a selected resource proves incompatible or unavailable on inspection, preserve the requested result with available tools and document the reason. If JEV is unavailable or the field is absent, choose appropriate available resources directly. Never force a component or skill into a scene solely because it is installed. All calls retain the current provider and default reasoning effort.`,
  };
}
