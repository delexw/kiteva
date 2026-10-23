import { z } from "zod";
import type { CaptureChapterTiming } from "../../../../shared/capture-chapters";
import type { ProviderEvent } from "../../../agents/agent";

export function emitChapterTiming(
  onEvent: (event: ProviderEvent) => void,
  timing: CaptureChapterTiming,
) {
  onEvent({
    type: "capture_timing",
    message: "Chapter capture timing",
    data: { captureTiming: timing },
  });
}

/** Observe successful native results; tool dispatch itself never owns tracking callbacks. */
export function captureOperationOutcomes(
  event: ProviderEvent,
): Array<Pick<CaptureChapterTiming, "phase" | "status">> {
  if (event.type !== "tool_result") return [];
  const parsed = z
    .object({ results: z.array(z.object({ failed: z.boolean(), output: z.string() })) })
    .safeParse(event.data);
  if (!parsed.success) return [];
  const outcomes: Array<Pick<CaptureChapterTiming, "phase" | "status">> = [];
  for (const result of parsed.data.results) {
    if (result.failed) continue;
    let output: unknown;
    try {
      output = JSON.parse(result.output);
    } catch {
      continue;
    }
    const reply = z
      .object({
        kind: z.string(),
        operation: z.string().optional(),
        isError: z.boolean().optional(),
        content: z.array(z.object({ type: z.string() })).optional(),
      })
      .safeParse(output);
    if (!reply.success || reply.data.isError) continue;
    if (reply.data.kind === "recording_started")
      outcomes.push({ phase: "recording", status: "running" });
    if (reply.data.kind === "editable_capture")
      outcomes.push({ phase: "recording", status: "complete" });
    if (reply.data.kind !== "native_capture") continue;
    if (["addSpeed", "setSpeed"].includes(reply.data.operation ?? ""))
      outcomes.push({ phase: "speed", status: "complete" });
    if (
      reply.data.operation === "getFrames" &&
      reply.data.content?.some((content) => content.type === "image")
    )
      outcomes.push({ phase: "review", status: "complete" });
  }
  return outcomes;
}
