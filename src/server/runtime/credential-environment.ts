/** Credential names shared by host configuration, SDK sandbox policy and local tests. */
export const credentialEnvironmentVariables = {
  typesafeApiKey: "TYPESAFE_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  codexApiKey: "CODEX_API_KEY",
  anthropicApiKey: "ANTHROPIC_API_KEY",
  claudeOauthToken: "CLAUDE_CODE_OAUTH_TOKEN",
  anysearchApiKey: "ANYSEARCH_API_KEY",
  captureWorkerToken: "KITEVA_CAPTURE_WORKER_TOKEN",
  authenticationBridgeToken: "KITEVA_AUTH_BRIDGE_TOKEN",
} as const;
