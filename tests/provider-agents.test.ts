import { credentialEnvironmentVariables } from "../src/server/runtime/credential-environment";
import { projectRuntimeEnvironment } from "../src/server/runtime/project-files";
vi.mock("../src/server/agents/claude-home", () => ({
  prepareClaudeHome: async () => "/isolated-home",
  claudeLoginEnvironment: async () => ({
    [credentialEnvironmentVariables.claudeOauthToken]: "fixture-sdk-token",
  }),
}));
vi.mock("../src/server/agents/bundled-skills", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/agents/bundled-skills")>()),
  prepareBundledSkills: vi.fn(),
}));
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/agents/caveman", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/agents/caveman")>()),
  cavemanSettings: () => ({ enabled: false }),
  cavemanRuntime: sdk.cavemanRuntime,
  codexCavemanAuth: async () => ({ auth_mode: "apikey" }),
}));
import { z } from "zod";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

it.each(["claude", "codex"] as const)(
  "sends actual frame image content through the %s SDK",
  async (provider) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "sdk-frame-input-"));
    const image = path.join(workspace, "frame.png");
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8S8AAAAASUVORK5CYII=",
      "base64",
    );
    await writeFile(image, bytes);
    sdk.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: "vision-session",
        usage: {},
        modelUsage: {},
      };
    });
    sdk.codexEvents.mockImplementation(async function* () {
      yield { type: "thread.started", thread_id: "vision-session" };
      yield {
        type: "item.completed",
        item: { id: "answer", type: "agent_message", text: '{"message":"done"}' },
      };
      yield { type: "turn.completed", usage: {} };
    });
    try {
      await agentTurn({
        provider,
        workspace,
        prompt: "Assess the attached frame",
        images: [image],
        model: "selected-model",
        readOnly: true,
        schema: z.object({ message: z.literal("done") }),
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      });
      if (provider === "codex")
        expect(sdk.stream.mock.calls.at(-1)![0]).toEqual([
          expect.objectContaining({ type: "text" }),
          { type: "local_image", path: image },
        ]);
      else {
        const messages = [];
        for await (const message of sdk.query.mock.calls.at(-1)![0].prompt) messages.push(message);
        expect(messages[0].message.content).toEqual([
          { type: "text", text: expect.stringContaining("Assess the attached frame") },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: bytes.toString("base64") },
          },
        ]);
      }
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);

const sdk = vi.hoisted(() => ({
  query: vi.fn(),
  close: vi.fn(),
  codexEvents: vi.fn(),
  resume: vi.fn(),
  construct: vi.fn(),
  cavemanRuntime: vi.fn(),
  delay: vi.fn().mockResolvedValue(undefined),
  stream: vi.fn(),
  threadOptions: vi.fn(),
}));
afterEach(() => {
  sdk.close.mockReset();
  sdk.cavemanRuntime.mockReset();
  sdk.delay.mockReset().mockResolvedValue(undefined);
});
vi.mock("node:timers/promises", () => ({ setTimeout: sdk.delay }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => Object.assign(sdk.query(...args), { close: sdk.close }),
}));
vi.mock("../src/server/agents/sdk-home", () => ({
  isolatedCodexHome: async () => "/isolated-home",
}));
vi.mock("@openai/codex-sdk", () => ({
  Codex: class {
    constructor(options: unknown) {
      sdk.construct(options);
    }
    startThread(options?: unknown) {
      sdk.threadOptions(options);
      return {
        runStreamed: async (prompt: string, options: unknown) => {
          sdk.stream(prompt, options);
          return { events: sdk.codexEvents() };
        },
      };
    }
    resumeThread(sessionId: string, options?: unknown) {
      sdk.resume(sessionId);
      return this.startThread(options);
    }
  },
}));
import { claudeAgent } from "../src/server/agents/claude-agent";
import { codexAgent } from "../src/server/agents/codex-agent";
import { agentTurn } from "../src/server/agents/providers";
import { StructuredOutputError } from "../src/server/agents/structured-output-error";

it.each(["claude", "codex"] as const)(
  "preserves the %s response and session when application validation rejects structured output",
  async (provider) => {
    const output = { message: "done" };
    sdk.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: output,
        session_id: "rejected-session",
        usage: {},
        modelUsage: {},
      };
    });
    sdk.codexEvents.mockImplementation(async function* () {
      yield { type: "thread.started", thread_id: "rejected-session" };
      yield {
        type: "item.completed",
        item: { id: "answer", type: "agent_message", text: JSON.stringify(output) },
      };
      yield { type: "turn.completed", usage: {} };
    });
    const result = agentTurn({
      ...capacityAttemptOptions(),
      provider,
      schema: z.object({ message: z.string() }).superRefine((_value, ctx) =>
        ctx.addIssue({
          code: "custom",
          path: ["message"],
          message: "Application relationship is invalid",
        }),
      ),
    });
    await expect(result).rejects.toBeInstanceOf(z.ZodError);
    await expect(result).rejects.toBeInstanceOf(StructuredOutputError);
    await expect(result).rejects.toMatchObject({
      output,
      sessionId: "rejected-session",
      issues: [expect.objectContaining({ message: "Application relationship is invalid" })],
    });
  },
);
import type { Agent, ProviderEvent } from "../src/server/agents/agent";

