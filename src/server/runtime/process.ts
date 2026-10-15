import { spawn } from "node:child_process";
import { renderSandbox } from "../rendering/render-sandbox";
import { safeMessage } from "./config.js";
export async function command(
  executable: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  onOutput: (text: string) => void = () => {},
  timeout = 180000,
  isolate = false,
  onStdout: (text: string) => void = () => {},
  env: Record<string, string | undefined> = {},
): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const sandbox = isolate ? renderSandbox(cwd) : undefined;
    const child = spawn(
      sandbox ? "/usr/bin/sandbox-exec" : executable,
      sandbox ? ["-p", sandbox.profile, executable, ...args] : args,
      {
        cwd,
        detached: true,
        env: {
          PATH: process.env.PATH,
          HOME: sandbox?.home || process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          LANG: "en_US.UTF-8",
          HYPERFRAMES_BROWSER_PATH: sandbox?.browserPath,
          DO_NOT_TRACK: "1",
          ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    let timedOut = false;
    const stop = () => {
      try {
        process.kill(-child.pid!, "SIGTERM");
      } catch {
        /* Process may already have exited. */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeout);
    signal.addEventListener("abort", stop, { once: true });
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        const text = safeMessage(chunk.toString());
        // Machine-readable stdout must retain its original bytes for parsing.
        // Only the human-readable output channel is redacted and truncated.
        if (stream === child.stdout) onStdout(chunk.toString());
        output = (output + text).slice(-60000);
        onOutput(text);
      });
    child.on("error", (error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      if (signal.aborted) reject(Error("Cancelled"));
      else if (timedOut) reject(Error("Process exceeded time limit"));
      else if (code !== 0) reject(Error(`${executable} exited ${code}: ${output.slice(-5000)}`));
      else resolve(output);
    });
  });
}

export function isolatedCommand(
  executable: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  onOutput: (text: string) => void = () => {},
  timeout = 180000,
  onStdout: (text: string) => void = () => {},
  env: Record<string, string | undefined> = {},
) {
  return command(executable, args, cwd, signal, onOutput, timeout, true, onStdout, env);
}
