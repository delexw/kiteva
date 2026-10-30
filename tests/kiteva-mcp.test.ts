import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { Store } from "../src/server/jobs/store";
import { loadCatalog } from "../src/server/catalog/catalog";
import { createKitevaMcpTools } from "../src/server/mcp/tools";
import {
  IdeaSettingsSchema,
  ideaRequest,
  kitevaIdeaDefaults,
  ideaToolGuidance,
} from "../src/server/mcp/contract";
import { RoomPatchSchema } from "../src/shared/room";
import { defaultProviderModels } from "../src/shared/model-display-name";
import type { Run } from "../src/shared/contracts";
import { roomDraftRequest, roomSubmission } from "../src/client/room/onboarding";
import { registerKitevaMcpRoutes } from "../src/server/mcp/routes";
import { kitevaMcpPath } from "../src/shared/kiteva-mcp";
import { DEFAULT_WEB_PORT } from "../src/shared/local-ports";

const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function connect() {
  const store = new Store(":memory:");
  cleanup.push(() => store.close());
  const start = vi.fn(async () => ({ id: "new-project", phase: "queued" }));
  const server = createKitevaMcpTools({
    store,
    catalog: await loadCatalog(),
    webUrl: `http://127.0.0.1:${DEFAULT_WEB_PORT}`,
    start,
  });
  const client = new Client({ name: "idea-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  cleanup.push(
    () => server.close(),
    () => client.close(),
  );
  return { store, client, start };
}

it("saves the requested defaults at Review without starting a build", async () => {
  const { store, client, start } = await connect();
  const result = await client.callTool({
    name: "create_idea",
    arguments: { idea: "Explain how a city prepares for spring." },
  });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({
    kind: "created",
    started: false,
    id: "draft:new",
    request: kitevaIdeaDefaults,
  });
  expect(store.room().drafts.new).toMatchObject({
    step: 7,
    request: { instructions: "Explain how a city prepares for spring.", ...kitevaIdeaDefaults },
  });
  expect(start).not.toHaveBeenCalled();
  expect(store.allRuns()).toEqual([]);
  expect(roomSubmission(roomDraftRequest(store.room().drafts.new))).toMatchObject(
    kitevaIdeaDefaults,
  );
});

it("uses one settings contract for server instructions, tool descriptions and runtime defaults", async () => {
  const { client } = await connect();
  const tools = (await client.listTools()).tools;
  const create = tools.find((tool) => tool.name === "create_idea")!;
  expect(create.description).toContain(ideaToolGuidance.creation);
  expect(create.description).toContain(ideaToolGuidance.settings);
  expect(client.getInstructions()).toContain(ideaToolGuidance.idea);
  const schema = create.inputSchema.properties?.settings as {
    properties: Record<string, { description?: string; default?: unknown }>;
  };
  for (const field of Object.values(schema.properties))
    expect(field.description?.length).toBeGreaterThan(10);
  for (const [field, value] of Object.entries(kitevaIdeaDefaults)) {
    if (field !== "mainModel") expect(schema.properties[field].default).toBe(value);
  }
  const options = await client.callTool({ name: "get_idea_options" });
  expect(options.isError).not.toBe(true);
  expect(options.structuredContent).toMatchObject({
    kind: "options",
    defaults: kitevaIdeaDefaults,
  });
});

it("preserves explicit choices and uses the selected provider's actual default model", () => {
  const settings = IdeaSettingsSchema.parse({
    provider: "codex",
    resolution: "1080p",
    frameRate: 30,
    renderer: "hyperframes",
    preference: "context",
    candidateCount: 2,
    duration: 120,
  });
  expect(ideaRequest("A springtime city story", settings)).toMatchObject({
    ...settings,
    mainModel: defaultProviderModels.codex,
    duration: 120,
  });
  expect(
    ideaRequest("A springtime city story", { mainModel: "explicit-main-model" }).mainModel,
  ).toBe("explicit-main-model");
});

it("rejects unknown settings and applies canonical cross-field validation", async () => {
  const { store, client } = await connect();
  for (const settings of [
    { resolution: "4k" },
    { unexpected: true },
    { candidateCount: 0 },
    { selectedStyleIds: ["style-999"] },
    { assetIds: ["11111111-1111-4111-8111-111111111111"] },
  ]) {
    const result = await client.callTool({
      name: "create_idea",
      arguments: { idea: "A springtime city story", settings },
    });
    expect(result.isError).toBe(true);
    expect(store.room().drafts.new).toBeUndefined();
  }
});

it("never replaces an existing new idea or alters other drafts", async () => {
  const { store, client } = await connect();
  store.patchRoom(
    RoomPatchSchema.parse({
      client: "browser",
      baseRevision: 0,
      drafts: {
        new: { request: { instructions: "My unsaved idea" } },
        "edit:existing": { request: { instructions: "Keep this too" } },
      },
    }),
  );
  const before = store.room();
  const result = await client.callTool({
    name: "create_idea",
    arguments: { idea: "Another new idea" },
  });
  expect(result.isError).toBe(true);
  expect(store.room()).toEqual(before);
});

it("does not overwrite a draft created by another client between read and save", async () => {
  const { store, client } = await connect();
  const patch = store.patchRoom.bind(store);
  vi.spyOn(store, "patchRoom").mockImplementationOnce((incoming) => {
    patch(
      RoomPatchSchema.parse({
        client: "other-agent",
        baseRevision: 0,
        drafts: { new: { request: { instructions: "A concurrently saved idea" } } },
      }),
    );
    return patch(incoming);
  });
  const result = await client.callTool({
    name: "create_idea",
    arguments: { idea: "A different new idea" },
  });
  expect(result.isError).toBe(true);
  expect(store.room().drafts.new.request.instructions).toBe("A concurrently saved idea");
});

it("attaches public source metadata without exposing local file locations", async () => {
  const { store, client } = await connect();
  const id = "11111111-1111-4111-8111-111111111111";
  store.asset({
    id,
    name: "source.pdf",
    originalName: "Source notes.pdf",
    path: "/private/source.pdf",
    kind: "application/pdf",
    bytes: 100,
  });
  const result = await client.callTool({
    name: "create_idea",
    arguments: {
      idea: "Explain the attached notes",
      settings: {
        assetIds: [id],
        requirements: { main: { assetIds: [id] }, images: {}, music: {}, urls: {} },
      },
    },
  });
  expect(result.isError).not.toBe(true);
  expect(store.room().drafts.new.assets).toEqual([
    { id, originalName: "Source notes.pdf", kind: "application/pdf", bytes: 100 },
  ]);
  expect(JSON.stringify(result)).not.toContain("/private/");
});

it("searches older projects as well as drafts without returning execution data", async () => {
  const { store, client } = await connect();
  for (let i = 0; i < 55; i++) {
    const run: Run = {
      id: `project-${i}`,
      request: ideaRequest(i === 0 ? "Secret garden animation" : `City animation ${i}`, {}),
      createdAt: new Date().toISOString(),
      phase: "ready",
      candidates: [],
      jobs: [],
    };
    store.save(run);
  }
  const result = await client.callTool({ name: "search_ideas", arguments: { query: "garden" } });
  expect(result.structuredContent).toMatchObject({
    kind: "search",
    ideas: [{ id: "project-0", name: "Secret garden animation" }],
  });
  expect(JSON.stringify(result)).not.toContain('"jobs"');
  const styles = await client.callTool({
    name: "search_styles",
    arguments: { query: "", limit: 2 },
  });
  expect(styles.structuredContent).toMatchObject({
    kind: "styles",
    styles: [{ id: expect.any(String) }, { id: expect.any(String) }],
  });
  expect(JSON.stringify(styles)).not.toContain("executable_prompt_template");
});

it("rejects a stale submission and only calls the build API on explicit start", async () => {
  const { store, client, start } = await connect();
  await client.callTool({ name: "create_idea", arguments: { idea: "A springtime city story" } });
  const stale = await client.callTool({ name: "start_idea", arguments: { revision: 0 } });
  expect(stale.isError).toBe(true);
  expect(start).not.toHaveBeenCalled();
  const read = await client.callTool({ name: "read_idea", arguments: { id: "draft:new" } });
  expect(read.structuredContent).toMatchObject({ kind: "idea", revision: store.room().revision });
  const result = await client.callTool({
    name: "start_idea",
    arguments: { revision: store.room().revision },
  });
  expect(result.structuredContent).toMatchObject({ kind: "started", id: "new-project" });
  expect(start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(kitevaIdeaDefaults));
  expect(store.room().drafts.new).toBeUndefined();
});

it("keeps the draft when starting fails and never silently retries", async () => {
  const { store, client, start } = await connect();
  await client.callTool({ name: "create_idea", arguments: { idea: "A springtime city story" } });
  start.mockRejectedValueOnce(Error("Backend unavailable"));
  const result = await client.callTool({
    name: "start_idea",
    arguments: { revision: store.room().revision },
  });
  expect(result.isError).toBe(true);
  expect(store.room().drafts.new).toBeDefined();
  expect(start).toHaveBeenCalledTimes(1);
});

it("preserves edits made while the previous draft is being submitted", async () => {
  const { store, client, start } = await connect();
  await client.callTool({ name: "create_idea", arguments: { idea: "A springtime city story" } });
  start.mockImplementationOnce(async () => {
    store.patchRoom(
      RoomPatchSchema.parse({
        client: "browser",
        baseRevision: store.room().revision,
        drafts: { new: { request: { instructions: "My newer edited idea" } } },
      }),
    );
    return { id: "submitted-project", phase: "queued" };
  });
  const result = await client.callTool({
    name: "start_idea",
    arguments: { revision: store.room().revision },
  });
  expect(result.structuredContent).toMatchObject({ kind: "started", id: "submitted-project" });
  expect(store.room().drafts.new.request.instructions).toBe("My newer edited idea");
});

async function httpApp() {
  const store = new Store(":memory:");
  const app = Fastify();
  const start = vi.fn(async () => ({ id: "http-project", phase: "queued" }));
  registerKitevaMcpRoutes(app, {
    store,
    catalog: await loadCatalog(),
    webUrl: `http://127.0.0.1:${DEFAULT_WEB_PORT}`,
    start,
  });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  cleanup.push(
    () => store.close(),
    () => app.close(),
  );
  const client = new Client({ name: "http-test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(kitevaMcpPath, address)));
  cleanup.push(() => client.close());
  return { store, app, client, start, address };
}

it("serves the full MCP protocol over the application's URL without a local launcher", async () => {
  const { client, store, start } = await httpApp();
  expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("create_idea");
  expect(client.getInstructions()).toContain(ideaToolGuidance.settings);
  const result = await client.callTool({ name: "get_idea_options" });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({ defaults: kitevaIdeaDefaults });
  const created = await client.callTool({
    name: "create_idea",
    arguments: { idea: "A springtime city story" },
  });
  expect(created.structuredContent).toMatchObject({ kind: "created", request: kitevaIdeaDefaults });
  expect(start).not.toHaveBeenCalled();
  const read = await client.callTool({ name: "read_idea", arguments: { id: "draft:new" } });
  expect(read.structuredContent).toMatchObject({ revision: store.room().revision });
  const started = await client.callTool({
    name: "start_idea",
    arguments: { revision: store.room().revision },
  });
  expect(started.structuredContent).toMatchObject({ kind: "started", id: "http-project" });
  expect(start).toHaveBeenCalledTimes(1);
});

it("rejects foreign origins and rebinding hosts at the HTTP boundary", async () => {
  const { app, start } = await httpApp();
  for (const headers of [
    { host: "example.com" },
    { host: "127.0.0.1", origin: "https://example.com" },
    { host: "127.0.0.1", origin: "null" },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: kitevaMcpPath,
      headers,
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(response.statusCode).toBe(403);
  }
  expect(start).not.toHaveBeenCalled();
});

it("rejects overlapping HTTP starts rather than creating duplicate builds", async () => {
  const { client, start, store } = await httpApp();
  await client.callTool({ name: "create_idea", arguments: { idea: "A springtime city story" } });
  let release: (value: { id: string; phase: string }) => void = () => {};
  start.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const first = client.callTool({
    name: "start_idea",
    arguments: { revision: store.room().revision },
  });
  await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  try {
    const second = await client.callTool({
      name: "start_idea",
      arguments: { revision: store.room().revision },
    });
    expect(second.isError).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
  } finally {
    release({ id: "http-project", phase: "queued" });
    await first;
  }
});