it.each([claudeAgent, codexAgent] satisfies Agent[])(
  "uses the shared agent contract for $provider and retains resumed session metadata",
  async (agent) => {
    sdk.query.mockImplementation(async function* () {
      yield {
        type: "system",
        subtype: "init",
        skills: ["bundled-authoring:anatomy", "bundled-authoring:anysearch"],
        session_id: "resumed-session",
      };
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: "resumed-session",
        usage: {},
        modelUsage: {},
      };
    });
    sdk.codexEvents.mockImplementation(async function* () {
      yield { type: "thread.started", thread_id: "resumed-session" };
      yield {
        type: "item.completed",
        item: { id: "answer", type: "agent_message", text: '{"message":"done"}' },
      };
      yield { type: "turn.completed", usage: {} };
    });
    const events: ProviderEvent[] = [];
    const result = await agentTurn({
      provider: agent.provider,
      workspace: "/job",
      prompt: "Summarize",
      schema: z.object({ message: z.literal("done") }),
      signal: new AbortController().signal,
      sessionId: "original-session",
      model: "selected-model",
      onEvent: (event) => events.push(event),
    });
    expect(result).toEqual({ value: { message: "done" }, sessionId: "resumed-session" });
    expect(events.find((event) => event.type === "invocation")?.data).toMatchObject({
      prompt: { system: expect.stringContaining("Blender is disallowed") },
    });
    expect(events.at(-1)?.data).toMatchObject({
      provider: agent.provider,
      model: "selected-model",
      sessionId: "resumed-session",
      invocationId: expect.any(String),
    });
    if (agent.provider === "claude") {
      expect(sdk.query.mock.calls.at(-1)?.[0].options.resume).toBe("original-session");
      const hook = sdk.query.mock.calls
        .at(-1)?.[0]
        .options.hooks.PreToolUse.find((entry: { matcher: string }) => entry.matcher === "^Bash$")
        .hooks[0];
      expect(
        await hook({
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "blender -b" },
        }),
      ).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
      expect(
        await hook({
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "node scene.js" },
        }),
      ).toMatchObject({
        hookSpecificOutput: { updatedInput: { command: expect.stringContaining("node scene.js") } },
      });
      const settings = sdk.query.mock.calls.at(-1)![0].options;
      expect(settings.disallowedTools).toEqual(["WebFetch", "WebSearch"]);
      expect(settings.sandbox.network.allowedDomains).toEqual(["*"]);
      expect(settings.sandbox.enabled).toBe(true);
      expect(settings.sandbox.allowUnsandboxedCommands).toBe(false);
      expect(settings.sandbox.network.allowLocalBinding).toBe(true);
      expect(settings.sandbox.network.allowUnixSockets).toEqual(
        process.platform === "darwin" ? ["/private/var/run/mDNSResponder"] : undefined,
      );
      expect(settings.sandbox.network.allowMachLookup).toEqual(
        process.platform === "darwin" ? ["com.apple.trustd.agent"] : undefined,
      );
      expect(settings.env.NODE_USE_ENV_PROXY).toBe("1");
      expect(settings.env[credentialEnvironmentVariables.claudeOauthToken]).toBe(
        "fixture-sdk-token",
      );
      expect(settings.env.npm_config_cache).toBe(
        projectRuntimeEnvironment("/job", "agent").npm_config_cache,
      );
      expect(settings.env.XDG_CACHE_HOME).toBe(
        projectRuntimeEnvironment("/job", "agent").XDG_CACHE_HOME,
      );
      expect(await settings.canUseTool("WebFetch", { url: "https://example.com" })).toMatchObject({
        behavior: "deny",
      });
      expect(sdk.close).toHaveBeenCalledOnce();
    } else {
      expect(sdk.construct.mock.calls.at(-1)?.[0].env).toMatchObject({
        CODEX_HOME: "/isolated-home",
        HOME: "/isolated-home",
        ...(process.platform === "win32" ? { USERPROFILE: "/isolated-home" } : {}),
      });
      expect(sdk.resume).toHaveBeenCalledWith("original-session");
      expect(sdk.threadOptions.mock.calls.at(-1)?.[0]).toMatchObject({
        webSearchMode: "disabled",
        sandboxMode: "workspace-write",
        networkAccessEnabled: true,
      });
      expect(events.find((event) => event.type === "usage")?.data).toMatchObject({
        usageScope: "session",
      });
    }
  },
);

it.each(["claude", "codex"] as const)("rejects incomplete %s streams", async (provider) => {
  sdk.query.mockImplementation(async function* () {});
  sdk.codexEvents.mockImplementation(async function* () {});
  await expect(
    agentTurn({
      provider,
      workspace: "/job",
      prompt: "Summarize",
      schema: z.object({ message: z.string() }),
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    }),
  ).rejects.toThrow("stream ended without a completed turn");
});

it.each(["claude", "codex"] as const)(
  "uses %s-compatible required fields for optional nested output properties",
  async (provider) => {
    let wire: unknown;
    const schema = z.object({
      assetNeeds: z
        .array(
          z.object({
            kind: z.string(),
            cause: z.enum(["tool-capability", "url-access"]).optional(),
          }),
        )
        .optional(),
    });
    sdk.query.mockImplementation(async function* (input) {
      wire = input.options.outputFormat.schema;
      yield {
        type: "result",
        subtype: "success",
        structured_output: { assetNeeds: [] },
        session_id: "session",
      };
    });
    sdk.codexEvents.mockImplementation(async function* () {
      yield {
        type: "item.completed",
        item: { id: "answer", type: "agent_message", text: '{"assetNeeds":[]}' },
      };
      yield { type: "turn.completed", usage: {} };
    });
    // Observe the transport schema without changing the accepted domain result.
    await agentTurn({
      provider,
      workspace: "/job",
      prompt: "Summarize",
      schema,
      signal: new AbortController().signal,
      onEvent: (event) => {
        if (event.type === "invocation")
          wire = (event.data as { prompt: { outputSchema: unknown } }).prompt.outputSchema;
      },
    });
    const parsed = z
      .object({
        properties: z.object({
          assetNeeds: z.object({ items: z.object({ required: z.array(z.string()) }) }),
        }),
        required: z.array(z.string()).optional(),
      })
      .parse(wire);
    expect(parsed.properties.assetNeeds.items.required).toEqual(
      provider === "codex" ? ["kind", "cause"] : ["kind"],
    );
    expect(parsed.required).toEqual(provider === "codex" ? ["assetNeeds"] : undefined);
    expect(schema.parse({})).toEqual({});
  },
);

it.each([
  ["claude", false],
  ["codex", false],
  ["claude", true],
  ["codex", true],
] as const)(
  "applies shared video pacing in %s system instructions while respecting text-only=%s",
  async (provider, textOnly) => {
    const { videoPacingSystemGuidance, videoPacingPolicy } =
      await import("../src/server/domains/video/pacing");
    sdk.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        structured_output: { message: "done" },
        session_id: "session",
      };
    });
    sdk.codexEvents.mockImplementation(async function* () {
      yield {
        type: "item.completed",
        item: { id: "answer", type: "agent_message", text: '{"message":"done"}' },
      };
      yield { type: "turn.completed", usage: {} };
    });
    let system = "";
    await agentTurn({
      provider,
      model: "selected-model",
      textOnly,
      workspace: "/job",
      prompt: "Complete the assigned task",
      schema: z.object({ message: z.literal("done") }),
      signal: new AbortController().signal,
      onEvent: (event) => {
        if (event.type === "invocation")
          system = (event.data as { prompt: { system: string } }).prompt.system;
      },
    });
    if (textOnly) {
      expect(system).not.toContain("VIDEO PACING DEFAULT");
      return;
    }
    expect(system).toContain(videoPacingSystemGuidance);
    expect(system).toContain(videoPacingPolicy.scope);
    expect(system).toContain("Exclude capture_video calls and all captured footage");
    expect(system).toContain("apply only outside captured footage");
    expect(system).toContain(videoPacingPolicy.editorial);
    expect(system).toContain(videoPacingPolicy.action);
    expect(system).toContain("Make each scene earn its duration");
    expect(system).toContain(
      "preserve explicit act and scene start/end times, narration starts and required holds",
    );
    expect(system).toContain(
      "Keep successful preview action timings where compatible with the story and explicit audio cues",
    );
    expect(system).toContain("rather than slowing a reveal or padding a gap");
    expect(system).toContain(videoPacingPolicy.reading);
    expect(system).toContain(videoPacingPolicy.coherence);
    expect(system).toContain("By default, favor brisk, energetic pacing");
    expect(system).toContain("Explicit user direction takes precedence");
    expect(system).toContain("not a fixed speed multiplier");
    expect(system).toContain("Preserve natural narration speed");
    expect(system).not.toContain("every 2–4 seconds");
    expect(system).toContain("Preserve the selected total duration");
    expect(system).toContain(
      "do not force cuts, movement or new information on every encoded frame",
    );
    expect(system).toContain("Respect the assigned stage");
  },
);

