import { expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ query: vi.fn(), codex: vi.fn(), events: vi.fn() }));
vi.mock("../src/server/agents/caveman", () => ({
  cavemanRuntime: async () => ({
    url: "http://127.0.0.1:4321",
    env: { CAVEMAN_HOME: "/app/.data/caveman" },
    mcp: {
      command: "/app/.data/caveman/bin/caveman-mcp",
      args: [],
      env: { CAVEMAN_HOME: "/app/.data/caveman" },
    },
  }),
  codexCavemanAuth: async () => ({ auth_mode: "chatgpt" }),
  codexCavemanProvider: (url: string) => ({
    name: "Caveman",
    base_url: `${url}/chatgpt`,
    wire_api: "responses",
    requires_openai_auth: true,
  }),
}));
vi.mock("../src/server/agents/sdk-home", () => ({ isolatedCodexHome: async () => "/isolated" }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => Object.assign(sdk.query(...args), { close: vi.fn() }),
}));
vi.mock("@openai/codex-sdk", () => ({
  Codex: class {
    constructor(options: unknown) {
      sdk.codex(options);
    }
    startThread() {
      return { runStreamed: async () => ({ events: sdk.events() }) };
    }
    resumeThread() {
      return this.startThread();
    }
  },
}));
import { claudeAgent } from "../src/server/agents/claude-agent";
import { codexAgent } from "../src/server/agents/codex-agent";
const options = {
  workspace: "/job",
  signal: new AbortController().signal,
  prompt: "Return an answer",
  systemPrompt: "Follow schema",
  jsonSchema: { type: "object" as const },
  onEvent: vi.fn(),
  model: "selected-model",
  textOnly: true,
};
it("routes Claude SDK turns and registers recovery even for text-only calls", async () => {
  sdk.query.mockImplementation(async function* () {
    yield { type: "result", subtype: "success", structured_output: {}, session_id: "session" };
  });
  await claudeAgent.run(options);
  const config = sdk.query.mock.calls.at(-1)?.[0].options;
  expect(config.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:4321/w/claude");
  expect(config.env.CAVEMAN_HOME).toBe(config.mcpServers.caveman.env.CAVEMAN_HOME);
  expect(config.mcpServers.caveman.alwaysLoad).toBe(true);
  expect(config.tools).toEqual([]);
  expect(config.model).toBe("selected-model");
});
it("routes Codex through the subscription lane and permits only Caveman recovery during text-only work", async () => {
  sdk.events.mockImplementation(async function* () {
    yield {
      type: "item.completed",
      item: { type: "mcp_tool_call", server: "caveman", tool: "caveman_retrieve", id: "recovery" },
    };
    yield { type: "item.completed", item: { type: "agent_message", id: "answer", text: "{}" } };
    yield { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 2 } };
  });
  await expect(codexAgent.run(options)).resolves.toMatchObject({ result: {} });
  const config = sdk.codex.mock.calls.at(-1)?.[0];
  expect(config.config.model_providers.caveman.base_url).toBe("http://127.0.0.1:4321/chatgpt");
  expect(config.config.mcp_servers.caveman.enabled_tools).toEqual(["caveman_retrieve"]);
  expect(config.env.CODEX_HOME).toBe("/isolated");
  expect(config.env.CAVEMAN_HOME).toBe("/app/.data/caveman");
});
it("still rejects other MCP calls during text-only work", async () => {
  sdk.events.mockImplementation(async function* () {
    yield {
      type: "item.completed",
      item: { type: "mcp_tool_call", server: "other", tool: "write", id: "other" },
    };
  });
  await expect(codexAgent.run(options)).rejects.toThrow("text-only model response");
});
