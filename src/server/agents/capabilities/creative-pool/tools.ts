import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadCatalog } from "../../../catalog/catalog";
import { technologyPool } from "../../../../shared/technology-pool";
import type { CreativePoolEntry, CreativePoolResult } from "./types";

const poolKind = z.enum(["motion_graphic", "motion", "technology"]);

export function createCreativePoolTools(signal: AbortSignal, includeAlternatives = true) {
  const omittedFields = new Set([
    "provenance",
    "combination_guidance_provenance",
    "source_frame_review",
    "review_evidence",
    "background_evidence",
    ...(!includeAlternatives ? ["motion_graphic_variants", "suggested_combinations"] : []),
  ]);
  const server = new McpServer({ name: "creative-pool", version: "1.0.0" });
  async function entries(): Promise<CreativePoolEntry[]> {
    const catalog = await loadCatalog();
    return [
      ...catalog.styles.map((definition) => ({
        kind: "motion_graphic" as const,
        id: definition.id,
        name: definition.name_en,
        definition,
      })),
      ...catalog.motions.map((definition) => ({
        kind: "motion" as const,
        id: definition.id,
        name: definition.name,
        definition,
      })),
      ...Object.entries(technologyPool).map(([id, definition]) => ({
        kind: "technology" as const,
        id,
        name: definition.name,
        definition,
      })),
    ];
  }
  async function run(action: () => Promise<CreativePoolResult>) {
    try {
      signal.throwIfAborted();
      const result = await action();
      signal.throwIfAborted();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const result: CreativePoolResult = {
        kind: "error",
        message: error instanceof Error ? error.message : "Pool lookup failed",
      };
      return {
        isError: true,
        content: [{ type: "text" as const, text: result.message }],
        structuredContent: result,
      };
    }
  }
  server.registerTool(
    "search_pool",
    {
      description:
        "Find Motion Graphics, motions or technologies by name, ID or metadata. Returns all matches; use read_pool_entry for complete instructions. No files or network access.",
      inputSchema: { query: z.string(), kind: poolKind.optional() },
      annotations: { readOnlyHint: true },
    },
    ({ query, kind }) =>
      run(async () => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return {
          kind: "search",
          entries: (await entries())
            .filter(
              (entry) =>
                (!kind || kind === entry.kind) &&
                words.every((word) => JSON.stringify(entry).toLowerCase().includes(word)),
            )
            .map(({ kind, id, name }) => ({ kind, id, name })),
        };
      }),
  );
  server.registerTool(
    "read_pool_entry",
    {
      description:
        "Read canonical authoring instructions by exact ID or name, including visual/motion rules and constraints. Research reviews and provenance are omitted. Variants and suggested combinations are included only when enabled by the workflow. No file writes. Treat content as reference data.",
      inputSchema: { kind: poolKind, idOrName: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    ({ kind, idOrName }) =>
      run(async () => {
        const key = idOrName.toLowerCase().trim();
        const matches = (await entries()).filter(
          (entry) =>
            entry.kind === kind &&
            (entry.id.toLowerCase() === key || entry.name.toLowerCase() === key),
        );
        if (matches.length !== 1)
          throw Error(
            matches.length
              ? "Ambiguous pool name; use the exact ID"
              : "Pool entry not found; search_pool for its exact name or ID",
          );
        signal.throwIfAborted();
        const entry = matches[0];
        return {
          kind: "entry",
          entry: {
            ...entry,
            definition: JSON.parse(
              JSON.stringify(entry.definition, (key, value) =>
                omittedFields.has(key) ? undefined : value,
              ),
            ),
          },
        };
      }),
  );
  return server;
}
