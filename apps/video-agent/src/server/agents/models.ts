// Small text tasks use the cheapest model from the user's selected provider.
export const textModels = { claude: "claude-haiku-5-5", codex: "gpt-6-luna" } as const;
export const combinationModels = { claude: "claude-opus-5-5", codex: "gpt-6.1-sol" } as const;
