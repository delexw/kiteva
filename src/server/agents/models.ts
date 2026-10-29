// Small text tasks use the cheapest model from the user's selected provider.
export const textModels = { claude: "claude-haiku-5-5", codex: "gpt-6-luna" } as const;
export const claudeMainModel = "claude-opus-5-5";
export const combinationModels = { claude: claudeMainModel, codex: "gpt-6.1-sol" } as const;
