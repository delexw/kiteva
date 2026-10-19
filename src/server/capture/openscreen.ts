import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { z } from "zod";
import { systemEnvironment } from "../runtime/platform";
import { command } from "../runtime/process";
import { videoRenderTimeoutMs } from "../rendering/timeouts";
import { stopProcessTree } from "../runtime/process-tree";

export const openScreenExportFrameRate = 60;

const DoneSchema = z.object({
  event: z.literal("done"),
  success: z.literal(true),
  screenVideoPath: z.string().min(1),
  cursorDataPath: z.string().optional(),
  durationMs: z.number().positive(),
});

/** OpenScreen is the only recorder; FFmpeg is used downstream solely for delivery conversion. */
export async function startOpenScreen(windowTitle: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const executable = await openScreenExecutable();
  signal.throwIfAborted();
  const child = spawn(
    executable,
    ["record", "--window", windowTitle, "--cursor", "editable-overlay", "--json"],
    {
      env: systemEnvironment(),
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
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
  const lines = createInterface({ input: child.stdout });
  let closed = false;
  let stopTimer: NodeJS.Timeout | undefined;
  const stop = () => {
    if (closed || stopTimer) return;
    if (!child.stdin.destroyed) child.stdin.end("stop\n");
    stopTimer = setTimeout(() => stopProcessTree(child.pid), 10000);
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
  const maximumTimer = setTimeout(
    () => fail(Error("OpenScreen recording exceeded 120 seconds")),
    120000,
  );
  const killTimer = setTimeout(() => stopProcessTree(child.pid), 150000);
  startupTimer.unref();
  maximumTimer.unref();
  killTimer.unref();
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
  // Drain Chromium diagnostics without leaking desktop paths into agent-visible errors.
  child.stderr.on("data", () => {});
  child.stdin.on("error", () => {});
  child.on("error", (reason) => fail(reason));
  const abort = () => fail(Error("OpenScreen recording cancelled"));
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  child.on("close", (code) => {
    closed = true;
    clearTimeout(stopTimer);
    clearTimeout(startupTimer);
    clearTimeout(maximumTimer);
    clearTimeout(killTimer);
    signal.removeEventListener("abort", abort);
    lines.close();
    if (code !== 0 || !result) fail(Error("OpenScreen exited without a valid recording"));
    readyReject(error ?? Error("OpenScreen stopped before recording started"));
    exitResolve();
  });
  try {
    await ready;
  } catch (reason) {
    await exited;
    throw reason;
  }
  return {
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

async function openScreenExecutable() {
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

/** Render through OpenScreen's own compositor, including its cursor and automatic zoom engine. */
export async function exportOpenScreen(project: string, output: string, signal: AbortSignal) {
  const executable = await openScreenExecutable();
  const stdout = await command(
    executable,
    [
      "export",
      project,
      "--out",
      output,
      "--format",
      "mp4",
      "--quality",
      "source",
      "--fps",
      String(openScreenExportFrameRate),
      "--auto-zoom",
      "--json",
    ],
    path.dirname(project),
    signal,
    () => {},
    videoRenderTimeoutMs,
  );
  const completed = stdout
    .split("\n")
    .filter(Boolean)
    .flatMap((line): unknown[] => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      } // OpenScreen's native compositor also writes [pipeline] diagnostics.
    })
    .map((event) => z.object({ event: z.string() }).passthrough().safeParse(event))
    .filter((event) => event.success)
    .map((event) => event.data)
    .reverse()
    .find((event) => event.event === "done");
  const result = z
    .object({ event: z.literal("done"), success: z.literal(true), outputPath: z.string() })
    .parse(completed);
  if (path.resolve(result.outputPath) !== path.resolve(output))
    throw Error("OpenScreen returned an unexpected export path");
}
