import { credentialEnvironmentVariables } from "./credential-environment";
import { projectRuntimeEnvironment } from "./project-files";
import path from "node:path";
import { systemEnvironment } from "./platform";
import { mkdirSync } from "node:fs";
import dotenv from "dotenv";
import { resolveLocalPorts } from "../../shared/local-ports";
import { defaultProviderModels } from "../../shared/model-display-name";
import { appRoot, dataRoot } from "./paths";
export { appRoot, dataRoot } from "./paths";
dotenv.config({ path: path.join(appRoot, ".env"), quiet: true });
dotenv.config({ path: path.join(appRoot, ".env.local"), quiet: true });
mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
export const catalogRoot = path.join(appRoot, "assets", "catalog");
export const models = {
  codex: process.env.VIDEO_CODEX_MODEL || defaultProviderModels.codex,
  claude: process.env.VIDEO_CLAUDE_MODEL || defaultProviderModels.claude,
};
const localPorts = resolveLocalPorts(process.env);
export const port = localPorts.backend;
export const webPort = localPorts.web;
export const agentMode: "local" | "hosted" =
  (process.env.VIDEO_AGENT_MODE || "local") === "local" ? "local" : "hosted";
export function redactSecrets(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value);
  for (const [key, secret] of Object.entries(process.env)) {
    if (/KEY|TOKEN|PASSWORD|SECRET/.test(key) && secret && secret.length > 6)
      text = text.split(secret).join("[redacted]");
  }
  return text.replace(/(?:sk-|sk_)[A-Za-z0-9_-]{12,}/g, "[redacted]");
}
export function safeMessage(value: unknown): string {
  return redactSecrets(value).slice(0, 12000);
}

export function childEnvironment(workspace?: string) {
  const names = [
    "HOME",
    "PATH",
    "TMPDIR",
    "LANG",
    "USER",
    "SHELL",
    credentialEnvironmentVariables.openaiApiKey,
    credentialEnvironmentVariables.codexApiKey,
    credentialEnvironmentVariables.anthropicApiKey,
    credentialEnvironmentVariables.claudeOauthToken,
    "CLAUDE_CODE_GIT_BASH_PATH",
    credentialEnvironmentVariables.anysearchApiKey,
  ];
  return {
    ...systemEnvironment(),
    NODE_USE_ENV_PROXY: "1",
    ...Object.fromEntries(names.flatMap((k) => (process.env[k] ? [[k, process.env[k]!]] : []))),
    ...(workspace
      ? {
          ...projectRuntimeEnvironment(workspace, "agent"),
        }
      : {}),
  };
}
