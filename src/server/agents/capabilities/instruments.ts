import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot } from "../../runtime/config";
import type { AgentMcpCapability } from "./types";

export function instrumentsCapability(workspace: string, readOnly = false): AgentMcpCapability {
  return {
    command: process.execPath,
    args: [
      "--import",
      pathToFileURL(path.join(appRoot, "node_modules/tsx/dist/loader.mjs")).href,
      path.join(appRoot, "src/server/agents/capabilities/instruments-server.ts"),
      JSON.stringify({ workspace, readOnly }),
    ],
    env: {
      VIDEO_FLUIDSYNTH_PATH: process.env.VIDEO_FLUIDSYNTH_PATH || "fluidsynth",
      VIDEO_INSTRUMENT_SOUNDFONT: process.env.VIDEO_INSTRUMENT_SOUNDFONT || "",
    },
    toolTimeoutSeconds: 600,
    enabledTools: ["instrument_status", ...(!readOnly ? ["render_instrumental"] : [])],
  };
}
