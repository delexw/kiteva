import { websiteCaptureInstructions } from "../src/server/requests/reference-browser-instructions";
vi.mock("../src/server/agents/bundled-skills", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/agents/bundled-skills")>()),
  prepareBundledSkills: vi.fn(),
}));
import { afterEach, expect, it, vi } from "vitest";
afterEach(() => vi.unstubAllEnvs());
vi.mock("../src/server/agents/caveman", () => ({
  cavemanSettings: () => ({ enabled: false }),
  cavemanRuntime: async () => undefined,
}));
import { z } from "zod";
const calls = vi.hoisted(() => ({ codex: vi.fn(), query: vi.fn(), streamedPrompt: vi.fn() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => Object.assign(calls.query(...args), { close: vi.fn() }),
}));
vi.mock("./../src/server/agents/sdk-home", () => ({
  isolatedCodexHome: async () => "/isolated-home",
}));
vi.mock("@openai/codex-sdk", () => ({
  Codex: class {
    constructor(options: unknown) {
      calls.codex(options);
    }
    startThread() {
      return {
        runStreamed: async (prompt: string) => {
          calls.streamedPrompt(prompt);
          return {
            events: (async function* () {
              yield {
                type: "item.completed",
                item: { id: "answer", type: "agent_message", text: '{"message":"done"}' },
              };
              yield { type: "turn.completed", usage: {} };
            })(),
          };
        },
      };
    }
  },
}));
import { enabledReferenceTools } from "../src/server/requests/reference-browser-contracts";
import { agentTurn } from "../src/server/agents/providers";
import { visualReadabilityRules } from "../src/server/agents/visual-readability";