it.each([false, true])(
  "configures official Codex transport retries with Caveman=%s",
  async (enabled) => {
    sdk.cavemanRuntime.mockResolvedValue(
      enabled
        ? {
            url: "http://127.0.0.1:4321",
            env: {},
            mcp: { command: "caveman", args: ["mcp"] },
          }
        : undefined,
    );
    sdk.codexEvents.mockImplementation(async function* () {
      yield { type: "turn.failed", error: { message: "Invalid request" } };
    });
    const before = sdk.construct.mock.calls.length;
    await expect(
      agentTurn({
        provider: "codex",
        workspace: "/job",
        prompt: "Summarize",
        model: "gpt-6.1-sol",
        schema: z.object({ message: z.string() }),
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow("Invalid request");
    expect(sdk.construct.mock.calls.length).toBe(before + 1);
    const config = sdk.construct.mock.calls.at(-1)?.[0].config;
    if (enabled)
      expect(config.model_providers.caveman).toEqual({
        name: "Caveman",
        wire_api: "responses",
        requires_openai_auth: true,
        request_max_retries: 6,
        stream_max_retries: 8,
        base_url: "http://127.0.0.1:4321/w/codex/v1",
      });
    else expect(config.model_providers).toBeUndefined();
    expect(config.model_provider).toBe(enabled ? "caveman" : undefined);
  },
);

function capacityAttemptOptions(
  onEvent: (event: ProviderEvent) => void = vi.fn(),
  signal = new AbortController().signal,
) {
  return {
    provider: "codex" as const,
    model: "gpt-6.1-sol",
    workspace: "/job",
    prompt: "Build this direction",
    schema: z.object({ message: z.string() }),
    signal,
    onEvent,
  };
}
async function* capacityFailure() {
  yield { type: "thread.started", thread_id: "direction-session" };
  yield {
    type: "turn.failed",
    error: { message: "Selected model is at capacity. Please try a different model." },
  };
}
async function* completedCapacityRetry() {
  yield { type: "thread.started", thread_id: "direction-session" };
  yield {
    type: "item.completed",
    item: { id: "answer", type: "agent_message", text: '{"message":"done"}' },
  };
  yield { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } };
}
it("retries a terminal capacity response in the captured session and meters a fresh invocation", async () => {
  sdk.codexEvents
    .mockReset()
    .mockImplementationOnce(capacityFailure)
    .mockImplementationOnce(completedCapacityRetry);
  const onEvent = vi.fn();
  const options = capacityAttemptOptions(onEvent);
  const result = await agentTurn(options);
  expect(result).toEqual({ value: { message: "done" }, sessionId: "direction-session" });
  expect(sdk.delay).toHaveBeenCalledExactlyOnceWith(10000, undefined, { signal: options.signal });
  expect(sdk.resume).toHaveBeenLastCalledWith("direction-session");
  const invocations = onEvent.mock.calls
    .map(([event]) => event)
    .filter((event) => event.type === "invocation");
  expect(invocations).toHaveLength(2);
  expect(new Set(invocations.map((event) => event.data.invocationId)).size).toBe(2);
  expect(invocations.every((event) => event.data.model === "gpt-6.1-sol")).toBe(true);
  expect(onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "retry",
      data: expect.objectContaining({ retry: 1, delayMs: 10000, sessionId: "direction-session" }),
    }),
  );
  const streams = sdk.stream.mock.calls.slice(-2);
  expect(streams[0][0]).toEqual(streams[1][0]);
  expect(streams[0][1].outputSchema).toEqual(streams[1][1].outputSchema);
  expect(streams[0][1].signal).not.toBe(streams[1][1].signal);
  expect(streams.every(([, options]) => options.signal instanceof AbortSignal)).toBe(true);
  expect(onEvent.mock.calls.filter(([event]) => event.type === "usage")).toHaveLength(1);
});
it("stops after three capacity retries with increasing delays", async () => {
  sdk.codexEvents.mockReset().mockImplementation(capacityFailure);
  const onEvent = vi.fn();
  await expect(agentTurn(capacityAttemptOptions(onEvent))).rejects.toThrow(
    "Selected model is at capacity",
  );
  expect(sdk.codexEvents).toHaveBeenCalledTimes(4);
  expect(sdk.delay.mock.calls.map(([ms]) => ms)).toEqual([10000, 30000, 60000]);
  expect(onEvent.mock.calls.filter(([event]) => event.type === "retry")).toHaveLength(3);
});
it.each(["Invalid request", "Rate limit exceeded", "Insufficient quota", "Authentication failed"])(
  "does not replay unrelated failure: %s",
  async (message) => {
    sdk.codexEvents.mockReset().mockImplementation(async function* () {
      yield { type: "turn.failed", error: { message } };
    });
    await expect(agentTurn(capacityAttemptOptions())).rejects.toThrow(message);
    expect(sdk.codexEvents).toHaveBeenCalledTimes(1);
    expect(sdk.delay).not.toHaveBeenCalled();
  },
);
it("does not infer a capacity failure from model-authored output or malformed JSON", async () => {
  sdk.codexEvents.mockReset().mockImplementation(async function* () {
    yield {
      type: "item.completed",
      item: { id: "answer", type: "agent_message", text: "Selected model is at capacity" },
    };
    yield { type: "turn.completed", usage: {} };
  });
  await expect(agentTurn(capacityAttemptOptions())).rejects.toThrow();
  expect(sdk.codexEvents).toHaveBeenCalledTimes(1);
  expect(sdk.delay).not.toHaveBeenCalled();
});
it("cancels during capacity backoff without starting another turn", async () => {
  sdk.codexEvents.mockReset().mockImplementation(capacityFailure);
  const controller = new AbortController();
  sdk.delay.mockImplementationOnce(async (_ms, _value, { signal }) => {
    controller.abort(new Error("Cancelled while waiting"));
    signal.throwIfAborted();
  });
  await expect(agentTurn(capacityAttemptOptions(vi.fn(), controller.signal))).rejects.toThrow(
    "Cancelled while waiting",
  );
  expect(sdk.codexEvents).toHaveBeenCalledTimes(1);
});
it("does not start an already cancelled capacity attempt", async () => {
  sdk.codexEvents.mockReset();
  const controller = new AbortController();
  controller.abort(new Error("Already cancelled"));
  await expect(agentTurn(capacityAttemptOptions(vi.fn(), controller.signal))).rejects.toThrow(
    "Already cancelled",
  );
  expect(sdk.codexEvents).not.toHaveBeenCalled();
});

