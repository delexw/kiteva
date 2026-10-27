import { RetryBudget } from "../../shared/retry-budget";
import { terminateProcessTree } from "../runtime/process-tree";
import { nativeExecutable } from "../runtime/platform";
import { addAbortListener } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, open, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { appRoot, dataRoot, childEnvironment } from "../runtime/config";

export function cavemanSettings(env = process.env) {
  const enabled = env.VIDEO_CAVEMAN_ENABLED !== "false";
  const port = Number(env.VIDEO_CAVEMAN_PORT || 4321);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || [4317, 4319, 5173].includes(port))
    throw Error("VIDEO_CAVEMAN_PORT must be an unused local port (1024–65535)");
  const home = path.join(dataRoot, "caveman");
  return { enabled, port, home, url: `http://127.0.0.1:${port}` };
}

let starting: Promise<void> | undefined;
let startupController = new AbortController();
let ownedProxy: ChildProcess | undefined;
async function proxyHealthy() {
  const settings = cavemanSettings();
  let response: Response;
  try {
    response = await fetch(`${settings.url}/health/live`, { signal: AbortSignal.timeout(1000) });
  } catch {
    return false;
  }
  const health = await response.json();
  if (!response.ok || health.service !== "caveman-proxy" || !health.ok)
    throw Error("Caveman listener is not the app-local compression runtime");
  const state = JSON.parse(
    await readFile(path.join(settings.home, "run", `${settings.port}.json`), "utf8"),
  );
  if (
    state.schema !== "caveman.proxy.run.v1" ||
    state.mode !== "compress" ||
    state.recovery_via_mcp !== true ||
    state.port !== settings.port
  )
    throw Error("Caveman listener is not the app-local compression runtime");
  return true;
}
async function startProxy(signal: AbortSignal) {
  const { home, port } = cavemanSettings();
  signal.throwIfAborted();
  if (await proxyHealthy()) return;
  await access(path.join(home, "bin", nativeExecutable("caveman-proxy")));
  await access(path.join(home, "bin", nativeExecutable("caveman-mcp")));
  await mkdir(home, { recursive: true, mode: 0o700 });
  const log = await open(path.join(home, "sdk-proxy.log"), "a", 0o600);
  try {
    signal.throwIfAborted();
    ownedProxy = spawn(path.join(home, "bin", nativeExecutable("caveman-proxy")), [], {
      detached: process.platform !== "win32",
      cwd: appRoot,
      env: {
        ...childEnvironment(),
        CAVEMAN_HOME: home,
        CAVEMAN_MODE: "compress",
        CAVEMAN_LISTEN: `127.0.0.1:${port}`,
        CAVEMAN_PROXY_OWNER: "video-agent",
        CAVEMAN_RECOVERY: "mcp",
        CAVEMAN_TELEMETRY: "off",
      },
      stdio: ["ignore", log.fd, log.fd],
      windowsHide: true,
    });
    let launchError: Error | undefined;
    ownedProxy.on("error", (error) => {
      launchError = error;
    });
    for (const _attempt of new RetryBudget(50)) {
      signal.throwIfAborted();
      if (launchError || ownedProxy.exitCode !== null)
        throw Error("Caveman proxy could not start; check .data/caveman/sdk-proxy.log");
      if (await proxyHealthy()) return;
      await delay(100, undefined, { signal });
    }
    throw Error("Caveman proxy startup timed out");
  } catch (error) {
    await stopCaveman();
    throw error;
  } finally {
    await log.close();
  }
}

export async function cavemanRuntime(signal: AbortSignal) {
  signal.throwIfAborted();
  const settings = cavemanSettings();
  if (!settings.enabled) return undefined;
  starting ??= startProxy(startupController.signal).catch((error) => {
    starting = undefined;
    throw error;
  });
  // Startup belongs to the shared runtime, not whichever job requested it first.
  let rejectCancellation!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_resolve, reject) => (rejectCancellation = reject));
  const cancellation = addAbortListener(signal, () => rejectCancellation(signal.reason));
  try {
    await Promise.race([starting, cancelled]);
  } finally {
    cancellation[Symbol.dispose]();
  }
  signal.throwIfAborted();
  if (!(await proxyHealthy())) {
    starting = undefined;
    throw Error(
      "Caveman proxy is unavailable; model call stopped rather than bypassing cost measurement",
    );
  }
  signal.throwIfAborted();
  return {
    url: settings.url,
    env: { CAVEMAN_HOME: settings.home },
    mcp: {
      command: path.join(settings.home, "bin", nativeExecutable("caveman-mcp")),
      args: [] as string[],
      env: { CAVEMAN_HOME: settings.home },
    },
  };
}

export function codexCavemanProvider(
  url: string,
  auth: { auth_mode?: string; tokens?: unknown; OPENAI_API_KEY?: unknown },
) {
  const subscription =
    auth.auth_mode === "chatgpt" ||
    auth.auth_mode === "chatgptAuthTokens" ||
    (auth.auth_mode !== "apikey" && Boolean(auth.tokens) && !auth.OPENAI_API_KEY);
  return {
    name: "Caveman",
    base_url: `${url}${subscription ? "/chatgpt" : "/w/codex/v1"}`,
    wire_api: "responses",
    requires_openai_auth: true,
  };
}

export async function codexCavemanAuth(home: string) {
  try {
    return JSON.parse(await readFile(path.join(home, "auth.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {};
  }
}

export async function stopCaveman() {
  startupController.abort();
  startupController = new AbortController();
  const proxy = ownedProxy;
  ownedProxy = undefined;
  starting = undefined;
  if (!proxy || proxy.exitCode !== null) return;
  // Stop only the bundled proxy child started by this server.
  await terminateProcessTree(proxy.pid, { processGroup: true });
}
