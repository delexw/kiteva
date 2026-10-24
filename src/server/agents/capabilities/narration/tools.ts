import { activityScope, bindActivityCallback } from "../../../jobs/activity-scope";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { narrationService } from "../../../audio/narration";
import { narrationGuidance } from "./prompt";
import {
  CreateNarrationSchema,
  EditNarrationSchema,
  narrationStatePath,
  type NarrationConfig,
  type NarrationToolResult,
} from "../../../audio/narration-types";

export function createNarrationTools(
  workspace: string,
  config: NarrationConfig,
  service = narrationService(workspace, config),
) {
  const server = new Server(
    { name: "narration", version: "1.0.0" },
    {
      capabilities: { tools: {} },
      instructions: narrationGuidance,
    },
  );
  const narrate = bindActivityCallback((name: string, args: unknown, signal: AbortSignal) =>
    activityScope(
      "Narration",
      () =>
        activityScope(
          name === "create_narration" ? "Creating narration…" : "Editing narration…",
          () =>
            name === "create_narration" ? service.create(args, signal) : service.edit(args, signal),
        ),
      { signal },
    ),
  );
  let pending: Promise<unknown> = Promise.resolve();
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "create_narration",
        description:
          "Create or replace narration from timed text cues using configured voices. Read audio/narration.json and supply its expectedRevision when replacing. Returns measured durations and cues; Kiteva performs final mixing.",
        inputSchema: z.toJSONSchema(CreateNarrationSchema),
      },
      {
        name: "edit_narration",
        description:
          "Edit selected narration cue text or startSeconds. Timing-only edits reuse speech; text changes synthesize only changed cues. Read audio/narration.json first and pass expectedRevision. Returns updated measured cues.",
        inputSchema: z.toJSONSchema(EditNarrationSchema),
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
    const operation = pending.then(async () => {
      try {
        extra.signal.throwIfAborted();
        const name = request.params.name;
        if (name !== "create_narration" && name !== "edit_narration")
          throw Error("Unknown narration tool");
        const state = await narrate(name, request.params.arguments, extra.signal);
        const structuredContent: NarrationToolResult = {
          kind: "narration",
          action: name === "create_narration" ? "created" : "edited",
          statePath: narrationStatePath,
          state,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
          structuredContent,
        };
      } catch (error) {
        const structuredContent: NarrationToolResult = {
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        };
        return {
          isError: true,
          content: [{ type: "text" as const, text: structuredContent.message }],
          structuredContent,
        };
      }
    });
    pending = operation.catch(() => {});
    return operation;
  });
  return server;
}
