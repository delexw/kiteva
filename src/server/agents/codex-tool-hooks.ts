import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { quote } from "shell-quote";
import TOML from "@iarna/toml";
import { z } from "zod";

const ConfigSchema = z
  .object({
    features: z.record(z.string(), z.unknown()).default({}),
    hooks: z
      .object({ state: z.record(z.string(), z.unknown()).default({}) })
      .passthrough()
      .default({ state: {} }),
  })
  .passthrough();
const HookSchema = z.object({
  key: z.string(),
  sourcePath: z.string(),
  command: z.string().nullable(),
  matcher: z.string().nullable(),
  currentHash: z.string(),
  trustStatus: z.string(),
  enabled: z.boolean(),
});
const HooksResponseSchema = z.object({ data: z.array(z.object({ hooks: z.array(HookSchema) })) });

/** Read identities from Codex itself rather than reimplementing its trust hash algorithm. */
async function listNativeHooks(home: string) {
  const cli = fileURLToPath(import.meta.resolve("@openai/codex/bin/codex.js"));
  const child = spawn(process.execPath, [cli, "app-server"], {
    cwd: home,
    env: { ...process.env, CODEX_HOME: home },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  child.stderr.resume();
  try {
    return await new Promise<z.infer<typeof HooksResponseSchema>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Codex tool-hook verification timed out")),
        10000,
      );
      const finish = (error?: Error, value?: z.infer<typeof HooksResponseSchema>) => {
        clearTimeout(timer);
        if (error) reject(error);
        else if (value) resolve(value);
      };
      const send = (value: unknown) => child.stdin.write(JSON.stringify(value) + "\n");
      child.once("error", (error) => finish(error));
      child.stdin.once("error", (error) => finish(error));
      child.once("exit", () => finish(Error("Codex stopped before verifying the tool hook")));
      lines.on("line", (line) => {
        try {
          const message = JSON.parse(line);
          if (message.error) throw Error("Codex rejected tool-hook verification");
          if (message.id === 1) {
            send({ method: "initialized", params: {} });
            send({ id: 2, method: "hooks/list", params: { cwds: [home] } });
          } else if (message.id === 2) finish(undefined, HooksResponseSchema.parse(message.result));
        } catch (error) {
          finish(error instanceof Error ? error : Error(String(error)));
        }
      });
      send({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "kiteva-tool-policy", version: "1" },
          capabilities: { experimentalApi: true },
        },
      });
    });
  } finally {
    lines.close();
    child.stdin.end();
    child.kill();
  }
}

/** Install and trust only Kiteva's application-owned hook in the isolated SDK home. */
export async function prepareCodexToolHook(home: string) {
  const args = [
    process.execPath,
    "--import",
    import.meta.resolve("tsx"),
    fileURLToPath(new URL("./tool-policy-hook.ts", import.meta.url)),
  ];
  const command =
    process.platform === "win32" ? args.map((arg) => `"${arg}"`).join(" ") : quote(args);
  const hooksFile = path.join(home, "hooks.json");
  const configFile = path.join(home, "config.toml");
  await writeFile(
    hooksFile,
    JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: "^Bash$", hooks: [{ type: "command", command, timeout: 10 }] }],
      },
    }),
  );
  const previous = await readFile(configFile, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return "";
  });
  const config = ConfigSchema.parse(TOML.parse(previous));
  config.features.hooks = true;
  await writeFile(configFile, TOML.stringify(config as TOML.JsonMap));
  const sourcePath = await realpath(hooksFile);
  const hooks = (await listNativeHooks(home)).data.flatMap((entry) => entry.hooks);
  const hook = hooks.find(
    (entry) =>
      entry.sourcePath === sourcePath && entry.command === command && entry.matcher === "^Bash$",
  );
  if (!hook) throw Error("Codex did not discover Kiteva's pre-tool policy");
  config.hooks.state[hook.key] = { enabled: true, trusted_hash: hook.currentHash };
  await writeFile(configFile, TOML.stringify(config as TOML.JsonMap));
  const verified = (await listNativeHooks(home)).data
    .flatMap((entry) => entry.hooks)
    .find((entry) => entry.key === hook.key);
  if (!verified?.enabled || verified.trustStatus !== "trusted")
    throw Error("Codex did not enable Kiteva's pre-tool policy");
}
