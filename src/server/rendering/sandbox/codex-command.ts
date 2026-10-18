import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { systemEnvironment } from "../../runtime/platform";
import { watchCommandOutput } from "../../runtime/file-output";
import { z } from "zod";

export const NativeCommandSchema = z.object({
  cli: z.string(),
  outputRoot: z.string(),
  configOverrides: z.array(z.string()),
  cwd: z.string(),
  command: z.array(z.string()).min(1),
});
export type NativeCommand = z.infer<typeof NativeCommandSchema>;
const ResultSchema = z.object({
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
});

/** Model-free command/exec uses the normal executor, including its managed network proxy. */
export async function runCodexSandboxCommand(
  spec: NativeCommand,
  stdout: (data: Buffer) => void,
  stderr: (data: Buffer) => void,
): Promise<number> {
  const capture = await mkdtemp(path.join(spec.outputRoot, "command-"));
  const stdoutFile = path.join(capture, "stdout");
  const stderrFile = path.join(capture, "stderr");
  await Promise.all([
    writeFile(stdoutFile, "", { mode: 0o600 }),
    writeFile(stderrFile, "", { mode: 0o600 }),
  ]);
  const finishStdout = watchCommandOutput(stdoutFile, stdout);
  const finishStderr = watchCommandOutput(stderrFile, stderr);
  // Node 24 strips this helper's erasable types natively. tsx probes os.userInfo()
  // on Windows, which is unavailable inside the restricted sandbox account.
  const command = [
    process.execPath,
    fileURLToPath(new URL("./command-child.ts", import.meta.url)),
    Buffer.from(
      JSON.stringify({
        command: spec.command,
        cwd: spec.cwd,
        stdout: stdoutFile,
        stderr: stderrFile,
      }),
    ).toString("base64url"),
  ];
  const server = spawn(
    process.execPath,
    [
      spec.cli,
      "app-server",
      "--listen",
      "stdio://",
      ...spec.configOverrides.flatMap((value) => ["--config", value]),
    ],
    {
      cwd: spec.cwd,
      env: process.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const lines = createInterface({ input: server.stdout });
  server.stderr.on("data", stderr);
  const send = (message: unknown) => server.stdin.write(JSON.stringify(message) + "\n");
  try {
    return await new Promise<number>((resolve, reject) => {
      let executing = false;
      let completed = false;
      const fail = (error: Error) => {
        if (!completed) {
          completed = true;
          reject(error);
        }
      };
      server.on("error", fail);
      server.stdin.on("error", fail);
      server.on("close", (code) => {
        if (!completed)
          fail(Error(`Native sandbox executor closed before command completion (${code})`));
      });
      lines.on("line", (line) => {
        try {
          const message = JSON.parse(line);
          if (message.error)
            throw Error(`Native sandbox: ${message.error.message || "command rejected"}`);
          if (message.method === "command/exec/outputDelta")
            throw Error("Unexpected streaming output in buffered Windows execution");
          if (message.id === 1 && !executing) {
            executing = true;
            send({ method: "initialized" });
            send({
              id: 2,
              method: "command/exec",
              params: {
                command,
                cwd: spec.cwd,
                disableTimeout: true,
                env: {
                  ...systemEnvironment(),
                  HYPERFRAMES_BROWSER_PATH: process.env.HYPERFRAMES_BROWSER_PATH || null,
                  DO_NOT_TRACK: "1",
                },
              },
            });
          } else if (message.id === 2) {
            const result = ResultSchema.parse(message.result);
            if (result.stdout) stdout(Buffer.from(result.stdout));
            if (result.stderr) stderr(Buffer.from(result.stderr));
            completed = true;
            resolve(result.exitCode);
          } else if (message.id !== undefined && message.method) {
            throw Error(
              "Native sandbox requires interactive setup; run npm run windows:check first",
            );
          }
        } catch (error) {
          fail(error instanceof Error ? error : Error(String(error)));
        }
      });
      send({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "kiteva-render", version: "0.1.0" },
          capabilities: { experimentalApi: true, requestAttestation: false },
        },
      });
    });
  } finally {
    lines.close();
    server.stdin.end();
    // Close the owned executor. Parent cancellation also terminates its process tree.
    server.kill();
    try {
      await Promise.all([finishStdout(), finishStderr()]);
    } finally {
      await rm(capture, { recursive: true, force: true });
    }
  }
}
