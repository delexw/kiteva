import path from "node:path";
import { mkdirSync } from "node:fs";
import { dataRoot } from "./paths";

type RuntimeRole = "agent" | "render" | "tools" | "browser";

/** Related preview/full jobs share provider sessions, never another project's writable state. */
export function projectDirectory(workspace: string) {
  const absolute = path.resolve(workspace);
  const relative = path.relative(path.join(dataRoot, "runs"), absolute);
  if (
    relative &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  )
    return path.join(dataRoot, "runs", relative.split(path.sep)[0]);
  return absolute;
}

export function projectRuntimeFiles(workspace: string, role: RuntimeRole) {
  const owner = role === "agent" ? projectDirectory(workspace) : path.resolve(workspace);
  const root = path.join(owner, ".runtime", role);
  return {
    root,
    home: path.join(root, "home"),
    tmp: path.join(root, "tmp"),
    cache: path.join(root, "cache"),
  };
}

export function projectRuntimeEnvironment(workspace: string, role: RuntimeRole) {
  const { home, tmp, cache } = projectRuntimeFiles(workspace, role);
  return {
    HOME: home,
    USERPROFILE: home,
    TMPDIR: tmp,
    // Chromium on macOS ignores TMPDIR for its native socket directory.
    MAC_CHROMIUM_TMPDIR: tmp,
    TMP: tmp,
    TEMP: tmp,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
    XDG_CACHE_HOME: cache,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    npm_config_cache: path.join(cache, "npm"),
    PIP_CACHE_DIR: path.join(cache, "pip"),
    UV_CACHE_DIR: path.join(cache, "uv"),
  };
}

export function prepareProjectRuntime(workspace: string, role: RuntimeRole) {
  const files = projectRuntimeFiles(workspace, role);
  for (const dir of [files.home, files.tmp, files.cache])
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  return files;
}