const claudeCapacityOptions = (onEvent = vi.fn(), signal = new AbortController().signal) => ({
  ...capacityAttemptOptions(onEvent, signal),
  provider: "claude" as const,
  model: "claude-opus-5-5",
});
function claudeAssistantError(error: string, parent_tool_use_id: string | null = null) {
  return {
    type: "assistant",
    error,
    parent_tool_use_id,
    session_id: "claude-direction",
    message: { content: [] },
  };
}
function claudeFailedResult(subtype = "error_during_execution") {
  return {
    type: "result",
    subtype,
    is_error: true,
    session_id: "claude-direction",
    errors: ["Request failed"],
    usage: {},
    modelUsage: {},
  };
}
async function* claudeOverloadFailure() {
  yield {
    type: "system",
    subtype: "init",
    skills: ["bundled-authoring:anatomy", "bundled-authoring:anysearch"],
    session_id: "claude-direction",
  };
  yield claudeAssistantError("overloaded");
  yield claudeFailedResult();
}
async function* claudeRecoveredTurn() {
  yield {
    type: "system",
    subtype: "init",
    skills: ["bundled-authoring:anatomy", "bundled-authoring:anysearch"],
    session_id: "claude-direction",
  };
  yield {
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: "claude-direction",
    structured_output: { message: "done" },
    usage: {},
    modelUsage: {},
  };
}
it("retries Claude's structured terminal overload using the same model and saved session", async () => {
  sdk.query
    .mockReset()
    .mockImplementationOnce(claudeOverloadFailure)
    .mockImplementationOnce(claudeRecoveredTurn);
  const onEvent = vi.fn();
  const options = claudeCapacityOptions(onEvent);
  expect(await agentTurn(options)).toEqual({
    value: { message: "done" },
    sessionId: "claude-direction",
  });
  expect(sdk.query).toHaveBeenCalledTimes(2);
  expect(sdk.query.mock.calls[1][0].options).toMatchObject({
    model: "claude-opus-5-5",
    resume: "claude-direction",
  });
  expect(sdk.delay).toHaveBeenCalledExactlyOnceWith(10000, undefined, { signal: options.signal });
  const calls = onEvent.mock.calls.filter(([event]) => event.type === "invocation");
  expect(new Set(calls.map(([event]) => event.data.invocationId)).size).toBe(2);
  expect(onEvent.mock.calls.filter(([event]) => event.type === "usage")).toHaveLength(2);
});
it("lets Claude's native 529 overload retry recover without replaying the SDK query", async () => {
  sdk.query.mockReset().mockImplementation(async function* () {
    yield {
      type: "system",
      subtype: "api_retry",
      error: "overloaded",
      error_status: 529,
      attempt: 1,
      max_retries: 2,
      retry_delay_ms: 1000,
    };
    yield* claudeRecoveredTurn();
  });
  const onEvent = vi.fn();
  await agentTurn(claudeCapacityOptions(onEvent));
  expect(sdk.query).toHaveBeenCalledTimes(1);
  expect(sdk.delay).not.toHaveBeenCalled();
  expect(onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "retry",
      data: expect.objectContaining({
        native: true,
        errorCode: "overloaded",
        errorStatus: 529,
        delayMs: 1000,
      }),
    }),
  );
});
it("bounds persistent Claude overload to four attempts", async () => {
  sdk.query.mockReset().mockImplementation(claudeOverloadFailure);
  await expect(agentTurn(claudeCapacityOptions())).rejects.toThrow(
    "Claude is temporarily overloaded",
  );
  expect(sdk.query).toHaveBeenCalledTimes(4);
  expect(sdk.delay.mock.calls.map(([ms]) => ms)).toEqual([10000, 30000, 60000]);
});
it.each([
  "authentication_failed",
  "billing_error",
  "rate_limit",
  "invalid_request",
  "server_error",
])("does not treat Claude %s as overload", async (error) => {
  sdk.query.mockReset().mockImplementation(async function* () {
    yield claudeAssistantError(error);
    yield claudeFailedResult();
  });
  await expect(agentTurn(claudeCapacityOptions())).rejects.toThrow("Request failed");
  expect(sdk.query).toHaveBeenCalledTimes(1);
  expect(sdk.delay).not.toHaveBeenCalled();
});
it.each(["error_max_turns", "error_max_budget_usd", "error_max_structured_output_retries"])(
  "preserves Claude resource stop: %s",
  async (subtype) => {
    sdk.query.mockReset().mockImplementation(async function* () {
      yield claudeAssistantError("overloaded");
      yield claudeFailedResult(subtype);
    });
    await expect(agentTurn(claudeCapacityOptions())).rejects.toThrow("Request failed");
    expect(sdk.query).toHaveBeenCalledTimes(1);
    expect(sdk.delay).not.toHaveBeenCalled();
  },
);
it("ignores an overload from a nested Claude subagent", async () => {
  sdk.query.mockReset().mockImplementation(async function* () {
    yield claudeAssistantError("overloaded", "nested-task");
    yield claudeFailedResult();
  });
  await expect(agentTurn(claudeCapacityOptions())).rejects.toThrow("Request failed");
  expect(sdk.delay).not.toHaveBeenCalled();
});
it("clears an earlier Claude overload after a non-error top-level assistant", async () => {
  sdk.query.mockReset().mockImplementation(async function* () {
    yield claudeAssistantError("overloaded");
    yield {
      type: "assistant",
      parent_tool_use_id: null,
      message: { content: [{ type: "text", text: "Recovered" }] },
    };
    yield claudeFailedResult();
  });
  await expect(agentTurn(claudeCapacityOptions())).rejects.toThrow("Request failed");
  expect(sdk.delay).not.toHaveBeenCalled();
});
it("captures a structured Claude overload even if the SDK subsequently exits without a result", async () => {
  sdk.query
    .mockReset()
    .mockImplementationOnce(async function* () {
      yield {
        type: "system",
        subtype: "init",
        skills: ["bundled-authoring:anatomy", "bundled-authoring:anysearch"],
        session_id: "claude-direction",
      };
      yield claudeAssistantError("overloaded");
      throw Error("Subprocess exited");
    })
    .mockImplementationOnce(claudeRecoveredTurn);
  await expect(agentTurn(claudeCapacityOptions())).resolves.toMatchObject({
    value: { message: "done" },
  });
  expect(sdk.query).toHaveBeenCalledTimes(2);
  expect(sdk.query.mock.calls[1][0].options.resume).toBe("claude-direction");
});
it("does not identify Claude overload from ordinary text or a native retry notice alone", async () => {
  sdk.query.mockReset().mockImplementation(async function* () {
    yield {
      type: "system",
      subtype: "api_retry",
      error: "overloaded",
      error_status: 529,
      attempt: 1,
      max_retries: 2,
      retry_delay_ms: 1000,
    };
    yield {
      type: "assistant",
      message: { content: [{ type: "text", text: "overloaded_error HTTP 529" }] },
    };
    yield claudeFailedResult();
  });
  await expect(agentTurn(claudeCapacityOptions())).rejects.toThrow("Request failed");
  expect(sdk.query).toHaveBeenCalledTimes(1);
  expect(sdk.delay).not.toHaveBeenCalled();
});
it("cancels Claude capacity backoff without another SDK query", async () => {
  sdk.query.mockReset().mockImplementation(claudeOverloadFailure);
  const controller = new AbortController();
  sdk.delay.mockImplementationOnce(async (_ms, _value, { signal }) => {
    controller.abort(new Error("Cancelled Claude retry"));
    signal.throwIfAborted();
  });
  await expect(agentTurn(claudeCapacityOptions(vi.fn(), controller.signal))).rejects.toThrow(
    "Cancelled Claude retry",
  );
  expect(sdk.query).toHaveBeenCalledTimes(1);
});

