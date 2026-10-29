import { z } from "zod";
import { ActivityScopeSchema } from "./activity-scopes";
import { CaptureChapterProgressSchema, CaptureChapterTimingSchema } from "./capture-chapters";
import { SubtitleProgressSchema } from "./subtitle-progress";
import type { AgentProgressEvent } from "./contracts";

export const activityPageSize = 500;
export const summaryEventLimit = 256;
const scopeLimit = 128;
export type ProjectActivityPage = {
  events: AgentProgressEvent[];
  before: number;
  after: number;
  hasOlder: boolean;
  hasNewer: boolean;
};

/** Activity needs statuses and labels, never provider prompts or raw tool output. */
export function projectActivityEvent(event: AgentProgressEvent): AgentProgressEvent | undefined {
  const source = (event.data || {}) as Record<string, unknown>;
  if (["invocation", "reasoning"].includes(event.type)) return undefined;
  if (
    ["text_start", "text_delta", "agent_message"].includes(event.type) &&
    source.audience !== "customer"
  )
    return undefined;
  const data: Record<string, unknown> = {};
  for (const key of [
    "itemId",
    "activityScopeId",
    "audience",
    "state",
    "toolName",
    "activity",
    "failed",
    "purpose",
    "invocationId",
    "correctionAttempt",
    "correctionTier",
    "model",
    "renderer",
    "completed",
    "completedFrames",
    "totalFrames",
    "pendingValidation",
    "total",
    "phase",
    "percent",
    "directionRound",
  ])
    if (["string", "number", "boolean"].includes(typeof source[key]))
      data[key] = typeof source[key] === "string" ? source[key].slice(0, 512) : source[key];
  const structured = {
    activityScope: ActivityScopeSchema,
    captureProgress: CaptureChapterProgressSchema,
    captureTiming: CaptureChapterTimingSchema,
    subtitleProgress: SubtitleProgressSchema,
    captureChapter: z.object({
      chapterId: z.string().max(256),
      title: z.string().max(500),
      index: z.number(),
      total: z.number(),
    }),
  };
  for (const [key, schema] of Object.entries(structured)) {
    const value = schema.safeParse(source[key]);
    if (value.success) data[key] = value.data;
  }
  if (Array.isArray(source.results))
    data.results = source.results
      .flatMap((result) =>
        result && typeof result.itemId === "string"
          ? [{ itemId: result.itemId.slice(0, 512), failed: Boolean(result.failed) }]
          : [],
      )
      .slice(0, 100);
  return {
    ...event,
    message: ["tool_result", "usage"].includes(event.type) ? "" : event.message.slice(0, 8000),
    data,
  };
}

/** Bounded UI window, with a separate small allowance for operation ownership metadata. */
export function mergeActivityEvents(
  previous: AgentProgressEvent[],
  incoming: AgentProgressEvent[],
  limit = activityPageSize,
) {
  const entries = new Map(previous.map((event) => [event.id, event]));
  for (const event of incoming) entries.set(event.id, event);
  const ordered = [...entries.values()].sort((a, b) => a.id - b.id);
  const scopes = ordered.filter((event) => event.type === "activity_scope").slice(-scopeLimit);
  const phases = new Map<string, AgentProgressEvent>();
  for (const event of ordered)
    if (event.type === "phase") phases.set(event.jobId || "project", event);
  const rows = ordered
    .filter((event) => event.type !== "activity_scope" && event.type !== "phase")
    .slice(-limit);
  return [...scopes, ...[...phases.values()].slice(-64), ...rows].sort((a, b) => a.id - b.id);
}
