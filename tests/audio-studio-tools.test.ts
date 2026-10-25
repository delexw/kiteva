import { mkdtemp, rm, writeFile, symlink, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createAudioStudioTools } from "../src/server/agents/capabilities/audio-studio/tools";
import { audioStudioCapability } from "../src/server/agents/capabilities/audio-studio/capability";
import { agentCapabilities } from "../src/server/agents/capabilities/registry";
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "audio-tools-"));
  const workspace = path.join(folder, "job");
  await writeFile(path.join(folder, "outside.wav"), "test");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(workspace);
  const source = path.join(workspace, "source.wav");
  await writeFile(source, "test");
  const remote = new Server(
    { name: "test-upstream", version: "1" },
    { capabilities: { tools: {} }, instructions: "Upstream audio instructions" },
  );
  const call = vi.fn(async (request) => ({
    content: [{ type: "text", text: JSON.stringify(request.params.arguments) }],
    structuredContent: { status: "done" },
  }));
  remote.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "process_audio",
        description: "Original argument ranges",
        inputSchema: {
          type: "object",
          properties: {
            input_audio: { type: "string" },
            start_seconds: { type: "number", minimum: 0 },
          },
          required: ["input_audio"],
        },
      },
      { name: "unapproved_tool", inputSchema: { type: "object" } },
    ],
  }));
  remote.setRequestHandler(CallToolRequestSchema, call);
  const upstream = new Client({ name: "upstream-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await remote.connect(a);
  await upstream.connect(b);
  const server = await createAudioStudioTools(workspace, upstream);
  const client = new Client({ name: "test-client", version: "1" });
  const [c, d] = InMemoryTransport.createLinkedPair();
  await server.connect(c);
  await client.connect(d);
  return {
    folder,
    workspace,
    source,
    client,
    call,
    close: async () => {
      await client.close();
      await server.close();
      await upstream.close();
      await remote.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
}
it("preserves upstream contracts and instructions and forwards workspace audio with structured output", async () => {
  const f = await fixture();
  try {
    expect(f.client.getInstructions()).toBe("Upstream audio instructions");
    const tools = await f.client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(["process_audio"]);
    expect(tools.tools[0].inputSchema.properties?.start_seconds).toEqual({
      type: "number",
      minimum: 0,
    });
    const result = await f.client.callTool({
      name: "process_audio",
      arguments: { input_audio: "source.wav", start_seconds: 0.2 },
    });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      kind: "audio_studio_result",
      tool: "process_audio",
    });
    expect(f.call.mock.calls[0][0].params.arguments.input_audio).toBe(await realpath(f.source));
  } finally {
    await f.close();
  }
});
it.each(["relative", "absolute", "symlink"])(
  "rejects %s workspace escapes before calling upstream",
  async (kind) => {
    const f = await fixture();
    try {
      const outside = path.join(f.folder, "outside.wav");
      const link = path.join(f.workspace, "linked.wav");
      await symlink(outside, link);
      const input_audio =
        kind === "relative" ? "../outside.wav" : kind === "absolute" ? outside : link;
      const result = await f.client.callTool({ name: "process_audio", arguments: { input_audio } });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ kind: "error" });
      expect(f.call).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  },
);
it("registers build-only audio tools independently of the visual capability", () => {
  vi.stubEnv("AUDIO_STUDIO_MCP_COMMAND", process.execPath);
  expect(audioStudioCapability("/tmp/example-job")?.enabledTools).toContain("generate_audio");
  expect(agentCapabilities("/tmp/example-job").servers.audio_studio).toBeDefined();
  expect(agentCapabilities("/tmp/example-job", true).servers.audio_studio).toBeUndefined();
  expect(agentCapabilities("/tmp/example-job", false, true).servers.audio_studio).toBeUndefined();
  vi.stubEnv("AUDIO_STUDIO_MCP_COMMAND", "/nonexistent/audio-studio-mcp");
  expect(audioStudioCapability("/tmp/example-job")).toBeUndefined();
});

it("keeps the audio service home independent of the SDK home for model-cache reuse", () => {
  vi.stubEnv("AUDIO_STUDIO_MCP_COMMAND", process.execPath);
  vi.stubEnv("HOME", "/configured-service-home");
  expect(audioStudioCapability("/tmp/example-job")?.env).toMatchObject({
    HOME: "/configured-service-home",
    ...(process.platform === "win32" ? { USERPROFILE: "/configured-service-home" } : {}),
  });
});
