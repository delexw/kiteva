import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot } from "../../../runtime/config";
import type { AgentMcpCapability } from "../shared/types";

export function creativePoolCapability(includeAlternatives = true): AgentMcpCapability {
  return {
    command: process.execPath,
    args: [
      "--import",
      pathToFileURL(path.join(appRoot, "node_modules/tsx/dist/loader.mjs")).href,
      path.join(appRoot, "src/server/agents/capabilities/creative-pool/server.ts"),
    ],
    env: { KITEVA_POOL_INCLUDE_ALTERNATIVES: String(includeAlternatives) },
    enabledTools: ["search_pool", "read_pool_entry"],
  };
}
