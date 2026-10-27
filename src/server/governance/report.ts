import { codexApiCost } from "./codex-pricing";
import { jevApiCost } from "./jev-pricing";
import type { ClaudeTokenUsage } from "./token-usage";
import type { AgentProgressEvent, Run } from "../../shared/contracts";
import { isRunSettled } from "../../shared/contracts";
import { projectName } from "../../shared/project-name";
import { jobAuthoringSelection } from "./authoring-selections";
import {
  correctionActivityPurpose,
  type GovernanceProject,
  type ModelActivity,
} from "../../shared/governance";

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export function projectGovernance(
  run: Run,
  events: AgentProgressEvent[],
  now = Date.now(),
): GovernanceProject {
  const rows = new Map<string, ModelActivity>();
  const sessions = new Map<string, string>();
  const tools = new Set<string>();
  const calls = new Set<string>();
  const usageEvents = new Set<string>();
  const snapshots = new Map<string, Record<string, number>>();
  const snapshotIncrements = (key: string, values: Record<string, unknown>) => {
    const previous = snapshots.get(key) || {};
    const current = { ...previous };
    const increments: Record<string, number | null> = {};
    for (const [field, value] of Object.entries(values)) {
      const count = numeric(value);
      increments[field] =
        count === null
          ? null
          : count >= (previous[field] || 0)
            ? count - (previous[field] || 0)
            : count;
      if (count !== null) current[field] = count;
    }
    snapshots.set(key, current);
    return increments;
  };
  let incompleteHistory = false;
  const rowFor = (model: string, purpose: string) => {
    const key = `${model}|${purpose}`;
    if (!rows.has(key))
      rows.set(key, {
        model,
        purpose,
        calls: 0,
        tools: 0,
        cacheHits: 0,
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        uncachedInputTokens: null,
        cacheWriteTokens: null,
        cacheWrite5mTokens: null,
        cacheWrite1hTokens: null,
        costLow: null,
        costHigh: null,
        costBasis: "Not reported",
      });
    return rows.get(key)!;
  };
  const addUsage = (
    row: ModelActivity,
    input: number | null,
    output: number | null,
    cached: number | null,
    low: number | null,
    high: number | null,
    basis: string,
    details?: ClaudeTokenUsage,
  ) => {
    if (details) {
      for (const [field, count] of [
        ["uncachedInputTokens", details.input],
        ["cacheWriteTokens", details.writes],
        ["cacheWrite5mTokens", details.writes5m],
        ["cacheWrite1hTokens", details.writes1h],
      ] as const)
        if (count !== null) row[field] = (row[field] ?? 0) + count;
    }
    if (input !== null) row.inputTokens = (row.inputTokens ?? 0) + input;
    if (output !== null) row.outputTokens = (row.outputTokens ?? 0) + output;
    if (cached !== null) row.cachedTokens = (row.cachedTokens ?? 0) + cached;
    if (low !== null) row.costLow = (row.costLow ?? 0) + low;
    if (high !== null) row.costHigh = (row.costHigh ?? 0) + high;
    row.costBasis = basis;
  };
  const resolvedModels = new Map<string, string>();
  for (const event of events) {
    const d = record(event.data);
    if (event.type === "usage" && typeof d.invocationId === "string" && typeof d.model === "string")
      resolvedModels.set(d.invocationId, d.model);
  }
  for (const event of events) {
    const d = record(event.data);
    const job = run.jobs.find((j) => j.id === event.jobId);
    const scope = String(d.invocationId || event.jobId || "preparation");
    if (event.type === "session" && typeof d.sessionId === "string")
      sessions.set(scope, d.sessionId);
    if (
      ![
        "invocation",
        "usage",
        "summary_cache",
        "tool",
        "command_execution",
        "file_change",
        "mcp_tool_call",
        "web_search",
      ].includes(event.type)
    )
      continue;
    const model =
      resolvedModels.get(String(d.invocationId)) ||
      (typeof d.model === "string" ? d.model : job?.model || "Unrecorded model");
    const purpose =
      correctionActivityPurpose(d) ??
      (typeof d.purpose === "string"
        ? d.purpose
        : job
          ? `${job.kind} ${job.outputType === "page" ? "HTML" : "video"} generation`
          : "Historical activity · function unrecorded");
    if (!d.invocationId && event.type !== "summary_cache") incompleteHistory = true;
    const row = rowFor(model, purpose);
    if (purpose === "Combination evaluation" && run.rankingModel === model) {
      row.combinationEvaluation ||= {
        selected: run.candidates.map((candidate) => ({
          id: candidate.id,
          title: candidate.displayTitle || candidate.id,
          styles: [candidate.primaryStyleId, ...candidate.supportingStyleIds],
          rationale: candidate.rationale,
          score: candidate.score,
          confidence: candidate.confidence,
          evaluationConfidence: candidate.evaluationConfidence,
          selectionDecision: candidate.selectionDecision,
          dimensions: candidate.dimensions,
        })),
        calls: [],
      };
      if (
        event.type === "invocation" &&
        typeof d.invocationId === "string" &&
        d.prompt &&
        !row.combinationEvaluation.calls.some((call) => call.id === d.invocationId)
      ) {
        row.combinationEvaluation.calls.push({
          id: d.invocationId,
          time: event.time,
          promptUrl: `/api/admin/governance/${encodeURIComponent(run.id)}/prompts/${encodeURIComponent(d.invocationId)}`,
        });
      }
    }
    if (job && !row.authoringSelections?.some((entry) => entry.jobId === job.id)) {
      const selection = jobAuthoringSelection(run, job, purpose, model);
      if (selection) (row.authoringSelections ||= []).push(selection);
    }
    if (event.type === "summary_cache") {
      row.cacheHits++;
      continue;
    }
    if (event.type === "invocation" || event.type === "usage") {
      const key = `${model}|${scope}`;
      if (!calls.has(key)) {
        row.calls++;
        calls.add(key);
      }
    }
    if (
      ["tool", "command_execution", "file_change", "mcp_tool_call", "web_search"].includes(
        event.type,
      )
    ) {
      if (!d.itemId) {
        incompleteHistory = true;
        continue;
      }
      const key = `${scope}|${sessions.get(scope) || ""}|${d.itemId}`;
      if (!tools.has(key)) {
        row.tools++;
        tools.add(key);
      }
    }
    if (event.type !== "usage") continue;
    const usageKey = d.invocationId ? String(d.invocationId) : String(event.id);
    if (usageEvents.has(usageKey)) continue;
    usageEvents.add(usageKey);
    const modelUsage = record(d.modelUsage);
    if (Object.keys(modelUsage).length) {
      for (const [actualModel, value] of Object.entries(modelUsage)) {
        const u = record(value);
        const actualRow =
          actualModel === model
            ? row
            : rowFor(actualModel, "Additional SDK session usage · task unreported");
        const sessionKey = `${d.sessionId || sessions.get(scope) || scope}|${actualModel}`;
        const increments = snapshotIncrements(sessionKey, {
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          cacheReadInputTokens: u.cacheReadInputTokens,
          cacheCreationInputTokens: u.cacheCreationInputTokens,
          costUSD: u.costUSD,
        });
        const input = increments.inputTokens;
        const output = increments.outputTokens;
        const cached = increments.cacheReadInputTokens;
        const writes = increments.cacheCreationInputTokens;
        const cost = increments.costUSD;
        const ttl = record(record(d.usage).cache_creation);
        const matchesTurnWrites =
          actualModel === model && numeric(record(d.usage).cache_creation_input_tokens) === writes;
        const usage: ClaudeTokenUsage = {
          input,
          output,
          reads: cached,
          writes,
          writes5m: matchesTurnWrites ? numeric(ttl.ephemeral_5m_input_tokens) : null,
          writes1h: matchesTurnWrites ? numeric(ttl.ephemeral_1h_input_tokens) : null,
        };
        addUsage(
          actualRow,
          input === null ? null : input + (cached || 0) + (writes || 0),
          output,
          cached,
          cost,
          cost,
          "SDK estimate · session increments",
          usage,
        );
      }
      continue;
    }
    const u = d.usage ? record(d.usage) : d;
    let input = numeric(u.input_tokens);
    let output = numeric(u.output_tokens);
    let cached = numeric(u.cached_input_tokens) ?? numeric(u.cache_read_input_tokens);
    let writes = numeric(u.cache_write_input_tokens) ?? numeric(u.cache_creation_input_tokens);
    const codex = d.provider === "codex" || (d.provider === undefined && model.startsWith("gpt-"));
    if (codex && d.usageScope !== "turn") {
      const sessionId =
        typeof d.sessionId === "string" && d.sessionId ? d.sessionId : sessions.get(scope);
      if (sessionId) {
        // Verified exec behavior: resumed turns report cumulative thread usage.
        // The counter belongs to the thread, including when its selected model changes.
        const increments = snapshotIncrements(`codex|${sessionId}`, {
          input,
          output,
          cached,
          writes,
        });
        input = increments.input;
        output = increments.output;
        cached = increments.cached;
        writes = increments.writes;
      } else {
        incompleteHistory = true;
      }
    }
    const claude = d.provider === "claude" || model.startsWith("claude-");
    let low: number | null = null;
    let high: number | null = null;
    let basis = "Usage unavailable or unpriced model";
    const ttl = record(u.cache_creation);
    const usage: ClaudeTokenUsage = {
      input: claude
        ? input
        : input === null
          ? null
          : Math.max(0, input - (cached || 0) - (writes || 0)),
      output,
      reads: cached,
      writes,
      writes5m: numeric(ttl.ephemeral_5m_input_tokens),
      writes1h: numeric(ttl.ephemeral_1h_input_tokens),
    };
    if (numeric(d.cost) !== null) {
      const cost = numeric(d.cost)!;
      if (claude || (codex && d.usageScope !== "turn")) {
        const key = `${d.sessionId || sessions.get(scope) || scope}|reported-cost`;
        const increments = snapshotIncrements(key, { cost });
        low = high = increments.cost;
        basis = "SDK estimate · session increments";
      } else {
        low = high = cost;
        basis = "SDK reported cost";
      }
    } else if (codex && input !== null && output !== null && cached !== null) {
      low = high = codexApiCost(model, {
        input_tokens: input,
        cached_input_tokens: cached,
        cache_write_input_tokens: writes ?? 0,
        output_tokens: output,
      });
      basis = low === null ? "Not reported" : "Standard API estimate · short-context rates";
    } else if (d.provider === "jev" && input !== null) {
      low = high = jevApiCost(model, input);
      basis = low === null ? "Not reported" : "Standard API estimate · input tokens";
    } else basis = "Not reported";
    addUsage(
      row,
      input === null ? null : claude ? input + (cached || 0) + (writes || 0) : input,
      output,
      cached,
      low,
      high,
      basis,
      usage,
    );
    if (claude) {
      const key = `${d.sessionId || sessions.get(scope) || scope}|${model}`;
      const previous = snapshots.get(key) || {};
      snapshots.set(key, {
        inputTokens: (previous.inputTokens || 0) + (input || 0),
        outputTokens: (previous.outputTokens || 0) + (output || 0),
        cacheReadInputTokens: (previous.cacheReadInputTokens || 0) + (cached || 0),
        cacheCreationInputTokens: (previous.cacheCreationInputTokens || 0) + (writes || 0),
        costUSD: numeric(d.cost) ?? previous.costUSD ?? 0,
      });
    }
  }
  const finishedTimes = [
    ...run.jobs.map((j) => j.finishedAt),
    ...events.filter((e) => ["state", "error", "interrupted"].includes(e.type)).map((e) => e.time),
  ].filter((t): t is string => Boolean(t));
  const finished = isRunSettled(run) && finishedTimes.length ? finishedTimes.sort().at(-1)! : null;
  return {
    id: run.id,
    name: projectName(run),
    status: run.phase,
    started: run.createdAt,
    finished,
    durationMs:
      !finished && isRunSettled(run)
        ? null
        : Math.max(
            0,
            (finished
              ? Date.parse(finished)
              : isRunSettled(run)
                ? Date.parse(run.createdAt)
                : now) - Date.parse(run.createdAt),
          ),
    request: run.request,
    attachments: [],
    selectedStyles: [
      ...new Set(run.candidates.flatMap((c) => [c.primaryStyleId, ...c.supportingStyleIds])),
    ],
    activity: [...rows.values()],
    prompts: events
      .filter(
        (event) =>
          event.type === "invocation" && typeof record(event.data).invocationId === "string",
      )
      .map((event) => {
        const data = record(event.data);
        return {
          id: String(data.invocationId),
          model:
            resolvedModels.get(String(data.invocationId)) ||
            String(data.model || "Unrecorded model"),
          purpose: correctionActivityPurpose(data) || String(data.purpose || "Unrecorded function"),
          time: event.time,
          jobId: event.jobId,
          source: data.prompt ? ("recorded" as const) : ("historical" as const),
        };
      }),
    incompleteHistory,
  };
}
