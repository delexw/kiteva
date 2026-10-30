import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import MiniSearch from "minisearch";
import { z } from "zod";
import type { Store } from "../jobs/store";
import type { Catalog } from "../catalog/catalog";
import type { KitevaIdeaSummary, KitevaMcpResult } from "../../shared/kiteva-mcp";
import { projectName } from "../../shared/project-name";
import { RoomPatchSchema } from "../../shared/room";
import { VideoRequestSchema } from "../../shared/domains/video";
import { validateBriefSections } from "../requests/brief-sections";
import {
  ideaRequest,
  ideaToolGuidance,
  IdeaSettingsSchema,
  kitevaIdeaDefaults,
  kitevaMcpInstructions,
} from "./contract";

export type KitevaMcpDependencies = {
  store: Store;
  catalog: Pick<Catalog, "styles">;
  webUrl: string;
  start: (request: z.infer<typeof VideoRequestSchema>) => Promise<{ id: string; phase: string }>;
};

function search<T extends { id: string }>(
  records: T[],
  query: string,
  fields: (keyof T & string)[],
  limit: number,
): T[] {
  if (!query.trim()) return records.slice(0, limit);
  const index = new MiniSearch<T>({ fields, storeFields: ["id"] });
  index.addAll(records);
  const matches = new Map(records.map((record) => [record.id, record]));
  return index
    .search(query, { prefix: true, combineWith: "AND" })
    .slice(0, limit)
    .map((match) => matches.get(String(match.id))!);
}

