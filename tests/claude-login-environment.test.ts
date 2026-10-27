import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { claudeLoginEnvironment } from "../src/server/agents/claude-home";

afterEach(() => vi.unstubAllEnvs());
it("passes only the synchronized access token without exposing refresh tokens or other accounts", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "claude-login-env-"));
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "");
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
      CLAUDE_CODE_OAUTH_TOKEN: "fixture-first",
    });
    await writeFile(file, JSON.stringify({ claudeAiOauth: { accessToken: "fixture-refreshed" } }));
    expect(await claudeLoginEnvironment(home)).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: "fixture-refreshed",
    });
    for (const name of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]) {
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
