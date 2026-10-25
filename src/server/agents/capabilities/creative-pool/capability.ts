import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot } from "../../../runtime/config";
import type { AgentMcpCapability } from "../shared/types";

export function creativePoolCapability(
  includeAlternatives = true,
  workspace?: string,
  readOnly = true,
): AgentMcpCapability {
  return {
    command: process.execPath,
    args: [
      "--import",
      pathToFileURL(path.join(appRoot, "node_modules/tsx/dist/loader.mjs")).href,
      path.join(appRoot, "src/server/agents/capabilities/creative-pool/server.ts"),
    ],
    env: {
      ...Object.fromEntries(
        ["PYTHON", "BLENDER", "KRITA", "ASEPRITE", "FFMPEG"]
          .map((name) => `KITEVA_TECHNOLOGY_${name}`)
          .flatMap((name) => (process.env[name] ? [[name, process.env[name]!]] : [])),
      ),
      KITEVA_POOL_INCLUDE_ALTERNATIVES: String(includeAlternatives),
      ...(workspace ? { KITEVA_POOL_WORKSPACE: workspace } : {}),
      KITEVA_POOL_READ_ONLY: String(readOnly),
    },
    enabledTools: [
      "search_pool",
      "read_pool_entry",
      "inspect_technologies",
      ...(!readOnly && workspace ? ["prepare_technology", "prepare_technology_stylesheet"] : []),
    ],
    toolTimeoutSeconds: 300,
  };
}
