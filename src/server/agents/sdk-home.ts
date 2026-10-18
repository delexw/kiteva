import path from "node:path";
import { userHome } from "../runtime/platform";
import { linkSdkFile } from "../runtime/workspace-links";
import { mkdir, access, readdir } from "node:fs/promises";
import { dataRoot } from "../runtime/config";
let preparing: Promise<string> | undefined;
export async function isolatedCodexHome(sessionId?: string) {
  preparing ??= prepare();
  const folder = await preparing;
  if (sessionId) await linkExistingSession(folder, sessionId);
  return folder;
}
async function prepare() {
  const folder = path.join(dataRoot, "runtime", "codex");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await mkdir(path.join(folder, "sessions"), { recursive: true, mode: 0o700 });
  const source = process.env.CODEX_HOME || path.join(userHome(), ".codex");
  for (const name of ["auth.json", "cloud-config-bundle-cache.json", "models_cache.json"]) {
    try {
      await access(path.join(source, name));
      await linkSdkFile(path.join(source, name), path.join(folder, name));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  return folder;
}
async function linkExistingSession(folder: string, id: string) {
  if (!/^[\w-]+$/.test(id)) throw Error("Invalid SDK session ID");
  const source = path.join(process.env.CODEX_HOME || path.join(userHome(), ".codex"), "sessions");
  let visited = 0;
  async function find(dir: string): Promise<string | undefined> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (++visited > 15000) return;
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name.endsWith(".jsonl") && e.name.includes(id)) return full;
      if (e.isDirectory()) {
        const result = await find(full);
        if (result) return result;
      }
    }
  }
  const file = await find(source);
  if (file) await linkSdkFile(file, path.join(folder, "sessions", path.basename(file)));
}
