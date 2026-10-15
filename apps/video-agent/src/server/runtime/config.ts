import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import dotenv from "dotenv";
import { DEFAULT_WEB_PORT } from "../../shared/local-web-port";
import { defaultProviderModels } from "../../shared/model-display-name";
export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: path.join(appRoot, ".env"), quiet: true });
dotenv.config({ path: path.join(appRoot, ".env.local"), quiet: true });
export const dataRoot = path.join(appRoot, ".data");
mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
export const catalogRoot = path.resolve(appRoot, "../../outputs");
export const models = {
  codex: process.env.VIDEO_CODEX_MODEL || defaultProviderModels.codex,
  claude: process.env.VIDEO_CLAUDE_MODEL || defaultProviderModels.claude,
};
export const port = Number(process.env.VIDEO_AGENT_PORT || 4317);
export const webPort = Number(process.env.VIDEO_AGENT_WEB_PORT || DEFAULT_WEB_PORT);
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

export function childEnvironment() {
  const names = [
    "HOME",
    "PATH",
    "TMPDIR",
    "LANG",
    "USER",
    "SHELL",
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_OAUTH_TOKEN",
  ];
  return Object.fromEntries(names.flatMap((k) => (process.env[k] ? [[k, process.env[k]!]] : [])));
}
