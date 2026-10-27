/** Normalize legacy subtitle field names at saved-data and request boundaries. */
export function normalizeSubtitleFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(normalizeSubtitleFields) as T;
  if (!value || typeof value !== "object") return value;
  const fields = value as Record<string, unknown>;
  const aliases: Record<string, string> = {
    lyrics: "subtitles",
    showLyrics: "showSubtitles",
    generatedLyrics: "generatedSubtitles",
    lyricsEnabled: "subtitlesEnabled",
    lyricsText: "subtitlesText",
  };
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => !Object.hasOwn(aliases, key) || !Object.hasOwn(fields, aliases[key]))
      .map(([key, entry]) => [
        Object.hasOwn(aliases, key) ? aliases[key] : key,
        (key === "source" || key === "preparationStep") && entry === "lyrics"
          ? "subtitles"
          : key === "purpose" && entry === "Lyrics generation"
            ? "Subtitles generation"
            : key === "message" && entry === "Lyrics ready"
              ? "Subtitles ready"
              : normalizeSubtitleFields(entry),
      ]),
  ) as T;
}

/** Include legacy wire aliases while an older backend may still own an active build. */
export function subtitleCompatibilityPayload<T>(value: T): T {
  if (Array.isArray(value)) return value.map(subtitleCompatibilityPayload) as T;
  if (!value || typeof value !== "object") return value;
  const legacyNames: Record<string, string> = {
    subtitles: "lyrics",
    showSubtitles: "showLyrics",
    generatedSubtitles: "generatedLyrics",
    subtitlesEnabled: "lyricsEnabled",
    subtitlesText: "lyricsText",
  };
  return Object.fromEntries(
    Object.entries(normalizeSubtitleFields(value)).flatMap(([key, entry]) => {
      const mapped =
        key === "source" && entry === "subtitles" ? "lyrics" : subtitleCompatibilityPayload(entry);
      return Object.hasOwn(legacyNames, key)
        ? [
            [key, mapped],
            [legacyNames[key], mapped],
          ]
        : [[key, mapped]];
    }),
  ) as T;
}
