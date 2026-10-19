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
import type { Agent, ProviderEvent } from "../src/server/agents/agent";

it.each([claudeAgent, codexAgent] satisfies Agent[])(
  "uses the shared agent contract for $provider and retains resumed session metadata",
  async (agent) => {
    sdk.query.mockImplementation(async function* () {
      yield {
        type: "system",
        subtype: "init",
        skills: ["bundled-authoring:anatomy"],
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
      ).toEqual({});
      expect(sdk.close).toHaveBeenCalledOnce();
    } else {
      expect(sdk.resume).toHaveBeenCalledWith("original-session");
      expect(sdk.threadOptions.mock.calls.at(-1)?.[0]).toMatchObject({
        sandboxMode: "workspace-write",
        networkAccessEnabled: false,
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
    expect(system).toContain(videoPacingPolicy.editorial);
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
  expect(streams[0]).toEqual(streams[1]);
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
    skills: ["bundled-authoring:anatomy"],
    session_id: "claude-direction",
  };
  yield claudeAssistantError("overloaded");
  yield claudeFailedResult();
}
async function* claudeRecoveredTurn() {
  yield {
    type: "system",
    subtype: "init",
    skills: ["bundled-authoring:anatomy"],
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
        skills: ["bundled-authoring:anatomy"],
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
    expect(guidance).toContain("FIRST STEP FOR EVERY VIDEO TASK");
    expect(guidance).toContain("creative_pool.search_pool");
    expect(guidance).toContain("creative_pool.read_pool_entry");
    expect(guidance).toContain("Before planning, writing code or making implementation choices");
    expect(guidance).toContain("the main model decides the scene/act assignments and timing");
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
