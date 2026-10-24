import deepmerge from "@fastify/deepmerge";
import { z } from "zod";

const mergeDefined = deepmerge({
  onlyDefinedProperties: true,
  mergeArray:
    ({ clone }) =>
    (_previous, replacement) =>
      clone(replacement),
});

export const correctionMergeGuidance =
  "CORRECTION MERGE: Apply only the assigned change to currentManifest. The application merges your returned JSON into the accepted manifest before validating it. Omitted or undefined fields retain their existing values; explicit values replace them. Objects merge recursively; arrays replace the entire array, never append. Return a complete replacement for any array you change. Explicit null clears a field only where the schema permits it; never use null as a placeholder for unchanged data. Preserve unrelated content, asset references, audio, scene order and timing. Keep currentManifest and all unrelated source files unchanged except for the focused repair.";

/** Merge a model correction without mutating the accepted value, then validate the complete result. */
export function mergeCorrection<T>(current: unknown, correction: unknown, schema: z.ZodType<T>): T {
  const fields = z.record(z.string(), z.unknown()).parse(correction);
  return schema.parse(mergeDefined(current ?? {}, fields));
}
