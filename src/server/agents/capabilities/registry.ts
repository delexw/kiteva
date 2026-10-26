import {
  referenceBrowserCapability,
  type ReferenceBrowserOptions,
} from "./reference-browser/capability";
import { referenceBrowserGuidance } from "./reference-browser/prompt";
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
  referenceOptions: ReferenceBrowserOptions = {},
) {
  const reference = referenceBrowserCapability(workspace, {
    ...referenceOptions,
    readOnly,
    textOnly,
  });
  const narration = !readOnly && !textOnly ? narrationCapability(workspace) : undefined;
  const audioStudio = !readOnly && !textOnly ? audioStudioCapability(workspace) : undefined;
  const servers: Record<string, AgentMcpCapability> = textOnly
    ? {}
    : {
        ...(reference ? { reference_browser: reference } : {}),
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
      : [
          narration ? `### Narration\n\n${narrationGuidance}` : "",
          `### Audio Studio\n\n${audioStudioGuidance}`,
          `### React Bits\n\n${reactBitsGuidance}`,
          `### Animate UI\n\n${animateUiGuidance}`,
          `### Creative Pool\n\n${creativePoolGuidance}`,
          reference
            ? `### Website references\n\n${referenceBrowserGuidance({ ...referenceOptions, readOnly, textOnly })}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
  };
}
