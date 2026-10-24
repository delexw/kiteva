import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { appRoot } from "../../../runtime/config";
import { NarrationConfigSchema, narrationConfigPath } from "../../../audio/narration-types";
import type { AgentMcpCapability } from "../shared/types";

export function narrationCapability(workspace: string): AgentMcpCapability | undefined {
  const file = path.join(workspace, narrationConfigPath);
  if (!existsSync(file)) return;
  const config = NarrationConfigSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  return {
    command: process.execPath,
    args: [
      "--import",
      pathToFileURL(path.join(appRoot, "node_modules/tsx/dist/loader.mjs")).href,
      path.join(appRoot, "src/server/agents/capabilities/narration/server.ts"),
      JSON.stringify({ workspace, config }),
    ],
    env: {},
    enabledTools: ["create_narration", "edit_narration"],
    toolTimeoutSeconds: 1800,
  };
}
