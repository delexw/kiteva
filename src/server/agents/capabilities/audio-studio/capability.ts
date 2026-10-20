import path from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { appRoot, dataRoot } from "../../../runtime/config";
import type { AgentMcpCapability } from "../shared/types";

export const audioStudioTools = ["generate_audio", "edit_audio", "process_audio", "unload_models"];

/** Use an explicit executable or the project-local upstream installation; never install during a job. */
export function audioStudioCommand() {
  const command =
    process.env.AUDIO_STUDIO_MCP_COMMAND ||
    path.join(
      dataRoot,
      "audio-studio-mcp",
      ".venv",
      process.platform === "win32" ? "Scripts/audio-studio-mcp.exe" : "bin/audio-studio-mcp",
    );
  return path.isAbsolute(command) && existsSync(command) ? command : undefined;
}

export function audioStudioCapability(workspace: string): AgentMcpCapability | undefined {
  const command = audioStudioCommand();
  if (!command) return;
  return {
    command: process.execPath,
    args: [
      "--import",
      pathToFileURL(path.join(appRoot, "node_modules/tsx/dist/loader.mjs")).href,
      path.join(appRoot, "src/server/agents/capabilities/audio-studio/server.ts"),
      JSON.stringify({ workspace, command }),
    ],
    env: {},
    enabledTools: audioStudioTools,
    toolTimeoutSeconds: 1800,
  };
}