it("does not carry an earlier overload across a later native retry with a different cause", async () => {
  sdk.query.mockReset().mockImplementation(async function* () {
    yield claudeAssistantError("overloaded");
    yield {
      type: "system",
      subtype: "api_retry",
      error: "rate_limit",
      error_status: 429,
      attempt: 1,
      max_retries: 2,
      retry_delay_ms: 1000,
    };
    yield claudeFailedResult();
  });
  await expect(agentTurn(claudeCapacityOptions())).rejects.toThrow("Request failed");
  expect(sdk.query).toHaveBeenCalledTimes(1);
  expect(sdk.delay).not.toHaveBeenCalled();
});

it.each(["claude", "codex"] as const)(
  "leaves %s reasoning effort unset by default and forwards explicit task overrides",
  async (provider) => {
    sdk.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: "effort-session",
        usage: {},
        modelUsage: {},
      };
    });
    sdk.codexEvents.mockImplementation(async function* () {
      yield {
        type: "item.completed",
        item: { id: "answer", type: "agent_message", text: '{"message":"done"}' },
      };
      yield { type: "turn.completed", usage: {} };
    });
    for (const reasoningEffort of [undefined, "low", "medium"] as const) {
      const onEvent = vi.fn();
      await agentTurn({
        provider,
        workspace: "/job",
        prompt: "Review supplied evidence",
        schema: z.object({ message: z.string() }),
        signal: new AbortController().signal,
        onEvent,
        ...(reasoningEffort ? { reasoningEffort } : {}),
      });
      const native =
        provider === "claude"
          ? sdk.query.mock.calls.at(-1)![0].options
          : sdk.threadOptions.mock.calls.at(-1)![0];
      const field = provider === "claude" ? "effort" : "modelReasoningEffort";
      if (reasoningEffort) expect(native[field]).toBe(reasoningEffort);
      else expect(native).not.toHaveProperty(field);
      const invocation = onEvent.mock.calls
        .map(([event]) => event)
        .find((event) => event.type === "invocation");
      expect(invocation.data.prompt.reasoningEffort).toBe(reasoningEffort ?? null);
    }
  },
);

it.each([claudeAgent, codexAgent])(
  "does not launch $provider after cancellation during setup",
  async (agent) => {
    for (const preAborted of [true, false]) {
      const controller = new AbortController();
      const reason = new Error("User cancelled during setup");
      const queryCalls = sdk.query.mock.calls.length;
      const codexCalls = sdk.construct.mock.calls.length;
      if (preAborted) controller.abort(reason);
      else
        sdk.cavemanRuntime.mockImplementationOnce(async () => {
          controller.abort(reason);
          return undefined;
        });
      await expect(
        agent.run({
          ...capacityAttemptOptions(vi.fn(), controller.signal),
          model: "selected-model",
          systemPrompt: "Test cancellation",
          jsonSchema: {},
          textOnly: true,
        }),
      ).rejects.toBe(reason);
      expect(sdk.query.mock.calls.length).toBe(queryCalls);
      expect(sdk.construct.mock.calls.length).toBe(codexCalls);
    }
  },
);

it.each([claudeAgent, codexAgent])(
  "closes $provider resources when cancellation happens inside an event callback",
  async (agent) => {
    const controller = new AbortController();
    const reason = new Error("User cancelled the active turn");
    const finalized = vi.fn();
    sdk.query.mockImplementation(async function* () {
      try {
        yield { type: "system", subtype: "init", session_id: "session", skills: [] };
        yield {
          type: "result",
          subtype: "success",
          is_error: false,
          structured_output: { message: "done" },
          session_id: "session",
        };
      } finally {
        finalized();
      }
    });
    sdk.codexEvents.mockImplementation(async function* () {
      try {
        yield { type: "thread.started", thread_id: "session" };
        yield {
          type: "item.completed",
          item: { type: "agent_message", id: "answer", text: '{"message":"done"}' },
        };
        yield { type: "turn.completed", usage: {} };
      } finally {
        finalized();
      }
    });
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(
      agent.run({
        ...capacityAttemptOptions(() => controller.abort(reason), controller.signal),
        model: "selected-model",
        systemPrompt: "Test cancellation",
        jsonSchema: {},
        textOnly: true,
      }),
    ).rejects.toBe(reason);
    expect(finalized).toHaveBeenCalledOnce();
    if (agent.provider === "claude") {
      expect(sdk.close).toHaveBeenCalledOnce();
      expect(sdk.query.mock.calls.at(-1)![0].options.abortController.signal.reason).toBe(reason);
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    }
    remove.mockRestore();
  },
);

it.each([claudeAgent, codexAgent])(
  "cleans up $provider after a stream crash or callback exception",
  async (agent) => {
    for (const callbackFails of [false, true]) {
      sdk.close.mockClear();
      const failure = new Error(callbackFails ? "Event persistence failed" : "SDK process crashed");
      const finalized = vi.fn();
      sdk.query.mockImplementation(async function* () {
        try {
          yield { type: "system", subtype: "init", session_id: "session", skills: [] };
          throw failure;
        } finally {
          finalized();
        }
      });
      sdk.codexEvents.mockImplementation(async function* () {
        try {
          yield { type: "thread.started", thread_id: "session" };
          throw failure;
        } finally {
          finalized();
        }
      });
      await expect(
        agent.run({
          ...capacityAttemptOptions(() => {
            if (callbackFails) throw failure;
          }),
          model: "selected-model",
          systemPrompt: "Test crash cleanup",
          jsonSchema: {},
          textOnly: true,
        }),
      ).rejects.toBe(failure);
      expect(finalized).toHaveBeenCalledOnce();
      if (agent.provider === "claude") expect(sdk.close).toHaveBeenCalledOnce();
    }
  },
);

it.each(["claude", "codex"] as const)(
  "rejects cancellation on the final %s usage event instead of reporting success",
  async (provider) => {
    const controller = new AbortController();
    const reason = new Error("Cancelled at completion");
    sdk.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: "session",
        usage: {},
      };
    });
    sdk.codexEvents.mockImplementation(completedCapacityRetry);
    await expect(
      agentTurn({
        ...capacityAttemptOptions((event) => {
          if (event.type === "usage") controller.abort(reason);
        }, controller.signal),
        provider,
        textOnly: true,
      }),
    ).rejects.toBe(reason);
  },
);

