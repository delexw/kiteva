/** Standard global API USD per million tokens, verified 2026-10-24.
 * https://platform.claude.com/docs/en/about-claude/pricing
 */
const rates = {
  "claude-opus-5-5": { input: 4, output: 20, read: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, read: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, read: 0.01 },
} as const;

export interface ClaudeTokenUsage {
  input: number | null;
  output: number | null;
  reads: number | null;
  writes: number | null;
  writes5m: number | null;
  writes1h: number | null;
}

/** Session totals cannot establish individual request lengths or missing cache TTLs. */
export function claudeApiCost(model: string, usage: ClaudeTokenUsage) {
  const rate = rates[model as keyof typeof rates];
  if (
    !rate ||
    Object.values(usage).some((value) => value !== null && (!Number.isFinite(value) || value < 0))
  )
    return null;
  const { input, output, reads, writes, writes5m, writes1h } = usage;
  if (input === null || output === null || reads === null || writes === null) return null;
  const knownWrites = writes5m !== null && writes1h !== null && writes5m + writes1h === writes;
  const base = input * rate.input + output * rate.output + reads * rate.read;
  const low =
    (base +
      (knownWrites
        ? writes5m * rate.input * 1.25 + writes1h * rate.input * 2
        : writes * rate.input * 1.25)) /
    1e6;
  const high =
    (base +
      (knownWrites
        ? writes5m * rate.input * 1.25 + writes1h * rate.input * 2
        : writes * rate.input * 2)) /
    1e6;
  // Haiku's per-request >100k-token premium cannot be inferred from summed turn tokens.
  return {
    low,
    high: model === "claude-haiku-5-5" ? high * 5 : high,
    basis:
      knownWrites && model !== "claude-haiku-5-5"
        ? "Standard API equivalent"
        : "Standard API equivalent · cache/context range",
  };
}
