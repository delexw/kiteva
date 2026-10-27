// USD per million input tokens; output is free. Verified 2026-10-27.
// https://docs.typesafe.ai/models
const inputRates: Record<string, number> = {
  "jev-1.13.0": 0.042,
  "jev-1.14.0": 0.042,
};

export function jevApiCost(model: string, inputTokens: number): number | null {
  const rate = Object.hasOwn(inputRates, model) ? inputRates[model] : undefined;
  return rate === undefined || !Number.isFinite(inputTokens) || inputTokens < 0
    ? null
    : (inputTokens * rate) / 1e6;
}
