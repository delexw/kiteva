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
