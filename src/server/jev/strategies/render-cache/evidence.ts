import { transformSync } from "esbuild";
import path from "node:path";
import { createPatch } from "rfc6902";
import { z } from "zod";

const fileSchema = z.object({
  hash: z.string(),
  text: z.string().optional(),
  complete: z.boolean(),
});
const evidenceSchema = z.object({
  shot: z.string(),
  unchangedRenderSettings: z.unknown(),
  staticGraphComplete: z.boolean(),
  changes: z.array(
    z.object({ file: z.string(), before: fileSchema.nullable(), after: fileSchema.nullable() }),
  ),
  sourceContext: z.array(fileSchema.partial().extend({ file: z.string() })),
});

export const renderCacheEvidenceBudget = 28000;

/** Hidden paths stay local, even when authored media depends on them. */
export function hasHiddenRenderEvidence(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const evidence = value as { changes?: unknown; sourceContext?: unknown };
  return [evidence.changes, evidence.sourceContext].some(
    (entries) =>
      Array.isArray(entries) &&
      entries.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          "file" in entry &&
          typeof entry.file === "string" &&
          entry.file.split(/[\\/]/).some((part: string) => part.startsWith(".")),
      ),
  );
}

/** Compiler minification saves whitespace, not evidence. File formats never determine reuse. */
function compactSource(file: string, text: string) {
  const loaders = { ".js": "js", ".mjs": "js", ".css": "css" } as const;
  const loader = loaders[path.extname(file) as keyof typeof loaders];
  if (!loader) return { encoding: "original", text };
  try {
    const result = transformSync(text, {
      loader,
      minify: true,
      legalComments: "none",
      logLevel: "silent",
    });
    return result.code.length < text.length
      ? { encoding: "compiler-minified", text: result.code }
      : { encoding: "original", text };
  } catch {
    return { encoding: "original", text };
  }
}

/** Facts only: hashes, complete source and library-generated line patches. No AI summary or impact rules. */
export function renderCacheEvidence(value: unknown) {
  if (hasHiddenRenderEvidence(value)) throw Error("Hidden render inputs stay local");
  const evidence = evidenceSchema.parse(value);
  const sourceContext = evidence.sourceContext.map(({ file, text, hash, complete }) => ({
    file,
    hash,
    complete,
    ...(text === undefined ? {} : compactSource(file, text)),
  }));
  const changes = evidence.changes.map(({ file, before, after }) => {
    const beforeLines = before?.complete ? before.text?.split("\n") : undefined;
    const afterLines = after?.complete ? after.text?.split("\n") : undefined;
    // The library's array diff is quadratic; large line sets retain snapshots instead.
    const usePatch = beforeLines && afterLines && beforeLines.length * afterLines.length <= 250000;
    return {
      file,
      beforeHash: before?.hash ?? null,
      afterHash: after?.hash ?? null,
      content: usePatch
        ? {
            encoding: "json-patch-lines",
            patch: createPatch(beforeLines, afterLines),
            reversePatch: createPatch(afterLines, beforeLines),
          }
        : {
            encoding: "snapshots",
            before: before && { complete: before.complete, text: before.text },
            after: after && { complete: after.complete, text: after.text },
          },
    };
  });
  const state = {
    shot: evidence.shot,
    unchangedRenderSettings: evidence.unchangedRenderSettings,
    staticGraphComplete: evidence.staticGraphComplete,
    sourceContext,
    changes,
  };
  const bytes = Buffer.byteLength(JSON.stringify(state));
  if (bytes > renderCacheEvidenceBudget)
    throw Error(
      `Shot evidence is ${bytes} bytes; review budget is ${renderCacheEvidenceBudget} bytes (no evidence omitted)`,
    );
  return state;
}
