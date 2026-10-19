import { ModelCapacityError } from "./capacity-error";
import { cavemanRuntime } from "./caveman";
import {
  query,
  type SDKMessage,
  type SDKAssistantMessageError,
  type Query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sdkToolHook } from "./execution-policy";
import { briefExplorationAgents } from "./brief-exploration";
import { requireForegroundSubagent } from "./claude-subagent-policy";
import { childEnvironment, safeMessage } from "../runtime/config";
import type { Agent, ProviderEvent } from "./agent";
import { claudeBundledSkills } from "./bundled-skills";
import { bundledSkills } from "./bundled-skills/registry";

export function claudeEvent(event: SDKMessage): ProviderEvent | undefined {
  if (event.type === "system" && event.subtype === "init")
    return {
      type: "session",
      message: "Claude session opened",
      data: { sessionId: event.session_id },
    };
  if (event.type === "system" && event.subtype === "api_retry" && event.error === "overloaded")
    return {
      type: "retry",
      message: "Claude is overloaded. The SDK is retrying automatically…",
      data: {
        reason: "model_capacity",
        native: true,
        errorCode: event.error,
        errorStatus: event.error_status,
        retry: event.attempt,
        maxRetries: event.max_retries,
        delayMs: event.retry_delay_ms,
      },
    };
  if (event.type === "stream_event") {
    const e = event.event;
    if (e.type === "content_block_start" && e.content_block.type === "text")
      return { type: "text_start", message: "" };
    if (e.type === "content_block_delta" && e.delta.type === "text_delta")
      return { type: "text_delta", message: e.delta.text };
    if (e.type === "content_block_start" && e.content_block.type === "tool_use")
      return {
        type: "tool",
        message: `${e.content_block.name}`,
        data: { itemId: e.content_block.id, toolName: e.content_block.name },
      };
  }
  if (event.type === "tool_progress")
    return {
      type: "tool_progress",
      message: `${event.tool_name} · ${Math.round(event.elapsed_time_seconds)}s`,
      data: { itemId: event.tool_use_id, toolName: event.tool_name },
    };
  if (event.type === "user") {
    const content = event.message.content;
    if (Array.isArray(content)) {
      const results = content.filter((block) => block.type === "tool_result");
      if (results.length)
        return {
          type: "tool_result",
          data: {
            results: results.map((block) => ({
              itemId: block.tool_use_id,
              failed: Boolean(block.is_error),
              output:
                typeof block.content === "string" ? safeMessage(block.content) : "Tool completed",
            })),
          },
          message: results
            .map((block) =>
              typeof block.content === "string"
                ? block.content
                : Array.isArray(block.content)
                  ? block.content
                      .map((part) => (part.type === "text" ? part.text : `[${part.type} result]`))
                      .join("\n")
                  : "Tool completed",
            )
            .join("\n"),
        };
    }
  }
  if (event.type === "assistant") {
    const text = event.message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    const tool = event.message.content.find((block) => block.type === "tool_use");
    if (!text && tool)
      return { type: "tool", message: tool.name, data: { itemId: tool.id, toolName: tool.name } };
    return {
      type: "agent_message",
      message: event.message.content
        .flatMap((b) =>
          b.type === "text" ? [b.text] : b.type === "tool_use" ? [`Tool: ${b.name}`] : [],
        )
        .join("\n"),
    };
  }
  if (event.type === "result")
    return {
      type: "usage",
      message:
        event.subtype === "success" && !event.is_error
          ? "Claude turn complete"
          : "Claude turn failed",
      data: {
        usage: event.usage,
        cost: event.total_cost_usd,
        modelUsage: event.modelUsage,
        sessionId: event.session_id,
      },
    };
}

