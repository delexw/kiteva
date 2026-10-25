import { commandActivity } from "./command-activity";
import { ModelCapacityError } from "./capacity-error";
import { cavemanRuntime, codexCavemanAuth, codexCavemanProvider } from "./caveman";
import { Codex, type ThreadEvent } from "@openai/codex-sdk";
import { isolatedCodexHome } from "./sdk-home";
import { enabledReferenceTools } from "../requests/reference-browser-contracts";
import { childEnvironment, safeMessage } from "../runtime/config";
import type { Agent, ProviderEvent } from "./agent";

export function codexEvent(event: ThreadEvent): ProviderEvent | undefined {
  if (event.type === "thread.started")
    return {
      type: "session",
      message: "Codex session opened",
      data: { sessionId: event.thread_id },
    };
  if (event.type === "turn.completed")
    return {
      type: "usage",
      message: "Codex turn complete",
      // Installed exec reports cumulative thread counters, including resumed turns.
      data: { ...event.usage, usageScope: "session" },
    };
  if (event.type === "turn.failed") return { type: "error", message: event.error.message };
  if (event.type === "error") return { type: "warning", message: event.message };
  if ("item" in event) {
    const i = event.item;
    return {
      type: i.type,
      message:
        i.type === "agent_message" || i.type === "reasoning"
          ? i.text
          : i.type === "command_execution"
            ? `${i.command}\n${i.aggregated_output}`
            : i.type === "file_change"
              ? i.changes.map((c) => `${c.kind}: ${c.path}`).join("\n")
              : i.type === "error"
                ? i.message
                : i.type === "todo_list"
                  ? i.items.map((t) => `${t.completed ? "✓" : "○"} ${t.text}`).join("\n")
                  : i.type === "mcp_tool_call"
                    ? `${i.server}: ${i.tool}`
                    : i.type === "web_search"
                      ? i.query
                      : "Agent activity",
      data: {
        itemId: i.id,
        state: event.type,
        ...(i.type === "command_execution"
          ? {
              activity: commandActivity(i.command),
              failed: i.status === "failed" || (i.exit_code !== undefined && i.exit_code !== 0),
            }
          : {}),
        ...(i.type === "file_change" ? { activity: "editing", failed: i.status === "failed" } : {}),
        ...(i.type === "mcp_tool_call"
          ? {
              toolName: `${i.server}: ${i.tool}`,
              failed:
                i.status === "failed" ||
                Boolean(i.error) ||
                (i.result?.structured_content as { kind?: string } | undefined)?.kind === "error",
            }
          : {}),
      },
    };
  }
}

const codexTransportRetries = { request_max_retries: 6, stream_max_retries: 8 } as const;

export const codexAgent: Agent = {
  provider: "codex",
  async run(options) {
    const { workspace, signal, prompt, systemPrompt, jsonSchema, referenceServer, onEvent, model } =
      options;
    signal.throwIfAborted();
    const caveman = await cavemanRuntime(signal);
    signal.throwIfAborted();
    let sessionId = options.sessionId;
    const home = await isolatedCodexHome(sessionId);
    signal.throwIfAborted();
    let result: unknown;
    const client = new Codex({
      env: {
        ...childEnvironment(workspace),
        ...caveman?.env,
        CODEX_HOME: home,
        // Codex also discovers user skills under HOME/.agents, independently of CODEX_HOME.
        HOME: home,
        ...(process.platform === "win32" ? { USERPROFILE: home } : {}),
      },
      config: {
        ...(process.platform === "win32" ? { windows: { sandbox: "elevated" } } : {}),
        ...(caveman
          ? {
              model_provider: "caveman",
              model_providers: {
                caveman: {
                  ...codexCavemanProvider(caveman.url, await codexCavemanAuth(home)),
                  ...codexTransportRetries,
                },
              },
            }
          : {}),
        mcp_servers: {
          ...Object.fromEntries(
            Object.entries(options.textOnly ? {} : options.capabilityServers || {}).map(
              ([name, { enabledTools, toolTimeoutSeconds = 60, ...server }]) => [
                name,
                {
                  ...server,
                  enabled_tools: enabledTools,
                  tools: Object.fromEntries(
                    enabledTools.map((tool) => [tool, { approval_mode: "approve" }]),
                  ),
                  tool_timeout_sec: toolTimeoutSeconds,
                },
              ],
            ),
          ),
          ...(caveman
            ? {
                caveman: {
                  ...caveman.mcp,
                  enabled_tools: ["caveman_retrieve"],
                  tools: { caveman_retrieve: { approval_mode: "approve" } },
                },
              }
            : {}),
          ...(referenceServer
            ? {
                reference_browser: {
                  ...referenceServer,
                  enabled_tools: enabledReferenceTools(
                    options.readOnly || options.enableVideoCapture === false,
                  ),
                  tools: Object.fromEntries(
                    enabledReferenceTools(
                      options.readOnly || options.enableVideoCapture === false,
                    ).map((name) => [name, { approval_mode: "approve" }]),
                  ),
                  tool_timeout_sec: 180,
                },
              }
            : {}),
        },
        ...(options.exploreBriefSections && !options.textOnly
          ? { features: { multi_agent: true }, agents: { max_threads: 1, max_depth: 1 } }
          : {}),
        project_doc_max_bytes: 0,
      },
    });
    const opts = {
      model: model,
      workingDirectory: workspace,
      skipGitRepoCheck: true,
      approvalPolicy: "never" as const,
      sandboxMode: options.readOnly ? ("read-only" as const) : ("workspace-write" as const),
      networkAccessEnabled: !options.textOnly,
      webSearchMode: "disabled" as const,
      ...(options.reasoningEffort ? { modelReasoningEffort: options.reasoningEffort } : {}),
    };
    signal.throwIfAborted();
    const thread = sessionId ? client.resumeThread(sessionId, opts) : client.startThread(opts);
    const input = options.images?.length
      ? [
          { type: "text" as const, text: `${systemPrompt}\n\n${prompt}` },
          ...options.images.map((path) => ({ type: "local_image" as const, path })),
        ]
      : `${systemPrompt}\n\n${prompt}`;
    const { events } = await thread.runStreamed(input, {
      signal,
      outputSchema: jsonSchema,
    });
    let completed = false;
    let answer = "";
    for await (const e of events) {
      signal.throwIfAborted();
      if (
        options.textOnly &&
        "item" in e &&
        (["command_execution", "file_change", "web_search"].includes(e.item.type) ||
          (e.item.type === "mcp_tool_call" &&
            !(caveman && e.item.server === "caveman" && e.item.tool === "caveman_retrieve")))
      )
        throw Error(
          "Motion Graphic extraction requires a text-only model response; tool activity was rejected",
        );
      const mapped = codexEvent(e);
      if (mapped) onEvent({ ...mapped, message: safeMessage(mapped.message) });
      signal.throwIfAborted();
      if (e.type === "thread.started") sessionId = e.thread_id;
      if (e.type === "item.completed" && e.item.type === "agent_message") answer = e.item.text;
      if (e.type === "turn.failed") {
        if (/\bmodel is (?:currently )?at capacity\b/i.test(e.error.message))
          throw new ModelCapacityError(e.error.message, "codex");
        throw Error(e.error.message);
      }
      if (e.type === "turn.completed") completed = true;
    }
    signal.throwIfAborted();
    if (!completed) throw Error("Codex stream ended without a completed turn");
    result = JSON.parse(answer);

    return { result, sessionId };
  },
};