it.each(["claude", "codex"] as const)(
  "gives %s a job-scoped screenshot MCP server without enabling general network access",
  async (provider) => {
    calls.query.mockClear();
    calls.codex.mockClear();
    calls.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: "session",
        usage: {},
        modelUsage: {},
      };
    });
    const onEvent = vi.fn();
    await agentTurn({
      provider,
      workspace: "/job",
      referenceUrls: ["https://example.com/"],
      schema: z.object({ message: z.string() }),
      signal: new AbortController().signal,
      readOnly: true,
      onEvent,
      prompt: "Inspect the reference",
    });
    const options =
      provider === "claude"
        ? calls.query.mock.calls[0][0].options
        : calls.codex.mock.calls[0][0].config;
    const effectivePrompt =
      provider === "claude" ? options.systemPrompt : calls.streamedPrompt.mock.calls.at(-1)?.[0];
    expect(effectivePrompt).toContain("you MUST explore relevant navigation controls");
    expect(effectivePrompt).toContain("NOT YET CAPTURED DOES NOT MEAN UNAVAILABLE");
    expect(effectivePrompt).toContain("The main model chooses the production plan during building");
    expect(effectivePrompt).toContain("not mandatory screenshots for every future interaction");
    expect(effectivePrompt).toContain("pending lyric generation is not a missing uploaded asset");
    expect(effectivePrompt).toContain("do not log in");
    const server =
      provider === "claude"
        ? options.mcpServers.reference_browser
        : options.mcp_servers.reference_browser;
    expect(server.command).toBe(process.execPath);
    expect(JSON.parse(server.args.at(-1))).toMatchObject({
      workspace: "/job",
      urls: ["https://example.com/"],
    });
    expect(server.args).toEqual(
      expect.arrayContaining([expect.stringContaining("reference-browser-server.ts")]),
    );
    if (provider === "codex") {
      expect(server.enabled_tools).toEqual([
        "inspect_page",
        "click_control",
        "capture_screenshot",
        "scroll_page",
        "browser_navigate",
        "browser_frames",
        "browser_wait",
        "browser_diagnostics",
        "browser_capture",
      ]);
      expect(server.tools).toEqual({
        inspect_page: { approval_mode: "approve" },
        click_control: { approval_mode: "approve" },
        capture_screenshot: { approval_mode: "approve" },
        scroll_page: { approval_mode: "approve" },
        browser_navigate: { approval_mode: "approve" },
        browser_frames: { approval_mode: "approve" },
        browser_wait: { approval_mode: "approve" },
        browser_diagnostics: { approval_mode: "approve" },
        browser_capture: { approval_mode: "approve" },
      });
    }
    if (provider === "claude") {
      expect(options.hooks.PreToolUse).toEqual([
        { matcher: "^(Agent|Task)$", hooks: [expect.any(Function)] },
        { matcher: "^Bash$", hooks: [expect.any(Function)] },
      ]);
      expect(options.strictMcpConfig).toBe(true);
      expect(options.settingSources).toEqual([]);
      expect(options.tools).toEqual(["Read", "Glob", "Grep", "Skill"]);
      expect(await options.canUseTool("Bash", {})).toMatchObject({ behavior: "deny" });
      expect(
        await options.canUseTool("mcp__reference_browser__capture_screenshot", {}),
      ).toMatchObject({ behavior: "allow" });
    }
  },
);
it("does not attach browser tools to text-only extraction", async () => {
  calls.query.mockClear();
  calls.query.mockImplementation(async function* () {
    yield {
      type: "result",
      subtype: "success",
      is_error: false,
      structured_output: { message: "done" },
      session_id: "session",
      usage: {},
      modelUsage: {},
    };
  });
  await agentTurn({
    provider: "claude",
    workspace: "/job",
    referenceUrls: ["https://example.com/"],
    textOnly: true,
    schema: z.object({ message: z.string() }),
    signal: new AbortController().signal,
    onEvent: vi.fn(),
    prompt: "Summarize",
  });
  expect(calls.query.mock.calls[0][0].options.mcpServers).toEqual({});
  expect(calls.query.mock.calls[0][0].options.tools).toEqual([]);
});
it.each(["claude", "codex"] as const)(
  "enables native section subagents only for %s brief preparation",
  async (provider) => {
    calls.query.mockClear();
    calls.codex.mockClear();
    calls.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: "session",
        usage: {},
        modelUsage: {},
      };
    });
    await agentTurn({
      provider,
      workspace: "/job",
      schema: z.object({ message: z.string() }),
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      prompt: "Explore sections",
      model: "cheap-model",
      readOnly: true,
      exploreBriefSections: true,
    });
    if (provider === "claude") {
      const options = calls.query.mock.calls[0][0].options;
      expect(options.tools).toContain("Agent");
      expect(Object.keys(options.agents)).toHaveLength(4);
      expect(options.agents["main-brief"].model).toBe("cheap-model");
      expect(await options.canUseTool("Bash", {})).toMatchObject({ behavior: "deny" });
    } else
      expect(calls.codex.mock.calls[0][0].config).toMatchObject({
        features: { multi_agent: true },
        agents: { max_threads: 1, max_depth: 1 },
      });
  },
);
it.each(["claude", "codex"] as const)(
  "stores complete versioned context and tells %s to read it instead of inlining JSON",
  async (provider) => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const workspace = await mkdtemp(join(tmpdir(), "prompt-context-"));
    calls.query.mockClear();
    calls.codex.mockClear();
    calls.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: "session",
        usage: {},
        modelUsage: {},
      };
    });
    vi.stubEnv("EXAMPLE_SECRET", "private-context-secret");
    try {
      const events: unknown[] = [];
      for (let attempt = 0; attempt < 2; attempt++)
        await agentTurn({
          provider,
          workspace,
          readOnly: true,
          prompt: "Fix the single assigned issue.",
          promptContext: { draft: "x".repeat(20000), attempt, secret: "private-context-secret" },
          schema: z.object({ message: z.string() }),
          signal: new AbortController().signal,
          onEvent: (event) => {
            if (event.type === "invocation") events.push(event.data);
          },
        });
      const files = events.map((event) => {
        const user = (event as { prompt: { user: string } }).prompt.user;
        expect(user).not.toContain('"draft":');
        expect(user.length).toBeLessThan(1000);
        return user.match(/prompt-inputs\/[\w-]+\.json/)![0];
      });
      expect(files[0]).not.toBe(files[1]);
      for (const [index, file] of files.entries()) {
        const context = JSON.parse(await readFile(join(workspace, file), "utf8"));
        expect(context.draft.length).toBe(20000);
        expect(context.attempt).toBe(index);
        expect(context.secret).not.toBe("private-context-secret");
      }
    } finally {
      vi.unstubAllEnvs();
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
it("rejects file context on tool-disabled calls rather than silently dropping evidence", async () => {
  await expect(
    agentTurn({
      provider: "claude",
      workspace: "/job",
      textOnly: true,
      promptContext: { evidence: "Must be read" },
      prompt: "Review",
      schema: z.object({ message: z.string() }),
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    }),
  ).rejects.toThrow("requires file-reading tools");
});

it.each(["claude", "codex"] as const)(
  "exposes built-in capture to %s implementation without a Motion Graphic requirement",
  async (provider) => {
    calls.query.mockClear();
    calls.codex.mockClear();
    calls.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: "capture",
        usage: {},
        modelUsage: {},
      };
    });
    await agentTurn({
      provider,
      workspace: "/job",
      referenceUrls: ["https://example.com/"],
      schema: z.object({ message: z.string() }),
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      prompt: "Capture a website demo",
    });
    const options =
      provider === "claude"
        ? calls.query.mock.calls[0][0].options
        : calls.codex.mock.calls[0][0].config;
    const prompt =
      provider === "claude" ? options.systemPrompt : calls.streamedPrompt.mock.calls.at(-1)?.[0];
    expect(prompt).toContain(websiteCaptureInstructions);
    const server =
      provider === "claude"
        ? options.mcpServers.reference_browser
        : options.mcp_servers.reference_browser;
    expect(JSON.parse(server.args.at(-1))).toMatchObject({ enableVideoCapture: true });
    if (provider === "codex") expect(server.enabled_tools).toEqual(enabledReferenceTools());
  },
);