it("closes Claude immediately when cancellation arrives while no SDK event is available", async () => {
  const controller = new AbortController();
  const reason = new Error("Cancel a blocked stream");
  let release!: () => void;
  let waiting = false;
  const stopped = new Promise<void>((resolve) => {
    release = resolve;
  });
  const finalized = vi.fn();
  sdk.close.mockImplementation(() => release());
  sdk.query.mockImplementation(async function* () {
    try {
      waiting = true;
      await stopped;
      yield { type: "system", subtype: "init", session_id: "session", skills: [] };
    } finally {
      finalized();
    }
  });
  const running = claudeAgent.run({
    ...capacityAttemptOptions(vi.fn(), controller.signal),
    model: "selected-model",
    systemPrompt: "Test blocked cancellation",
    jsonSchema: {},
    textOnly: true,
  });
  const rejected = expect(running).rejects.toBe(reason);
  await vi.waitFor(() => expect(waiting).toBe(true));
  controller.abort(reason);
  expect(sdk.close).toHaveBeenCalledOnce();
  await rejected;
  expect(finalized).toHaveBeenCalledOnce();
  expect(sdk.close).toHaveBeenCalledOnce();
});

it.each(["claude", "codex"] as const)(
  "gives %s system-level MCP search/read-first guidance without a style gate",
  async (provider) => {
    sdk.query.mockReset().mockImplementation(claudeRecoveredTurn);
    sdk.codexEvents.mockReset().mockImplementation(async function* () {
      yield { type: "thread.started", thread_id: "style-guidance-session" };
      yield {
        type: "item.completed",
        item: { id: "answer", type: "agent_message", text: '{"message":"done"}' },
      };
      yield { type: "turn.completed", usage: {} };
    });
    await agentTurn({ ...capacityAttemptOptions(), provider, readOnly: true });
    const guidance =
      provider === "claude"
        ? sdk.query.mock.calls.at(-1)![0].options.systemPrompt
        : sdk.stream.mock.calls.at(-1)![0];
    expect(guidance).toContain("FIRST STEP FOR EVERY AUTHORING TASK");
    expect(guidance).toContain("creative_pool.search_pool");
    expect(guidance).toContain("creative_pool.read_pool_entry");
    expect(guidance).toContain("Before planning, writing code or making implementation choices");
    expect(guidance).toContain("the main model decides the scene/act assignments and timing");
    expect(guidance).toContain(
      "authorized requirements even when absent from the Settings selection",
    );
    expect(guidance).toContain("Absence from Settings is not a conflict");
    expect(guidance).toContain("Pool discovery alone does not authorize unrequested additions");
    expect(guidance).toContain(
      "A user-requested act-specific treatment remains confined to that act",
    );
    expect(guidance).not.toContain("does not authorize replacing, dropping, promoting or adding");
    const servers =
      provider === "claude"
        ? sdk.query.mock.calls.at(-1)![0].options.mcpServers
        : sdk.construct.mock.calls.at(-1)![0].config.mcp_servers;
    expect(servers.creative_pool).toBeDefined();
    expect(servers.creative_pool.args).not.toEqual(
      expect.arrayContaining([expect.stringContaining("auditId")]),
    );
  },
);

it("delegates Claude planning permissions to native Plan Mode and preserves its implementation handoff", async () => {
  sdk.query.mockReset().mockImplementation(claudeRecoveredTurn);
  const options = {
    ...capacityAttemptOptions(),
    provider: "claude" as const,
    model: "claude-opus-5-5",
  };
  await agentTurn({
    ...options,
    readOnly: true,
    planMode: true,
    referenceUrls: ["https://example.com"],
  });
  const planning = sdk.query.mock.calls.at(-1)![0].options;
  expect(planning.permissionMode).toBe("plan");
  expect(planning.planModeInstructions).toContain(
    "Kiteva automatically accepts this planning handoff",
  );
  expect(planning.tools).toContain("ExitPlanMode");
  expect(planning.tools).toEqual(expect.arrayContaining(["Write", "Edit", "Bash"]));
  expect(await planning.canUseTool("ExitPlanMode", {})).toMatchObject({ behavior: "allow" });
  for (const tool of ["Write", "Edit", "Bash", "NotebookEdit"])
    expect(await planning.canUseTool(tool, {})).toMatchObject({
      behavior: "deny",
      message: "Native plan-mode permission requests are not approved during planning",
    });
  expect(await planning.canUseTool("Write", { file_path: "/outside-job/plan.json" })).toMatchObject(
    { behavior: "deny" },
  );
  expect(JSON.parse(planning.mcpServers.reference_browser.args.at(-1))).toMatchObject({
    enableVideoCapture: false,
  });
  for (const server of ["react_bits", "animate_ui"]) {
    expect(await planning.canUseTool(`mcp__${server}__install_component`, {})).toMatchObject({
      behavior: "deny",
    });
    expect(await planning.canUseTool(`mcp__${server}__read_component`, {})).toMatchObject({
      behavior: "allow",
    });
  }
  await agentTurn({ ...options, sessionId: "claude-direction" });
  const implementation = sdk.query.mock.calls.at(-1)![0].options;
  expect(implementation.resume).toBe("claude-direction");
  expect(implementation.permissionMode).toBe("acceptEdits");
  expect(implementation.planModeInstructions).toBeUndefined();
  expect(implementation.hooks.PostToolUse).toBeUndefined();
  expect(implementation.tools).not.toContain("ExitPlanMode");
  expect(await implementation.canUseTool("ExitPlanMode", {})).toMatchObject({ behavior: "deny" });
});

it("keeps the native SDK in plan mode after its exit handoff until the structured plan is returned", async () => {
  const setPermissionMode = vi.fn().mockResolvedValue(undefined);
  sdk.query.mockReset().mockImplementation((call) => {
    async function* events() {
      const exit = call.options.hooks.PostToolUse[0];
      expect(exit.matcher).toBe("^ExitPlanMode$");
      await exit.hooks[0]();
      expect(setPermissionMode).toHaveBeenCalledWith("plan");
      yield* claudeRecoveredTurn();
    }
    return Object.assign(events(), { setPermissionMode });
  });
  await agentTurn({
    ...capacityAttemptOptions(),
    provider: "claude",
    readOnly: true,
    planMode: true,
  });
  expect(setPermissionMode).toHaveBeenCalledOnce();
});

