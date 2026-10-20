import path from "node:path";
import { realpath } from "node:fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { audioStudioTools } from "./capability";
import type { AudioStudioResult } from "./types";

/** Forward upstream tool contracts unchanged while limiting file access to this job. */
export async function createAudioStudioTools(workspace: string, upstream: Client) {
  const root = await realpath(workspace);
  const listed = await upstream.listTools();
  const tools = listed.tools.filter((tool) => audioStudioTools.includes(tool.name));
  const server = new Server(
    { name: "audio_studio", version: "1.0.0" },
    {
      capabilities: { tools: {} },
      instructions: upstream.getInstructions(),
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ outputSchema: _schema, ...tool }) => tool),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      if (!tools.some((tool) => tool.name === request.params.name))
        throw Error("Unknown audio tool");
      const args = { ...request.params.arguments };
      if (args.input_audio !== undefined) {
        if (typeof args.input_audio !== "string")
          throw Error("input_audio must be a workspace file path");
        const file = await realpath(path.resolve(root, args.input_audio));
        const relative = path.relative(root, file);
        if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
          throw Error("Audio input must stay inside the job workspace");
        args.input_audio = file;
      }
      const result = await upstream.callTool(
        { name: request.params.name, arguments: args },
        undefined,
        { signal: extra.signal, timeout: 1800000 },
      );
      const structuredContent: AudioStudioResult = {
        kind: "audio_studio_result",
        tool: request.params.name,
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
  });
  return server;
}
