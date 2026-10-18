import { instrumentsCapability } from "./instruments";
import { instrumentsGuidance } from "./instruments-prompt";
import { reactBitsCapability } from "./react-bits";
import { reactBitsGuidance } from "./react-bits-prompt";
import type { AgentMcpCapability } from "./types";

// Add each capability's registration and guidance in its own files, separate from skills.
export function agentCapabilities(
  workspace: string,
  readOnly = false,
  textOnly = false,
  allowInstrumentRendering = true,
) {
  const servers: Record<string, AgentMcpCapability> = textOnly
    ? {}
    : {
        react_bits: reactBitsCapability(workspace, readOnly),
        instruments: instrumentsCapability(workspace, readOnly || !allowInstrumentRendering),
      };
  return { servers, guidance: textOnly ? "" : `${reactBitsGuidance} ${instrumentsGuidance}` };
}
