import { workspacePaths } from "../../../runtime/workspace";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { systemEnvironment } from "../../../runtime/platform";
import { audioStudioCommand, audioStudioTools } from "./capability";

export async function connectAudioStudio(workspace: string, command: string, signal?: AbortSignal) {
  const outputDirectory = path.join(workspace, workspacePaths(workspace).audioStudio);
  await mkdir(outputDirectory, { recursive: true });
  const env = Object.fromEntries(
    Object.entries(systemEnvironment()).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  for (const name of [
    "AUDIO_STUDIO_BACKEND",
    "AUDIO_STUDIO_SA3_DIR",
    "AUDIO_STUDIO_SA3_MODEL",
    "AUDIO_STUDIO_IDLE_UNLOAD_MIN",
    "AUDIO_STUDIO_MLX_CACHE_GB",
  ])
    if (process.env[name]) env[name] = process.env[name]!;
  const client = new Client({ name: "kiteva-audio-studio", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command,
    cwd: workspace,
    env: { ...env, AUDIO_STUDIO_OUTPUT_DIR: outputDirectory },
    stderr: "pipe",
  });
  try {
    await client.connect(transport, { timeout: 15000, signal });
    return client;
  } catch (error) {
    await transport.close();
    throw error;
  }
}

export interface AudioStudioAvailability {
  available: boolean;
  limitation?: string;
  tools?: Pick<Tool, "name" | "description" | "inputSchema">[];
  instructions?: string;
  modelReadiness?: "not_probed";
}

/** Probe actual MCP startup/tool discovery, without loading weights or generating audio. */
export async function audioStudioAvailability(
  workspace: string,
  signal: AbortSignal,
): Promise<AudioStudioAvailability> {
  const command = audioStudioCommand();
  if (!command)
    return {
      available: false,
      limitation:
        "Audio Studio MCP is not installed/configured. Set AUDIO_STUDIO_MCP_COMMAND to its absolute executable path after upstream setup.",
    };
  const client = await connectAudioStudio(workspace, command, signal);
  try {
    const result = await client.listTools({}, { signal, timeout: 15000 });
    const names = new Set(result.tools.map((tool) => tool.name));
    const available = audioStudioTools.every((name) => names.has(name));
    return {
      available,
      tools: result.tools
        .filter((tool) => audioStudioTools.includes(tool.name))
        .map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      instructions: client.getInstructions(),
      modelReadiness: "not_probed",
      limitation: available ? undefined : "Audio Studio MCP did not expose all required tools.",
    };
  } finally {
    await client.close();
  }
}
