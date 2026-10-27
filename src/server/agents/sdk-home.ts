import { DependencyCleanupError } from "../runtime/process-tree";
import { addAbortListener } from "node:events";
import path from "node:path";
import { prepareCodexToolHook } from "./codex-tool-hooks";
import { userHome } from "../runtime/platform";
import { prepareProjectRuntime } from "../runtime/project-files";
import { constants } from "node:fs";
import { mkdir, access, readdir, copyFile } from "node:fs/promises";
import { dataRoot } from "../runtime/config";
interface HomePreparation {
  promise: Promise<string>;
  controller: AbortController;
  callers: number;
}
const preparing = new Map<string, HomePreparation>();
export async function isolatedCodexHome(
  workspace: string,
  sessionId?: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const folderPath = path.join(prepareProjectRuntime(workspace, "agent").root, "codex");
  // Concurrent turns in one project share setup; other projects own independent SDK homes.
  let setup = preparing.get(folderPath);
  if (!setup) {
    const controller = new AbortController();
    setup = {
      controller,
      callers: 0,
      promise: prepare(folderPath, controller.signal).catch((error) => {
        preparing.delete(folderPath);
        throw error;
      }),
    };
    preparing.set(folderPath, setup);
  }
  const ownedSetup = setup;
  ownedSetup.callers++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (--ownedSetup.callers === 0) ownedSetup.controller.abort();
  };
  let cancellation: ReturnType<typeof addAbortListener> | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    if (signal)
      cancellation = addAbortListener(signal, () => {
        release();
        reject(signal.reason);
      });
  });
  let folder: string;
  try {
    folder = await Promise.race([ownedSetup.promise, cancelled]);
  } finally {
    cancellation?.[Symbol.dispose]();
    release();
    if (signal?.aborted && ownedSetup.callers === 0)
      await ownedSetup.promise.catch((error) => {
        if (error instanceof DependencyCleanupError) throw error;
      });
  }
  signal?.throwIfAborted();
  if (sessionId) await copyExistingSession(folder, sessionId, signal);
  return folder;
}
async function prepare(folder: string, signal: AbortSignal) {
  signal.throwIfAborted();
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await mkdir(path.join(folder, "sessions"), { recursive: true, mode: 0o700 });
  const source = process.env.CODEX_HOME || path.join(userHome(), ".codex");
  for (const name of ["auth.json", "cloud-config-bundle-cache.json", "models_cache.json"]) {
    try {
      signal.throwIfAborted();
      await access(path.join(source, name));
      await copyFile(
        path.join(source, name),
        path.join(folder, name),
        constants.COPYFILE_EXCL,
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  await prepareCodexToolHook(folder, signal);
  return folder;
}
async function copyExistingSession(folder: string, id: string, signal?: AbortSignal) {
  if (!/^[\w-]+$/.test(id)) throw Error("Invalid SDK session ID");
  const sources = [
    path.join(folder, "sessions"),
    path.join(dataRoot, "runtime", "codex", "sessions"),
    path.join(process.env.CODEX_HOME || path.join(userHome(), ".codex"), "sessions"),
  ];
  let visited = 0;
  async function find(dir: string): Promise<string | undefined> {
    signal?.throwIfAborted();
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      signal?.throwIfAborted();
      if (++visited > 15000) return;
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name.endsWith(".jsonl") && e.name.includes(id)) return full;
      if (e.isDirectory()) {
        const result = await find(full);
        if (result) return result;
      }
    }
  }
  for (const source of sources) {
    const file = await find(source);
    if (!file) continue;
    if (source !== sources[0])
      await copyFile(
        file,
        path.join(folder, "sessions", path.basename(file)),
        constants.COPYFILE_EXCL,
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
    return;
  }
}
