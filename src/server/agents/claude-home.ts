import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { constants } from "node:fs";
import { copyFile, cp, mkdir, readdir, access, writeFile } from "node:fs/promises";
import { prepareProjectRuntime } from "../runtime/project-files";
import { userHome } from "../runtime/platform";

/** Preserve login and resume compatibility without sharing writable CLI configuration or sessions. */
export async function prepareClaudeHome(
  workspace: string,
  sessionId?: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const { home } = prepareProjectRuntime(workspace, "agent");
  const target = path.join(home, ".claude");
  const source = process.env.CLAUDE_CONFIG_DIR || path.join(userHome(), ".claude");
  await mkdir(target, { recursive: true, mode: 0o700 });
  await copyFile(
    path.join(source, ".credentials.json"),
    path.join(target, ".credentials.json"),
    constants.COPYFILE_EXCL,
  ).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") return;
    if (error.code !== "ENOENT") throw error;
    // macOS keeps the normal CLI login in Keychain, rather than .credentials.json.
    // Copy only its Claude login into the project; never import MCP accounts or settings.
    if (
      process.platform !== "darwin" ||
      process.env.CLAUDE_CONFIG_DIR ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.CLAUDE_CODE_OAUTH_TOKEN
    )
      return;
    let stdout: string;
    try {
      ({ stdout } = await promisify(execFile)(
        "/usr/bin/security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { signal, timeout: 5000, maxBuffer: 1024 * 1024 },
      ));
    } catch (cause) {
      signal?.throwIfAborted();
      if ((cause as { code?: unknown }).code === 44) return;
      throw cause;
    }
    const credentials = JSON.parse(stdout) as { claudeAiOauth?: unknown };
    if (!credentials.claudeAiOauth) return;
    await writeFile(
      path.join(target, ".credentials.json"),
      JSON.stringify({ claudeAiOauth: credentials.claudeAiOauth }),
      {
        mode: 0o600,
        flag: "wx",
        signal,
      },
    ).catch((cause: NodeJS.ErrnoException) => {
      if (cause.code !== "EEXIST") throw cause;
    });
  });
  if (sessionId) {
    if (!/^[\w-]+$/.test(sessionId)) throw Error("Invalid SDK session ID");
    const projects = path.join(source, "projects");
    const entries = await readdir(projects, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return [];
      },
    );
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (!entry.isDirectory()) continue;
      const destination = path.join(target, "projects", entry.name);
      try {
        await access(path.join(projects, entry.name, `${sessionId}.jsonl`));
        await mkdir(destination, { recursive: true, mode: 0o700 });
        await copyFile(
          path.join(projects, entry.name, `${sessionId}.jsonl`),
          path.join(destination, `${sessionId}.jsonl`),
          constants.COPYFILE_EXCL,
        );
        await cp(path.join(projects, entry.name, sessionId), path.join(destination, sessionId), {
          recursive: true,
          errorOnExist: false,
          force: false,
          filter: () => {
            signal?.throwIfAborted();
            return true;
          },
        }).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
        break;
      } catch (error) {
        if (!["ENOENT", "EEXIST"].includes((error as NodeJS.ErrnoException).code || ""))
          throw error;
      }
    }
  }
  signal?.throwIfAborted();
  return home;
}
