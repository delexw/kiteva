import { CodedError } from "../../shared/errors";
import { spawn } from "node:child_process";
import path from "node:path";
import pidtree from "pidtree";
import { setTimeout as delay } from "node:timers/promises";

export class DependencyCleanupError extends CodedError {
  constructor(cause: unknown) {
    super(
      "DEPENDENCY_CLEANUP_FAILED",
      "Dependency cleanup failed; project files were retained",
      409,
    );
    this.cause = cause;
  }
}
type ProcessTerminationOptions = {
  processGroup?: boolean;
  close?: () => Promise<void>;
  graceMs?: number;
  descendants?: number[];
  platform?: NodeJS.Platform;
};
/** Snapshot descendants before shutdown, then escalate only this invocation's owned processes. */
export async function terminateProcessTree(
  pid: number | undefined,
  options: ProcessTerminationOptions = {},
) {
  try {
    await terminate(pid, options);
  } catch (error) {
    throw new DependencyCleanupError(error);
  }
}
async function terminate(pid: number | undefined, options: ProcessTerminationOptions) {
  if (!pid || !Number.isSafeInteger(pid) || pid <= 0) {
    await options.close?.();
    return;
  }
  let snapshotError: unknown;
  const descendants =
    options.descendants ??
    (await snapshotProcessTree(pid).catch((error) => {
      snapshotError = error;
      return [];
    }));
  const owned = [pid, ...descendants];
  let closeError: unknown;
  const closing = options.close?.().catch((error: unknown) => {
    closeError = error;
  });
  if ((options.platform ?? process.platform) === "win32") {
    const terminatePid = (target: number) =>
      new Promise<void>((resolve, reject) => {
        const root = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
        const killer = spawn(
          path.win32.join(root, "System32", "taskkill.exe"),
          ["/PID", String(target), "/T", "/F"],
          { stdio: "ignore", windowsHide: true },
        );
        killer.once("error", reject);
        killer.once("close", () => resolve());
      });
    await Promise.all([...owned].reverse().map(terminatePid));
    if (closing) await Promise.race([closing, delay(1000)]);
    if (closeError) throw closeError;
    if (snapshotError) throw snapshotError;
    return;
  }
  const send = (signal: NodeJS.Signals) => {
    if (options.processGroup) kill(-pid, signal);
    for (const target of owned) kill(target, signal);
  };
  if (!closing) send("SIGTERM");
  const deadline = Date.now() + (options.graceMs ?? 1000);
  while (owned.some(alive) && Date.now() < deadline) await delay(25);
  send("SIGKILL");
  if (closing) await Promise.race([closing, delay(1000)]);
  // A reaped parent can leave short-lived zombies; allow its owner to observe close.
  const reaped = Date.now() + 2000;
  while (owned.some(alive) && Date.now() < reaped) await delay(25);
  if (owned.some(alive)) throw Error("Owned dependency processes did not exit");
  if (closeError) throw closeError;
  if (snapshotError) throw snapshotError;
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}
function kill(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

export async function snapshotProcessTree(pid: number | undefined): Promise<number[]> {
  if (!pid || !Number.isSafeInteger(pid) || pid <= 0) return [];
  return pidtree(pid).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ESRCH" || !alive(pid)) return [];
    throw error;
  });
}