it("keeps ordinary read-only Claude calls outside native planning and rejects writable planning", async () => {
  sdk.query.mockReset().mockImplementation(claudeRecoveredTurn);
  const options = { ...capacityAttemptOptions(), provider: "claude" as const };
  await agentTurn({ ...options, readOnly: true });
  const inspection = sdk.query.mock.calls.at(-1)![0].options;
  expect(inspection.permissionMode).toBe("acceptEdits");
  for (const tool of ["Write", "Edit", "Bash"]) {
    expect(inspection.tools).not.toContain(tool);
    expect(await inspection.canUseTool(tool, {})).toMatchObject({ behavior: "deny" });
  }
  await expect(agentTurn({ ...options, planMode: true })).rejects.toThrow(
    "requires a read-only turn",
  );
  expect(sdk.query).toHaveBeenCalledOnce();
});

it.each(["claude", "codex"] as const)(
  "scopes %s capture calls to one chapter and disables capture during assembly",
  async (provider) => {
    sdk.query.mockReset().mockImplementation(claudeRecoveredTurn);
    sdk.codexEvents.mockReset().mockImplementation(async function* () {
      yield { type: "thread.started", thread_id: "chapter-session" };
      yield {
        type: "item.completed",
        item: { id: "answer", type: "agent_message", text: '{"message":"done"}' },
      };
      yield { type: "turn.completed", usage: {} };
    });
    for (const enabled of [true, false]) {
      await agentTurn({
        ...capacityAttemptOptions(),
        provider,
        referenceUrls: ["https://example.com"],
        enableVideoCapture: enabled,
        ...(enabled ? { captureChapterId: "create" } : {}),
      });
      const server =
        provider === "claude"
          ? sdk.query.mock.calls.at(-1)![0].options.mcpServers.reference_browser
          : sdk.construct.mock.calls.at(-1)![0].config.mcp_servers.reference_browser;
      const config = JSON.parse(server.args.at(-1));
      expect(config.enableVideoCapture).toBe(enabled);
      expect(config.captureChapterId).toBe(enabled ? "create" : undefined);
      if (provider === "codex")
        expect(server.enabled_tools.includes("capture_video")).toBe(enabled);
    }
  },
);

it.each(["claude", "codex"] as const)(
  "starts a fresh %s SDK session for each unresumed chapter call",
  async (provider) => {
    let sequence = 0;
    sdk.query.mockImplementation(async function* () {
      const session = `chapter-${++sequence}`;
      yield {
        type: "system",
        subtype: "init",
        session_id: session,
        skills: ["bundled-authoring:anatomy", "bundled-authoring:anysearch"],
      };
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: session,
        usage: {},
        modelUsage: {},
      };
    });
    sdk.codexEvents.mockImplementation(async function* () {
      yield { type: "thread.started", thread_id: `chapter-${++sequence}` };
      yield {
        type: "item.completed",
        item: { id: "answer", type: "agent_message", text: '{"message":"done"}' },
      };
      yield { type: "turn.completed", usage: {} };
    });
    sdk.resume.mockClear();
    const sessions: (string | undefined)[] = [];
    for (const chapterId of ["create", "review"]) {
      const result = await agentTurn({
        ...capacityAttemptOptions(),
        provider,
        captureChapterId: chapterId,
        includeCreativeAlternatives: false,
      });
      sessions.push(result.sessionId);
      if (provider === "claude")
        expect(sdk.query.mock.calls.at(-1)![0].options.resume).toBeUndefined();
    }
    expect(sessions).toEqual(["chapter-1", "chapter-2"]);
    if (provider === "codex") expect(sdk.resume).not.toHaveBeenCalled();
  },
);

it.each(["medium", "high", "xhigh"] as const)(
  "passes %s correction effort directly to Claude's native SDK",
  async (reasoningEffort) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "correction-effort-"));
    sdk.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: "correction-session",
        usage: {},
        modelUsage: {},
      };
    });
    try {
      await agentTurn({
        provider: "claude",
        model: "claude-haiku-5-5",
        reasoningEffort,
        workspace,
        prompt: "Repair the reported layout",
        readOnly: true,
        schema: z.object({ message: z.literal("done") }),
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      });
      expect(sdk.query.mock.calls.at(-1)?.[0].options).toMatchObject({
        model: "claude-haiku-5-5",
        effort: reasoningEffort,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);

it("preserves the SDK's raw cache-duration counters and cumulative per-model usage in logs", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "sdk-cache-usage-"));
  const usage = {
    input_tokens: 10,
    output_tokens: 20,
    cache_read_input_tokens: 1000,
    cache_creation_input_tokens: 300,
    cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
  };
  const modelUsage = {
    "claude-opus-5-5": {
      inputTokens: 50,
      outputTokens: 80,
      cacheReadInputTokens: 4000,
      cacheCreationInputTokens: 900,
      costUSD: 0.1,
    },
  };
  sdk.query.mockImplementation(async function* () {
    yield {
      type: "result",
      subtype: "success",
      is_error: false,
      structured_output: { message: "done" },
      session_id: "usage-session",
      usage,
      modelUsage,
      total_cost_usd: 0.1,
    };
  });
  const onEvent = vi.fn();
  try {
    await agentTurn({
      provider: "claude",
      model: "claude-opus-5-5",
      workspace,
      prompt: "Report completion",
      readOnly: true,
      schema: z.object({ message: z.literal("done") }),
      signal: new AbortController().signal,
      onEvent,
    });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "usage",
        data: expect.objectContaining({ usage, modelUsage, cost: 0.1, sessionId: "usage-session" }),
      }),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("forces five-minute SDK caching above inherited one-hour CLI settings without changing the parent environment", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "sdk-cache-ttl-"));
  const keys = [
    "CLAUDE_CODE_PROMPT_CACHE_TTL",
    "CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL",
    "ENABLE_PROMPT_CACHING_1H",
    "FORCE_PROMPT_CACHING_5M",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.CLAUDE_CODE_PROMPT_CACHE_TTL = "1h";
  process.env.CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL = "1h";
  process.env.ENABLE_PROMPT_CACHING_1H = "1";
  process.env.FORCE_PROMPT_CACHING_5M = "0";
  sdk.query.mockImplementation(async function* () {
    yield {
      type: "result",
      subtype: "success",
      is_error: false,
      structured_output: { message: "done" },
      session_id: "ttl-session",
      usage: {},
      modelUsage: {},
    };
  });
  try {
    await agentTurn({
      provider: "claude",
      model: "claude-opus-5-5",
      workspace,
      prompt: "Use the configured cache lifetime",
      readOnly: true,
      schema: z.object({ message: z.literal("done") }),
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    });
    expect(sdk.query.mock.calls.at(-1)?.[0].options).toMatchObject({
      settings: { promptCacheTtl: "5m", subagentPromptCacheTtl: "5m" },
      env: { FORCE_PROMPT_CACHING_5M: "1" },
    });
    expect(process.env.CLAUDE_CODE_PROMPT_CACHE_TTL).toBe("1h");
    expect(process.env.CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL).toBe("1h");
    expect(process.env.FORCE_PROMPT_CACHING_5M).toBe("0");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await rm(workspace, { recursive: true, force: true });
  }
});

