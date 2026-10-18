import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstrumentScoreSchema } from "../../audio/instruments/score";
import { instrumentReadiness, renderInstrumental } from "../../audio/instruments/fluidsynth";
import type { InstrumentToolResult } from "./types";

export function createInstrumentTools(options: {
  workspace: string;
  readOnly: boolean;
  signal: AbortSignal;
}) {
  const server = new McpServer({ name: "instruments", version: "1.0.0" });
  async function run(action: () => Promise<InstrumentToolResult>) {
    try {
      options.signal.throwIfAborted();
      const result = await action();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    } catch (error) {
      const result: InstrumentToolResult = {
        kind: "error",
        message: error instanceof Error ? error.message : "Instrument rendering failed",
      };
      return {
        isError: true,
        content: [{ type: "text" as const, text: result.message }],
        structuredContent: { ...result },
      };
    }
  }
  server.registerTool(
    "instrument_status",
    {
      description:
        "Check the local FluidSynth and SoundFont setup. No narration, voice provider or visual renderer is needed; no installation or file writes.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => run(async () => ({ kind: "status", ...(await instrumentReadiness(options.signal)) })),
  );
  if (!options.readOnly)
    server.registerTool(
      "render_instrumental",
      {
        description:
          "Render an original structured musical score into a local stereo WAV using FluidSynth and the configured SoundFont. Build only; respect Music settings and silent-preview requirements. No vocals or extra AI calls. Returns job-relative audioFile, score/MIDI/provenance paths and measured duration for the existing renderer and narration mix.",
        inputSchema: { score: InstrumentScoreSchema },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      ({ score }) =>
        run(async () => ({
          kind: "rendered",
          ...(await renderInstrumental(options.workspace, score, options.signal)),
        })),
    );
  return server;
}
