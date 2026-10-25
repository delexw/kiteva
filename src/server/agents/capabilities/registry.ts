import { narrationCapability } from "./narration/capability";
import { narrationGuidance } from "./narration/prompt";
import { audioStudioCapability } from "./audio-studio/capability";
import { audioStudioGuidance } from "./audio-studio/prompt";
import { animateUiCapability } from "./animate-ui/capability";
import { animateUiGuidance } from "./animate-ui/prompt";
import { reactBitsCapability } from "./react-bits/capability";
import { creativePoolCapability } from "./creative-pool/capability";
import { creativePoolGuidance } from "./creative-pool/prompt";
import { reactBitsGuidance } from "./react-bits/prompt";
import type { AgentMcpCapability } from "./shared/types";

// Add each capability's registration and guidance in its own files, separate from skills.
export function agentCapabilities(
  workspace: string,
  readOnly = false,
  textOnly = false,
  includeCreativeAlternatives = true,
) {
  const narration = !readOnly && !textOnly ? narrationCapability(workspace) : undefined;
  const audioStudio = !readOnly && !textOnly ? audioStudioCapability(workspace) : undefined;
  const servers: Record<string, AgentMcpCapability> = textOnly
    ? {}
    : {
        react_bits: reactBitsCapability(workspace, readOnly),
        animate_ui: animateUiCapability(workspace, readOnly),
        creative_pool: creativePoolCapability(includeCreativeAlternatives, workspace, readOnly),
        ...(audioStudio ? { audio_studio: audioStudio } : {}),
        ...(narration ? { narration } : {}),
      };
  return {
    servers,
    guidance: textOnly
      ? ""
      : `${narration ? narrationGuidance : ""}\n${audioStudioGuidance}\n${reactBitsGuidance}\n${animateUiGuidance}\n${creativePoolGuidance}\nAUTHORING RESOURCE SELECTION: Read authoringResources in style-context.json when present. JEV chose exactly one primary authoring resource using its Choice API for this specific brief and renderer. Use that chosen capability, bundled skill or local-code approach; read its skill or component guidance before implementation. Do not mix in an alternative component library or bundled skill by default. Ordinary local implementation code remains available. This is not a Motion Graphic selection or a replacement for the main model's production plan. If a selected resource proves incompatible or unavailable on inspection, preserve the requested result with available tools and document the reason. If JEV is unavailable or the field is absent, choose appropriate available resources directly. Never force a component or skill into a scene solely because it is installed. All calls retain the current provider and default reasoning effort.`,
  };
}
