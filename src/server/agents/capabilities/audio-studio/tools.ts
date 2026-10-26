import path from "node:path";
import { realpath } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { serviceToolInput } from "../shared/service-tool-input";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { audioStudioTools } from "./capability";
import type { AudioStudioResult } from "./types";

/** Forward upstream tool contracts unchanged while limiting file access to this job. */
export async function createAudioStudioTools(workspace: string, upstream: Client) {
  const root = await realpath(workspace);
  const listed = await upstream.listTools();
  const tools = listed.tools.filter((tool) => audioStudioTools.includes(tool.name));
  const server = new McpServer(
    { name: "audio_studio", version: "1.0.0" },
    {
      instructions: upstream.getInstructions(),
    },
  );
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: serviceToolInput(tool.inputSchema),
        annotations: tool.annotations,
        _meta: tool._meta,
      },
      async (input, extra) => {
        try {
          const args = { ...input };
          if (args.input_audio !== undefined) {
            if (typeof args.input_audio !== "string")
              throw Error("input_audio must be a workspace file path");
            const file = await realpath(path.resolve(root, args.input_audio));
            const relative = path.relative(root, file);
            if (
              relative === ".." ||
              relative.startsWith(`..${path.sep}`) ||
              path.isAbsolute(relative)
            )
              throw Error("Audio input must stay inside the job workspace");
            args.input_audio = file;
          }
          const result = await upstream.callTool({ name: tool.name, arguments: args }, undefined, {
            signal: extra.signal,
            timeout: 1800000,
          });
          const structuredContent: AudioStudioResult = {
            kind: "audio_studio_result",
            tool: tool.name,
            result,
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            structuredContent,
            isError: Boolean(result.isError),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const structuredContent: AudioStudioResult = { kind: "error", message };
          return {
            content: [{ type: "text" as const, text: message }],
            structuredContent,
            isError: true,
          };
        }
      },
    );
  }
  return server;
}
