import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { renderCommand } from "../rendering/render-sandbox";
import { systemEnvironment } from "./platform";
import { stopProcessTree } from "./process-tree";
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
  const sandbox = isolate ? await renderCommand(executable, args, cwd) : undefined;
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(sandbox?.executable || executable, sandbox?.args || args, {
      cwd,
      detached: process.platform !== "win32",
      windowsHide: true,
      env: {
        ...systemEnvironment(),
        LANG: "en_US.UTF-8",
        ...sandbox?.env,
        DO_NOT_TRACK: "1",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    let outputFailed = false;
    const stop = () => {
      stopProcessTree(child.pid);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeout);
    signal.addEventListener("abort", stop, { once: true });
    for (const stream of [child.stdout, child.stderr]) {
      const decoder = new StringDecoder("utf8");
      const emit = (decoded: string) => {
        if (!decoded || outputFailed) return;
        try {
          const text = safeMessage(decoded);
          // Machine-readable stdout stays intact; only the display channel is redacted.
          if (stream === child.stdout) onStdout(decoded);
          output = (output + text).slice(-60000);
          onOutput(text);
        } catch (error) {
          outputFailed = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", stop);
          stop();
          reject(error);
        }
      };
      stream.on("data", (chunk) => emit(decoder.write(chunk)));
      stream.on("end", () => emit(decoder.end()));
    }
    child.on("error", (error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      reject(error);
    });
    if (signal.aborted) stop();
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
