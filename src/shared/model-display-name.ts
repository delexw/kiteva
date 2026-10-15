const modelNames: Record<string, string> = {
  "claude-opus-5-5": "Claude Opus 5.5",
  "gpt-6.1-sol": "GPT-6.1 Sol",
};
export function modelDisplayName(model: string, fallback = model || "Not recorded") {
  return modelNames[model] || fallback;
}
export const defaultProviderModels = { codex: "gpt-6.1-sol", claude: "claude-opus-5-5" } as const;
export function providerDisplayName(provider: keyof typeof defaultProviderModels) {
  return modelDisplayName(defaultProviderModels[provider]);
}