it("emits installation activity for every Claude shell call, including mixed assistant messages", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "sdk-install-activity-"));
  sdk.query.mockImplementation(async function* () {
    yield {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Preparing the project" },
          {
            type: "tool_use",
            id: "npm-install",
            name: "Bash",
            input: { command: "npm install matter-js" },
          },
          {
            type: "tool_use",
            id: "pip-install",
            name: "Bash",
            input: { command: "python3 -m pip install Pillow" },
          },
        ],
      },
    };
    yield {
      type: "result",
      subtype: "success",
      is_error: false,
      structured_output: { message: "done" },
      session_id: "installation",
      usage: {},
      modelUsage: {},
    };
  });
  const events: unknown[] = [];
  try {
    await agentTurn({
      provider: "claude",
      workspace,
      prompt: "Build a project",
      model: "selected-model",
      schema: z.object({ message: z.literal("done") }),
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool",
          data: expect.objectContaining({
            itemId: "npm-install",
            toolName: "Bash",
            activity: "dependencies",
          }),
        }),
        expect.objectContaining({
          type: "tool",
          data: expect.objectContaining({
            itemId: "pip-install",
            toolName: "Bash",
            activity: "dependencies",
          }),
        }),
      ]),
    );
    expect(
      JSON.stringify(events.filter((e) => (e as { type: string }).type === "tool")),
    ).not.toContain("Pillow");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("preserves failed Codex installation outcomes without exposing command arguments", async () => {
  const { codexEvent } = await import("../src/server/agents/codex-agent");
  const event = codexEvent({
    type: "item.completed",
    item: {
      id: "install",
      type: "command_execution",
      command: "/bin/zsh -lc 'npm install example'",
      aggregated_output: "Install failed",
      exit_code: 1,
      status: "failed",
    },
  });
  expect(event?.data).toMatchObject({
    activity: "dependencies",
    failed: true,
    state: "item.completed",
  });
  expect(event?.data).not.toHaveProperty("command");
});

it("preserves Codex MCP and file-change failures", async () => {
  const { codexEvent } = await import("../src/server/agents/codex-agent");
  expect(
    codexEvent({
      type: "item.completed",
      item: {
        id: "mcp",
        type: "mcp_tool_call",
        server: "creative_pool",
        tool: "prepare_technology",
        arguments: {},
        status: "failed",
        error: { message: "Bundle failed" },
      },
    })?.data,
  ).toMatchObject({ failed: true, toolName: "creative_pool: prepare_technology" });
  expect(
    codexEvent({
      type: "item.completed",
      item: {
        id: "mcp",
        type: "mcp_tool_call",
        server: "creative_pool",
        tool: "prepare_technology",
        arguments: {},
        status: "completed",
        result: { content: [], structured_content: { kind: "error", message: "Not installed" } },
      },
    })?.data,
  ).toMatchObject({ failed: true });
  expect(
    codexEvent({
      type: "item.completed",
      item: { id: "edit", type: "file_change", changes: [], status: "failed" },
    })?.data,
  ).toMatchObject({ failed: true, activity: "editing" });
});

it("produces equivalent customer activity from native Claude and Codex SDK events", async () => {
  const { activityItems } = await import("../src/client/agent-activity-model");
  const { codexEvent } = await import("../src/server/agents/codex-agent");
  const workspace = await mkdtemp(path.join(os.tmpdir(), "sdk-activity-parity-"));
  sdk.query.mockImplementation(async function* () {
    yield {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Preparing the project" },
          { type: "tool_use", id: "read", name: "Read", input: { file_path: "brief.json" } },
          { type: "tool_use", id: "edit", name: "Edit", input: {} },
          {
            type: "tool_use",
            id: "check",
            name: "Bash",
            input: { command: "node --check main.js" },
          },
        ],
      },
    };
    yield {
      type: "user",
      message: {
        content: [
          { type: "tool_result", tool_use_id: "read", content: "Done" },
          { type: "tool_result", tool_use_id: "edit", is_error: true, content: "Failed" },
          { type: "tool_result", tool_use_id: "check", content: "Done" },
        ],
      },
    };
    yield {
      type: "result",
      subtype: "success",
      is_error: false,
      structured_output: { message: "done" },
      session_id: "parity",
      usage: {},
      modelUsage: {},
    };
  });
  const events: import("../src/server/agents/agent").ProviderEvent[] = [];
  try {
    await agentTurn({
      provider: "claude",
      workspace,
      prompt: "Build a project",
      model: "selected-model",
      schema: z.object({ message: z.literal("done") }),
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });
    const codex = [
      codexEvent({
        type: "item.completed",
        item: {
          id: "read",
          type: "command_execution",
          command: "/bin/zsh -lc 'cat brief.json'",
          aggregated_output: "Done",
          status: "completed",
          exit_code: 0,
        },
      })!,
      codexEvent({
        type: "item.completed",
        item: { id: "edit", type: "file_change", changes: [], status: "failed" },
      })!,
      codexEvent({
        type: "item.completed",
        item: {
          id: "check",
          type: "command_execution",
          command: "node --check main.js",
          aggregated_output: "Done",
          status: "completed",
          exit_code: 0,
        },
      })!,
    ];
    const visible = (input: typeof events) =>
      activityItems(
        input.map((event, index) => ({
          ...event,
          id: index + 1,
          runId: "example",
          jobId: "build",
          time: "2026-01-01T10:00:00Z",
          data: {
            ...(event.data as object),
            invocationId: "build",
            purpose: "full video generation",
          },
        })),
        false,
      )
        .filter((item) => item.kind === "tool")
        .map(({ text, status }) => ({ text, status }));
    expect(visible(events)).toEqual(visible(codex));
    expect(visible(codex)).toEqual([
      { text: "Reading project content…", status: "complete" },
      { text: "Updating project files…", status: "failed" },
      { text: "Checking project code…", status: "complete" },
    ]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it.each([{ textOnly: true }, { readOnly: true }, { planMode: true, readOnly: true }, {}])(
  "denies shared credential names to Claude Bash without removing SDK login (%j)",
  async (mode) => {
    sdk.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { message: "done" },
        session_id: "credential-policy-fixture",
        usage: {},
        modelUsage: {},
      };
    });
    await agentTurn({
      provider: "claude",
      workspace: "/job",
      prompt: "Local policy fixture",
      model: "fixture-model",
      schema: z.object({ message: z.literal("done") }),
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      ...mode,
    });
    const options = sdk.query.mock.calls.at(-1)![0].options;
    const names = Object.values(credentialEnvironmentVariables);
    expect(new Set(names).size).toBe(names.length);
    expect(options.sandbox.credentials.envVars).toEqual(
      names.map((name) => ({ name, mode: "deny" })),
    );
    expect(options.sandbox.allowUnsandboxedCommands).toBe(false);
    expect(options.env[credentialEnvironmentVariables.claudeOauthToken]).toBe("fixture-sdk-token");
  },
);
