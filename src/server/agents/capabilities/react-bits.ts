import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot } from "../../runtime/config";
import type { AgentMcpCapability } from "./types";

export function reactBitsCapability(workspace: string, readOnly = false): AgentMcpCapability {
  return {
    command: process.execPath,
    args: [
      "--import",
      pathToFileURL(path.join(appRoot, "node_modules/tsx/dist/loader.mjs")).href,
      path.join(appRoot, "src/server/agents/capabilities/react-bits-server.ts"),
      JSON.stringify({ workspace, readOnly }),
    ],
    env: {},
    enabledTools: [
      "search_components",
      "read_component",
      ...(!readOnly ? ["install_component"] : []),
    ],
  };
}
