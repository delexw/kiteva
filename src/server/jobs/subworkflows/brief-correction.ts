import { applyPatch, type Operation } from "rfc6902";
import { z } from "zod";
import { BriefCorrectionSchema } from "../../../shared/agents/schemas/brief-correction";

/** Apply guarded edits atomically, preserving the original even if a later edit is invalid. */
export function applyBriefCorrection<T>(draft: T, input: unknown, schema: z.ZodType<T>): T {
  const correction = BriefCorrectionSchema.parse(input);
  const revised = structuredClone(draft);
  for (const edit of correction.edits) {
    const operations: Operation[] = [];
    if (edit.op !== "add") operations.push({ op: "test", path: edit.path, value: edit.expected });
    const guarded = applyPatch(revised, operations).find((result) => result !== null);
    if (guarded) throw guarded;
    const operation: Operation =
      edit.op === "remove"
        ? { op: edit.op, path: edit.path }
        : { op: edit.op, path: edit.path, value: edit.value };
    const failure = applyPatch(revised, [operation]).find((result) => result !== null);
    if (failure) throw failure;
  }
  return schema.parse(revised);
}
