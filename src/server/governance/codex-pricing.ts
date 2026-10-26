import type { Usage } from "@openai/codex-sdk";

// Standard short-context API USD per million tokens, verified 2026-10-26.
// https://developers.openai.com/api/docs/pricing
const rates: Record<string, { input: number; cached: number; write: number; output: number }> = {
  "gpt-6-astra": { input: 10, cached: 1, write: 12.5, output: 50 },
  "gpt-6.1-sol": { input: 2, cached: 0.1, write: 2.5, output: 10 },
  "gpt-6-luna": { input: 0.1, cached: 0.01, write: 0.125, output: 0.5 },
};
type PricedUsage = Pick<
  Usage,
  "input_tokens" | "cached_input_tokens" | "cache_write_input_tokens" | "output_tokens"
>;

/** Price new usage only: cached reads/writes are subsets of input, reasoning is part of output. */
export function codexApiCost(model: string, usage: PricedUsage): number | null {
  const rate = Object.hasOwn(rates, model) ? rates[model] : undefined;
  if (!rate || Object.values(usage).some((count) => !Number.isFinite(count) || count < 0))
    return null;
  const {
    input_tokens: input,
    cached_input_tokens: cached,
    cache_write_input_tokens: writes,
    output_tokens: output,
  } = usage;
  if (cached + writes > input) return null;
  return (
    ((input - cached - writes) * rate.input +
      cached * rate.cached +
      writes * rate.write +
      output * rate.output) /
    1e6
  );
}
