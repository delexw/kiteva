import { applyPatch, type Operation } from "rfc6902";
import { z } from "zod";
import { BriefCorrectionSchema } from "../../../../shared/agents/schemas/brief-correction";

/** Apply guarded edits atomically, preserving the original even if a later edit is invalid. */
export function applyBriefCorrection<T>(draft: T, input: unknown, schema: z.ZodType<T>): T {
  const correction = BriefCorrectionSchema.parse(input);
  const revised = structuredClone(draft);
  for (const [index, edit] of correction.edits.entries()) {
    const operations: Operation[] = [];
    if (edit.op !== "add") operations.push({ op: "test", path: edit.path, value: edit.expected });
    const guarded = applyPatch(revised, operations).find((result) => result !== null);
    if (guarded)
      throw Error(`Brief edit ${index + 1} at ${edit.path} rejected: ${guarded.message}`, {
        cause: guarded,
      });
    const operation: Operation =
      edit.op === "remove"
        ? { op: edit.op, path: edit.path }
        : { op: edit.op, path: edit.path, value: edit.value };
    const failure = applyPatch(revised, [operation]).find((result) => result !== null);
    if (failure)
      throw Error(`Brief edit ${index + 1} at ${edit.path} rejected: ${failure.message}`, {
        cause: failure,
      });
  }
  return schema.parse(revised);
}

/** Retry rejected edits against the unchanged valid draft, never a partly applied batch. */
export async function reviseBriefWithRetry<T>(input: {
  draft: T;
  schema: z.ZodType<T>;
  signal: AbortSignal;
  sessionId?: string;
  revise: (
    sessionId: string | undefined,
    previousIssue: string,
  ) => Promise<{ value: unknown; sessionId?: string }>;
}): Promise<{ value: T; sessionId?: string }> {
  let sessionId = input.sessionId;
  let previousIssue = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    input.signal.throwIfAborted();
    const correction = await input.revise(sessionId, previousIssue);
    if (correction.sessionId) sessionId = correction.sessionId;
    input.signal.throwIfAborted();
    try {
      return {
        value: applyBriefCorrection(input.draft, correction.value, input.schema),
        sessionId,
      };
    } catch (error) {
      input.signal.throwIfAborted();
      const issue = error instanceof Error ? error.message : "Invalid brief correction";
      if (attempt === 2)
        throw Error(`Brief correction rejected after 3 attempts: ${issue}`, { cause: error });
      previousIssue = `${issue}\nThe entire edit batch was rejected; currentDraft is unchanged. Read currentDraft again, locate the intended scene or asset by its stable ID, and derive its current array index. Return a complete corrected batch of leaf edits for only the assigned issue, with exact expected values. Do not repeat an index from an earlier draft or return the full brief.`;
    }
  }
  throw Error("Validated brief correction unavailable");
}
