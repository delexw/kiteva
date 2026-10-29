import { credentialEnvironmentVariables } from "../src/server/runtime/credential-environment";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const keychain = vi.hoisted(() => ({ login: "", calls: 0 }));
vi.mock("node:child_process", async (original) => {
  const { promisify } = await import("node:util");
  const execFile = (
    _file: string,
    _args: string[],
    _options: unknown,
    callback: (error: null, stdout: string, stderr: string) => void,
  ) => {
    keychain.calls++;
    callback(null, keychain.login, "");
  };
  Object.assign(execFile, {
    [promisify.custom]: async () => {
      keychain.calls++;
      return { stdout: keychain.login, stderr: "" };
    },
  });
  return { ...(await original<typeof import("node:child_process")>()), execFile };
});
import { prepareClaudeHome } from "../src/server/agents/claude-home";

afterEach(() => vi.unstubAllEnvs());

it.skipIf(process.platform !== "darwin")(
  "refreshes an existing project login from Keychain on each turn without importing other accounts",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "claude-login-"));
    vi.stubEnv("HOME", root);
    vi.stubEnv("CLAUDE_CONFIG_DIR", "");
    vi.stubEnv(credentialEnvironmentVariables.anthropicApiKey, "");
    vi.stubEnv(credentialEnvironmentVariables.claudeOauthToken, "");
    keychain.calls = 0;
    try {
      keychain.login = JSON.stringify({
        claudeAiOauth: { accessToken: "old-fixture", expiresAt: 1 },
        unrelatedAccount: "excluded",
      });
      const home = await prepareClaudeHome(path.join(root, "project"));
      const directory = path.join(home, ".claude");
      const auth = path.join(directory, ".credentials.json");
      expect(JSON.parse(await readFile(auth, "utf8"))).toEqual({
        claudeAiOauth: { accessToken: "old-fixture", expiresAt: 1 },
      });
      await writeFile(path.join(directory, "settings.json"), "project-settings");
      keychain.login = JSON.stringify({
        claudeAiOauth: { accessToken: "new-fixture", expiresAt: 2 },
        unrelatedAccount: "excluded",
      });
      await prepareClaudeHome(path.join(root, "project"));
      expect(keychain.calls).toBe(2);
      expect(JSON.parse(await readFile(auth, "utf8"))).toEqual({
        claudeAiOauth: { accessToken: "new-fixture", expiresAt: 2 },
      });
      expect(await readFile(path.join(directory, "settings.json"), "utf8")).toBe(
        "project-settings",
      );
      expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
      const controller = new AbortController();
      controller.abort(Error("Stopped"));
      await expect(
        prepareClaudeHome(path.join(root, "project"), undefined, controller.signal),
      ).rejects.toThrow("Stopped");
      expect(keychain.calls).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
