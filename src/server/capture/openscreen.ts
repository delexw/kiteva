import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { z } from "zod";
import { systemEnvironment } from "../runtime/platform";
import { terminateProcessTree } from "../runtime/process-tree";
import { openCaptureDiagnostics } from "./diagnostics";

export const openScreenExportFrameRate = 60;

const DoneSchema = z.object({
  event: z.literal("done"),
  success: z.literal(true),
  screenVideoPath: z.string().min(1),
  cursorDataPath: z.string().optional(),
  durationMs: z.number().positive(),
});

/** OpenScreen is the only recorder; FFmpeg is used downstream solely for delivery conversion. */
export async function startOpenScreen(
  windowTitle: string,
  signal: AbortSignal,
  diagnosticsDirectory: string,
) {
  signal.throwIfAborted();
  const executable = await openScreenExecutable();
  signal.throwIfAborted();
  const diagnostics = await openCaptureDiagnostics(diagnosticsDirectory);
  const child = spawn(
    executable,
    ["record", "--window", windowTitle, "--cursor", "editable-overlay", "--json"],
    {
      env: { ...systemEnvironment(), OPENSCREEN_DIAGNOSTIC: "1" },
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", diagnostics.fd],
    },
  );
  const { stdin, stdout } = child;
  if (!stdin || !stdout) {
    await terminateProcessTree(child.pid, { processGroup: true });
    await diagnostics.close();
    throw Error("OpenScreen recording pipes are unavailable");
  }
  let result: z.infer<typeof DoneSchema> | undefined;
  let error: Error | undefined;
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  let exitResolve!: () => void;
  const exited = new Promise<void>((resolve) => {
    exitResolve = resolve;
  });
  const lines = createInterface({ input: stdout });
  let closed = false;
  let terminating: Promise<void> | undefined;
  let stopTimer: NodeJS.Timeout | undefined;
  const stop = () => {
    if (closed || stopTimer) return;
    if (!stdin.destroyed) stdin.end("stop\n");
    stopTimer = setTimeout(() => {
      terminating = terminateProcessTree(child.pid, { processGroup: true });
      void terminating.catch((reason) => {
        error ??= reason;
      });
    }, 10000);
    stopTimer.unref();
  };
  const fail = (reason: Error) => {
    error ??= reason;
    readyReject(reason);
    stop();
  };
  const startupTimer = setTimeout(
    () => fail(Error("OpenScreen did not start recording within 30 seconds")),
    30000,
  );
  startupTimer.unref();
  lines.on("line", (line) => {
    try {
      const event = JSON.parse(line);
      if (event.event === "log" && event.message === "Recording started") {
        clearTimeout(startupTimer);
        readyResolve();
      }
      if (event.event === "done") {
        result = DoneSchema.parse(event);
      }
      if (event.event === "error")
        fail(Error("OpenScreen could not record the dedicated browser window"));
    } catch {
      fail(Error("OpenScreen returned an invalid recording event"));
    }
  });
  stdin.on("error", () => {});
  child.on("error", (reason) => fail(reason));
  const abort = () => fail(Error("OpenScreen recording cancelled"));
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  child.on("close", (code) => {
    closed = true;
    clearTimeout(stopTimer);
    clearTimeout(startupTimer);
    signal.removeEventListener("abort", abort);
    lines.close();
    if (code !== 0 || !result) fail(Error("OpenScreen exited without a valid recording"));
    readyReject(error ?? Error("OpenScreen stopped before recording started"));
    void Promise.resolve(terminating)
      .then(() => diagnostics.close())
      .catch((reason) => {
        error ??= reason;
      })
      .finally(exitResolve);
  });
  try {
    await ready;
  } catch (reason) {
    await exited;
    throw new Error(
      `${reason instanceof Error ? reason.message : String(reason)} (OpenScreen diagnostics: ${diagnostics.path})`,
      { cause: reason },
    );
  }
  return {
    diagnosticsPath: diagnostics.path,
    async stop() {
      stop();
      await exited;
      signal.throwIfAborted();
      if (error) throw error;
      if (!result) throw Error("OpenScreen returned no recording");
      return result;
    },
  };
}

export async function openScreenExecutable() {
  const executable =
    process.env.OPENSCREEN_EXECUTABLE ||
    [
      "/Applications/Openscreen.app/Contents/MacOS/Openscreen",
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Openscreen", "Openscreen.exe"),
      path.join(process.env.ProgramFiles || "", "Openscreen", "Openscreen.exe"),
    ].find((candidate) => existsSync(candidate));
  if (!executable) throw Error("Configure OPENSCREEN_EXECUTABLE on the recording machine");
  await access(executable);
  return executable;
}
