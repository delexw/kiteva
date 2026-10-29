import { credentialEnvironmentVariables } from "../src/server/runtime/credential-environment";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { claudeLoginEnvironment } from "../src/server/agents/claude-home";

afterEach(() => vi.unstubAllEnvs());
it("passes only the synchronized access token without exposing refresh tokens or other accounts", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "claude-login-env-"));
  vi.stubEnv(credentialEnvironmentVariables.anthropicApiKey, "");
  vi.stubEnv(credentialEnvironmentVariables.claudeOauthToken, "");
  try {
    expect(await claudeLoginEnvironment(home)).toEqual({});
    await mkdir(path.join(home, ".claude"));
    const file = path.join(home, ".claude", ".credentials.json");
    await writeFile(
      file,
      JSON.stringify({
        claudeAiOauth: { accessToken: "fixture-first", refreshToken: "excluded" },
        otherAccount: "excluded",
      }),
    );
    expect(await claudeLoginEnvironment(home)).toEqual({
      [credentialEnvironmentVariables.claudeOauthToken]: "fixture-first",
    });
    await writeFile(file, JSON.stringify({ claudeAiOauth: { accessToken: "fixture-refreshed" } }));
    expect(await claudeLoginEnvironment(home)).toEqual({
      [credentialEnvironmentVariables.claudeOauthToken]: "fixture-refreshed",
    });
    for (const name of [
      credentialEnvironmentVariables.anthropicApiKey,
      credentialEnvironmentVariables.claudeOauthToken,
    ]) {
      vi.stubEnv(name, "explicit-fixture");
      expect(await claudeLoginEnvironment(home)).toEqual({});
      vi.stubEnv(name, "");
    }
    await writeFile(file, JSON.stringify({ claudeAiOauth: { accessToken: 123 } }));
    expect(await claudeLoginEnvironment(home)).toEqual({});
    const controller = new AbortController();
    controller.abort(Error("Stop project"));
    await expect(claudeLoginEnvironment(home, controller.signal)).rejects.toThrow("Stop project");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
