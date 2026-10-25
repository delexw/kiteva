import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadCatalog } from "../../../catalog/catalog";
import { technologyPool } from "../../../../shared/technology-pool";
import type { CreativePoolEntry, CreativePoolResult } from "./types";
import { projectTechnologyRoot } from "../../../technology/project-runtime";
import { technologyEnvironment, technologyExecutableKey } from "../../../technology/availability";
import { prepareTechnology, prepareTechnologyStylesheet } from "../../../technology/prepare";

const poolKind = z.enum(["motion_graphic", "motion", "technology"]);

export function createCreativePoolTools(
  signal: AbortSignal,
  includeAlternatives = true,
  options: { workspace?: string; readOnly?: boolean } = {},
) {
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
  server.registerTool(
    "inspect_technologies",
    {
      description:
        "Check current local availability and loading requirements for chosen technology IDs, or all pool technologies if omitted. Distinguishes packages, native capabilities, offline tools, techniques and assets. No installs, files or mandatory technology choices.",
      inputSchema: {
        ids: z.array(z.string().min(1)).max(100).optional(),
        runtimeDirectory: z.string().optional(),
        pythonExecutable: z.string().optional(),
        executables: z.record(z.string(), z.string()).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ ids, runtimeDirectory, pythonExecutable, executables }) =>
      run(async () => {
        const root = options.workspace
          ? await projectTechnologyRoot(options.workspace, runtimeDirectory)
          : undefined;
        const env = { ...process.env };
        if (pythonExecutable) {
          if (!options.workspace)
            throw Error("A project workspace is required for a prepared Python executable");
          const directory = await projectTechnologyRoot(
            options.workspace,
            path.dirname(pythonExecutable),
          );
          const executable = path.join(directory, path.basename(pythonExecutable));
          env.KITEVA_TECHNOLOGY_PYTHON = executable;
        }
        for (const [id, relative] of Object.entries(executables || {})) {
          const key = technologyExecutableKey(id);
          if (!key || !options.workspace)
            throw Error("Choose a catalog executable and project-relative path");
          const directory = await projectTechnologyRoot(options.workspace, path.dirname(relative));
          env[`KITEVA_TECHNOLOGY_${key.toUpperCase()}`] = path.join(
            directory,
            path.basename(relative),
          );
        }
        const environment = technologyEnvironment(root, env);
        return {
          kind: "availability",
          technologies: await Promise.all(
            (ids ?? Object.keys(technologyPool)).map((id) => environment.inspect(id)),
          ),
        };
      }),
  );

  if (options.workspace && options.readOnly === false) {
    const workspace = options.workspace;
    server.registerTool(
      "prepare_technology",
      {
        description:
          "Bundle a chosen browser package from a model-prepared project runtimeDirectory. Returns usable import/CSS/asset paths. Does not install packages or use Kiteva’s dependencies. For Python, CLI and other tools, use their prepared project environment directly.",
        inputSchema: { id: z.string().min(1), runtimeDirectory: z.string().optional() },
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      ({ id, runtimeDirectory }) =>
        run(async () => ({
          kind: "prepared",
          technology: await prepareTechnology(
            id,
            workspace,
            signal,
            await projectTechnologyRoot(workspace, runtimeDirectory),
          ),
        })),
    );
    server.registerTool(
      "prepare_technology_stylesheet",
      {
        description:
          "Bundle a chosen technology's package-relative CSS file and its local assets into the project, from a model-prepared project runtimeDirectory; no installation. Use when its canonical integration needs a stylesheet.",
        inputSchema: {
          id: z.string().min(1),
          stylesheet: z.string().min(1),
          runtimeDirectory: z.string().optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      ({ id, stylesheet, runtimeDirectory }) =>
        run(async () => ({
          kind: "stylesheet",
          technology: await prepareTechnologyStylesheet(
            id,
            stylesheet,
            workspace,
            signal,
            await projectTechnologyRoot(workspace, runtimeDirectory),
          ),
        })),
    );
  }
  return server;
}
