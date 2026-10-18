import { spawn } from "node:child_process";
import path from "node:path";

/** Stop just the process tree owned by this invocation, never processes by image name. */
export function stopProcessTree(
  pid: number | undefined,
  platform: NodeJS.Platform = process.platform,
) {
  if (!pid || !Number.isSafeInteger(pid) || pid <= 0) return;
  if (platform === "win32") {
    const root = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
    const killer = spawn(
      path.win32.join(root, "System32", "taskkill.exe"),
      ["/PID", String(pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
    killer.on("error", () => {
      /* Process may already have exited. */
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    /* Process may already have exited. */
  }
}
