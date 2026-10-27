import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm, lstat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
vi.mock("../src/server/agents/codex-tool-hooks", () => ({ prepareCodexToolHook: vi.fn() }));
import { isolatedCodexHome } from "../src/server/agents/sdk-home";
import { prepareClaudeHome } from "../src/server/agents/claude-home";
import { dataRoot } from "../src/server/runtime/config";
import { randomUUID } from "node:crypto";

afterEach(() => vi.unstubAllEnvs());

it("copies only Codex login/cache metadata and resumed transcript into independent project homes", async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), "sdk-source-"));
  const first = await mkdtemp(path.join(os.tmpdir(), "sdk-project-"));
  const second = await mkdtemp(path.join(os.tmpdir(), "sdk-project-"));
  vi.stubEnv("CODEX_HOME", source);
  try {
    await mkdir(path.join(source, "sessions"));
    await writeFile(path.join(source, "auth.json"), JSON.stringify({ fixture: true }));
    await writeFile(path.join(source, "config.toml"), 'unrelated = "do not copy"');
    await writeFile(
      path.join(source, "sessions", "rollout-fixture-session.jsonl"),
      '{"fixture":"session"}\n',
    );
    const [a, b] = await Promise.all([
      isolatedCodexHome(first, "fixture-session"),
      isolatedCodexHome(second, "fixture-session"),
    ]);
    expect(a).not.toBe(b);
    for (const home of [a, b]) {
      expect(await readFile(path.join(home, "auth.json"), "utf8")).toBe('{"fixture":true}');
      expect((await lstat(path.join(home, "auth.json"))).isSymbolicLink()).toBe(false);
      expect(
        await readFile(path.join(home, "sessions", "rollout-fixture-session.jsonl"), "utf8"),
      ).toContain('"session"');
      await expect(readFile(path.join(home, "config.toml"), "utf8")).rejects.toThrow();
    }
    await writeFile(path.join(a, "auth.json"), "project-a");
    await writeFile(path.join(a, "sessions", "rollout-fixture-session.jsonl"), "changed");
    expect(await readFile(path.join(b, "auth.json"), "utf8")).toBe('{"fixture":true}');
    expect(
      await readFile(path.join(source, "sessions", "rollout-fixture-session.jsonl"), "utf8"),
    ).toContain('"session"');
  } finally {
    await Promise.all([source, first, second].map((p) => rm(p, { recursive: true, force: true })));
  }
});

it("keeps provider homes stable through preview/full jobs and separates project-owned state", async () => {
  const root = path.join(dataRoot, "runs", `isolation-${randomUUID()}`);
  const source = await mkdtemp(path.join(os.tmpdir(), "claude-source-"));
  vi.stubEnv("CLAUDE_CONFIG_DIR", source);
  vi.stubEnv("CODEX_HOME", path.join(root, "auth-source"));
  try {
    await mkdir(path.join(source, "projects", "source-project", "fixture-session"), {
      recursive: true,
    });
    await writeFile(path.join(source, ".credentials.json"), '{"fixture":true}');
    await writeFile(path.join(source, "settings.json"), '{"fixture":"do not copy"}');
    await writeFile(
      path.join(source, "projects", "source-project", "fixture-session.jsonl"),
      '{"fixture":"session"}\n',
    );
    await writeFile(
      path.join(source, "projects", "source-project", "fixture-session", "subagent.jsonl"),
      "subagent",
    );
    const preview = path.join(root, "preview"),
      full = path.join(root, "full");
    const a = await prepareClaudeHome(preview, "fixture-session");
    const b = await prepareClaudeHome(full, "fixture-session");
    expect(a).toBe(b);
    expect(a.startsWith(root + path.sep)).toBe(true);
    const auth = path.join(a, ".claude", ".credentials.json");
    expect((await lstat(auth)).isSymbolicLink()).toBe(false);
    await writeFile(auth, "changed");
    expect(await readFile(path.join(source, ".credentials.json"), "utf8")).toBe('{"fixture":true}');
    expect(
      await readFile(
        path.join(a, ".claude", "projects", "source-project", "fixture-session", "subagent.jsonl"),
        "utf8",
      ),
    ).toBe("subagent");
    await expect(readFile(path.join(a, ".claude", "settings.json"))).rejects.toThrow();
    await expect(prepareClaudeHome(preview, "../escape")).rejects.toThrow("Invalid SDK session ID");
    await expect(isolatedCodexHome(preview, "../escape")).rejects.toThrow("Invalid SDK session ID");
  } finally {
    await Promise.all([root, source].map((p) => rm(p, { recursive: true, force: true })));
  }
});

it("cancels project-owned SDK initialization and waits for cleanup before returning", async () => {
  const { prepareCodexToolHook } = await import("../src/server/agents/codex-tool-hooks");
  const root = await mkdtemp(path.join(os.tmpdir(), "sdk-init-cancel-"));
  vi.stubEnv("CODEX_HOME", path.join(root, "auth-source"));
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let cleaned = false;
  vi.mocked(prepareCodexToolHook).mockImplementationOnce(async (_home, signal) => {
    if (!signal) throw Error("Missing setup signal");
    ready();
    await new Promise<void>((_resolve, reject) =>
      signal.addEventListener(
        "abort",
        () => {
          setTimeout(() => {
            cleaned = true;
            reject(Error("Setup cancelled"));
          }, 25);
        },
        { once: true },
      ),
    );
  });
  try {
    const controller = new AbortController();
    const pending = isolatedCodexHome(root, undefined, controller.signal);
    await started;
    controller.abort(Error("Stop project"));
    await expect(pending).rejects.toThrow("Stop project");
    expect(cleaned).toBe(true);
    expect(await isolatedCodexHome(root)).toContain(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps shared initialization running when only one caller in the same project cancels", async () => {
  const { prepareCodexToolHook } = await import("../src/server/agents/codex-tool-hooks");
  const root = await mkdtemp(path.join(os.tmpdir(), "sdk-init-shared-"));
  let ready!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let setupSignal: AbortSignal | undefined;
  vi.mocked(prepareCodexToolHook).mockImplementationOnce(async (_home, signal) => {
    setupSignal = signal;
    ready();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  try {
    const controller = new AbortController();
    const first = isolatedCodexHome(root, undefined, controller.signal);
    const second = isolatedCodexHome(root);
    await started;
    controller.abort(Error("Stop one caller"));
    await expect(first).rejects.toThrow("Stop one caller");
    expect(setupSignal?.aborted).toBe(false);
    finish();
    expect(await second).toContain(root);
  } finally {
    finish?.();
    await rm(root, { recursive: true, force: true });
  }
});