export const claudeAgent: Agent = {
  provider: "claude",
  async run(options) {
    const { workspace, signal, prompt, systemPrompt, jsonSchema, referenceServer, onEvent, model } =
      options;
    signal.throwIfAborted();
    const caveman = await cavemanRuntime(signal);
    signal.throwIfAborted();
    let sessionId = options.sessionId;
    let result: unknown;
    let stream: Query | undefined;
    const closeQuery = () => {
      const current = stream;
      stream = undefined;
      current?.close();
    };
    const abortController = new AbortController();
    const abort = () => {
      abortController.abort(signal.reason);
      closeQuery();
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    let completed = false;
    let terminalAssistantError: SDKAssistantMessageError | undefined;
    try {
      signal.throwIfAborted();
      const images = await Promise.all(
        (options.images || []).map(async (file) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: "image/png" as const,
            data: (await readFile(file)).toString("base64"),
          },
        })),
      );
      const imagePrompt = async function* (): AsyncGenerator<SDKUserMessage> {
        yield {
          type: "user",
          parent_tool_use_id: null,
          session_id: sessionId || "",
          message: { role: "user", content: [{ type: "text", text: prompt }, ...images] },
        };
      };
      signal.throwIfAborted();
      stream = query({
        prompt: images.length ? imagePrompt() : prompt,
        options: {
          cwd: workspace,
          model: model,
          ...(options.reasoningEffort ? { effort: options.reasoningEffort } : {}),
          systemPrompt,
          env: {
            ...childEnvironment(),
            ...caveman?.env,
            ...(caveman
              ? { ANTHROPIC_BASE_URL: `${caveman.url}/w/claude`, ENABLE_TOOL_SEARCH: "auto" }
              : {}),
          },
          includePartialMessages: true,
          persistSession: true,
          abortController,
          ...(sessionId ? { resume: sessionId } : {}),
          settingSources: [],
          ...claudeBundledSkills(workspace, !options.textOnly),
          mcpServers: {
            ...Object.fromEntries(
              Object.entries(options.textOnly ? {} : options.capabilityServers || {}).map(
                ([name, { enabledTools: _tools, toolTimeoutSeconds: _timeout, ...server }]) => [
                  name,
                  { ...server, alwaysLoad: true },
                ],
              ),
            ),
            ...(caveman ? { caveman: { ...caveman.mcp, alwaysLoad: true } } : {}),
            ...(referenceServer
              ? { reference_browser: { ...referenceServer, alwaysLoad: true } }
              : {}),
          },
          strictMcpConfig: true,
          ...(options.exploreBriefSections && !options.textOnly
            ? { agents: briefExplorationAgents(model) }
            : {}),
          tools: options.textOnly
            ? []
            : options.readOnly
              ? [
                  "Read",
                  "Glob",
                  "Grep",
                  "Skill",
                  ...(options.exploreBriefSections ? ["Agent"] : []),
                ]
              : ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Skill"],
          permissionMode: "acceptEdits",
          hooks: {
            PreToolUse: [
              { matcher: "^(Agent|Task)$", hooks: [requireForegroundSubagent] },
              { matcher: "^Bash$", hooks: [async (input) => sdkToolHook(input)] },
            ],
          },
          canUseTool: async (name, input) => {
            for (const [server, capability] of Object.entries(options.capabilityServers || {})) {
              const prefix = `mcp__${server}__`;
              if (
                name.startsWith(prefix) &&
                !capability.enabledTools.includes(name.slice(prefix.length))
              )
                return { behavior: "deny", message: "Capability tool unavailable in this stage" };
            }
            if (options.readOnly && ["Write", "Edit", "Bash"].includes(name))
              return { behavior: "deny", message: "Read-only brief phase" };
            const file =
              (input as { file_path?: string; path?: string }).file_path ||
              (input as { path?: string }).path;
            if (file) {
              const resolved = path.resolve(workspace, file);
              if (resolved !== workspace && !resolved.startsWith(workspace + path.sep))
                return {
                  behavior: "deny",
                  message: "Tool access is restricted to this job workspace",
                };
            }
            return { behavior: "allow", updatedInput: input };
          },
          sandbox: {
            enabled: true,
            autoAllowBashIfSandboxed: true,
            allowUnsandboxedCommands: false,
            filesystem: {
              allowWrite: [workspace],
              denyRead: ["~/.ssh", "~/.aws", "~/.codex/auth.json", "~/.claude/.credentials.json"],
            },
            network: { allowedDomains: [] },
          },
          outputFormat: { type: "json_schema", schema: jsonSchema },
        },
      });
      for await (const e of stream) {
        signal.throwIfAborted();
        const mapped = claudeEvent(e);
        if (mapped) onEvent({ ...mapped, message: safeMessage(mapped.message) });
        signal.throwIfAborted();
        if (e.type === "system" && e.subtype === "init") {
          sessionId = e.session_id;
          if (!options.textOnly)
            for (const skill of bundledSkills)
              if (!e.skills?.includes(skill.claudeName))
                throw Error(
                  `Claude did not load the bundled ${skill.name} skill. No generation can proceed with this session.`,
                );
        }
        if (e.type === "system" && e.subtype === "api_retry") terminalAssistantError = undefined;
        if (e.type === "assistant" && e.parent_tool_use_id == null)
          terminalAssistantError = e.error;
        if (e.type === "result") {
          completed = true;
          sessionId = e.session_id;
          if (e.subtype !== "success" || e.is_error) {
            if (
              terminalAssistantError === "overloaded" &&
              (e.subtype === "error_during_execution" || e.subtype === "success")
            )
              throw new ModelCapacityError("Claude is temporarily overloaded", "claude");
            throw Error(e.subtype === "success" ? e.result : e.errors.join("; "));
          }
          result = e.structured_output ?? JSON.parse(e.result);
        }
      }
      signal.throwIfAborted();
      if (!completed) throw Error("Claude stream ended without a completed turn");
    } catch (error) {
      if (!signal.aborted && !completed && terminalAssistantError === "overloaded")
        throw new ModelCapacityError("Claude is temporarily overloaded", "claude");
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
      closeQuery();
    }

    return { result, sessionId };
  },
};