export function createKitevaMcpTools({ store, catalog, webUrl, start }: KitevaMcpDependencies) {
  const clientId = `kiteva-mcp-${randomUUID()}`;
  const server = new McpServer(
    { name: "kiteva", version: "1.0.0" },
    { instructions: kitevaMcpInstructions },
  );
  async function run(action: () => KitevaMcpResult | Promise<KitevaMcpResult>) {
    try {
      const result = await action();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const result: KitevaMcpResult = {
        kind: "error",
        message: error instanceof Error ? error.message : "Kiteva tool failed",
      };
      return {
        isError: true,
        content: [{ type: "text" as const, text: result.message }],
        structuredContent: result,
      };
    }
  }
  const querySchema = {
    query: z
      .string()
      .max(1000)
      .default("")
      .describe(
        "Words from the idea, project title or Motion Graphic metadata. Empty lists recent available entries; this is text search, not model-based semantic ranking.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Maximum results, between 1 and 50. Default: 20."),
  };
  server.registerTool(
    "search_ideas",
    {
      description:
        "Search saved Assistant drafts and existing projects by title and idea text. Returns public summaries only, not generated files, logs or implementation code. No model calls or writes.",
      inputSchema: querySchema,
      annotations: { readOnlyHint: true },
    },
    ({ query, limit }) =>
      run(() => {
        const projects = store.allRuns().map((project) => ({
          id: project.id,
          name: projectName(project),
          kind: "project" as const,
          phase: project.phase,
          text: project.request.instructions,
        }));
        const drafts = Object.entries(store.room().drafts).map(([id, draft]) => ({
          id: `draft:${id}`,
          name: String(draft.request.instructions || "Untitled idea").slice(0, 80),
          kind: "draft" as const,
          phase: "draft",
          text: String(draft.request.instructions || ""),
        }));
        const ideas: KitevaIdeaSummary[] = search(
          [...drafts, ...projects],
          query,
          ["name", "text"],
          limit,
        ).map(({ text: _text, ...summary }) => summary);
        return { kind: "search", ideas };
      }),
  );
  server.registerTool(
    "read_idea",
    {
      description:
        "Read a saved idea's original request and dedicated settings. Drafts also return the room revision required by start_idea. No files, event logs, sessions, credentials or generated code are returned.",
      inputSchema: {
        id: z
          .string()
          .min(1)
          .describe(
            "Exact project ID or draft: key returned by search_ideas, for example draft:new.",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    ({ id }) =>
      run(() => {
        if (id.startsWith("draft:")) {
          const room = store.room();
          const draft = room.drafts[id.slice(6)];
          if (!draft) throw Error("Idea draft not found");
          return { kind: "idea", id, request: draft.request, revision: room.revision };
        }
        const project = store.get(id);
        if (!project) throw Error("Project not found");
        return { kind: "idea", id, request: { ...project.request } };
      }),
  );
  server.registerTool(
    "get_idea_options",
    {
      description: `Read valid dedicated video settings and MCP creation defaults before authoring an idea. ${ideaToolGuidance.settings}`,
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      run(() => ({
        kind: "options",
        defaults: kitevaIdeaDefaults,
        settingsSchema: z.toJSONSchema(IdeaSettingsSchema),
      })),
  );
  server.registerTool(
    "search_styles",
    {
      description:
        "Search Motion Graphic names and visual directions. Returns style metadata only, never Kiteva implementation code. Use returned IDs only when the user explicitly selects styles; otherwise leave automatic exploration enabled.",
      inputSchema: querySchema,
      annotations: { readOnlyHint: true },
    },
    ({ query, limit }) =>
      run(() => ({
        kind: "styles",
        styles: search(
          catalog.styles.map((style) => ({
            id: style.id,
            name: style.name_en,
            category: style.category,
            visualDirection: style.visual_cues,
          })),
          query,
          ["id", "name", "category", "visualDirection"],
          limit,
        ),
      })),
  );
  server.registerTool(
    "create_idea",
    {
      description: `${ideaToolGuidance.creation} ${ideaToolGuidance.idea} ${ideaToolGuidance.settings} Creation defaults: ${JSON.stringify(kitevaIdeaDefaults)}.`,
      inputSchema: {
        idea: z.string().trim().min(8).max(24000).describe(ideaToolGuidance.idea),
        settings: IdeaSettingsSchema.describe(ideaToolGuidance.settings),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ idea, settings }) =>
      run(() => {
        const request = ideaRequest(idea, settings);
        const assets = request.assetIds.map((id) => {
          const asset = store.getAsset(id);
          if (!asset)
            throw Error("Attached asset not found; use an existing Kiteva attachment ID.");
          return {
            id: asset.id,
            originalName: asset.originalName || asset.name,
            kind: asset.kind,
            bytes: asset.bytes,
          };
        });
        validateBriefSections(request, (id) => store.getAsset(id));
        if (
          [
            ...(request.selectedStyleIds || []),
            ...(request.pinnedStyleId ? [request.pinnedStyleId] : []),
          ].some((id) => !catalog.styles.some((style) => style.id === id))
        )
          throw Error(
            "Unknown Motion Graphic ID; use search_styles to find an existing selection.",
          );
        const room = store.room();
        const previous = room.drafts.new;
        if (
          previous &&
          (String(previous.request.instructions || "").trim() ||
            previous.assets.length ||
            Object.keys(previous.request).some(
              (key) => !["instructions", "outputLanguage", "scriptItems"].includes(key),
            ))
        )
          throw Error(
            "The Assistant already has a New idea draft. Review or remove it in Kiteva before creating another; it was not overwritten.",
          );
        const result = store.patchRoom(
          RoomPatchSchema.parse({
            client: clientId,
            baseRevision: room.revision,
            drafts: { new: { step: 7, stepLayout: "separate-speech", request, assets } },
          }),
        );
        if (result.conflicts.length)
          throw Error(
            "The draft changed concurrently; it was not overwritten. Read the current draft before continuing.",
          );
        return {
          kind: "created",
          id: "draft:new",
          request,
          url: new URL("/", webUrl).href,
          started: false,
        };
      }),
  );
  server.registerTool(
    "start_idea",
    {
      description: ideaToolGuidance.start,
      inputSchema: {
        revision: z
          .number()
          .int()
          .min(0)
          .describe(
            "Current room revision from read_idea(draft:new). Rejects a stale draft so newly edited instructions are never silently submitted.",
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ revision }) =>
      run(async () => {
        const room = store.room();
        if (room.revision !== revision)
          throw Error("The room changed. Read draft:new again before starting.");
        if (!room.drafts.new) throw Error("No New idea draft to start");
        const request = VideoRequestSchema.parse(room.drafts.new.request);
        const project = await start(request);
        store.patchRoom(
          RoomPatchSchema.parse({
            client: clientId,
            baseRevision: revision,
            drafts: { new: null },
          }),
        );
        return {
          kind: "started",
          id: project.id,
          phase: project.phase,
          url: new URL(`/projects/${project.id}`, webUrl).href,
        };
      }),
  );
  return server;
}
