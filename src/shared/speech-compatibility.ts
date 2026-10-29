/** Retired providers are accepted only at saved-data/request boundaries, never as runtime engines. */
export function normalizeRetiredSpeechSelections<T>(value: T): T {
  if (Array.isArray(value)) return value.map(normalizeRetiredSpeechSelections) as T;
  if (!value || typeof value !== "object") return value;
  const fields = value as Record<string, unknown>;
  const normalized = Object.fromEntries(
    Object.entries(fields).map(([key, entry]) => [key, normalizeRetiredSpeechSelections(entry)]),
  );
  if (
    fields.mode === "narration" &&
    (fields.engine === "qwen3-tts" || fields.engine === "qwen3-tts-base")
  ) {
    normalized.engine = "ming-tts";
    normalized.voice = "ming_original_female";
  }
  return normalized as T;
}