it.each(["claude", "codex"] as const)(
  "registers stage-scoped React Bits tools for %s through the existing governed invocation",
  async (provider) => {
    for (const readOnly of [true, false]) {
      calls.query.mockClear();
      calls.codex.mockClear();
      calls.query.mockImplementation(async function* () {
        yield {
          type: "stream_event",
          event: {
            type: "content_block_start",
            content_block: {
              type: "tool_use",
              id: "component",
              name: "mcp__react_bits__search_components",
            },
          },
        };
        yield {
          type: "result",
          subtype: "success",
          is_error: false,
          structured_output: { message: "done" },
          session_id: "components",
          usage: { input_tokens: 17, output_tokens: 4 },
          total_cost_usd: 0.001,
          modelUsage: {},
        };
      });
      const onEvent = vi.fn();
      await agentTurn({
        provider,
        workspace: "/job",
        readOnly,
        schema: z.object({ message: z.string() }),
        signal: new AbortController().signal,
        onEvent,
        prompt: "Find a useful component",
      });
      const options =
        provider === "claude"
          ? calls.query.mock.calls[0][0].options
          : calls.codex.mock.calls[0][0].config;
      const server =
        provider === "claude" ? options.mcpServers.react_bits : options.mcp_servers.react_bits;
      expect(JSON.parse(server.args.at(-1))).toEqual({ workspace: "/job", readOnly });
      const names = [
        "search_components",
        "read_component",
        ...(!readOnly ? ["install_component"] : []),
      ];
      if (provider === "codex") {
        expect(server.enabled_tools).toEqual(names);
        expect(Object.keys(server.tools)).toEqual(names);
      } else {
        expect(await options.canUseTool("mcp__react_bits__install_component", {})).toMatchObject({
          behavior: readOnly ? "deny" : "allow",
        });
        expect(server.alwaysLoad).toBe(true);
      }
      const invocation = onEvent.mock.calls
        .map(([event]) => event)
        .find((event) => event.type === "invocation");
      const usage = onEvent.mock.calls
        .map(([event]) => event)
        .find((event) => event.type === "usage");
      expect(invocation.data.prompt.system).toContain("REACT BITS COMPONENT CAPABILITY");
      expect(usage.data).toMatchObject({
        provider,
        invocationId: invocation.data.invocationId,
        model: expect.any(String),
      });
      if (provider === "claude") expect(usage.data.cost).toBe(0.001);
    }
  },
);

it.each(["claude", "codex"] as const)(
  "keeps %s music composition in the main invocation when optional Audio Studio is unavailable",
  async (provider) => {
    vi.stubEnv("AUDIO_STUDIO_MCP_COMMAND", "/unavailable/audio-studio-mcp");
    calls.query.mockClear();
    calls.codex.mockClear();
    const onEvent = vi.fn();
    await agentTurn({
      provider,
      workspace: "/job",
      schema: z.object({ message: z.string() }),
      signal: new AbortController().signal,
      prompt: "Compose the requested instrumental with code",
      onEvent,
    });
    const options =
      provider === "claude"
        ? calls.query.mock.calls[0][0].options
        : calls.codex.mock.calls[0][0].config;
    const servers = provider === "claude" ? options.mcpServers : options.mcp_servers;
    expect(Object.keys(servers)).toEqual(["react_bits", "animate_ui", "creative_pool"]);
    const pool = servers.creative_pool;
    expect(provider === "claude" ? pool.args : pool.enabled_tools).toEqual(
      provider === "claude"
        ? expect.arrayContaining([expect.stringMatching(/creative-pool[/\\]server\.ts$/)])
        : ["search_pool", "read_pool_entry"],
    );
    expect(JSON.stringify(options)).not.toContain("FluidSynth");
    const invocation = onEvent.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === "invocation");
    expect(invocation.data.prompt.system).toContain(visualReadabilityRules);
  },
);
