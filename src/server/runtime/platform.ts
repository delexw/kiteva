import os from "node:os";

export function userHome(env: NodeJS.ProcessEnv = process.env) {
  return env.HOME || env.USERPROFILE || os.homedir();
}

/** Windows needs these to locate system executables, profiles and temporary files. */
export function systemEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const names = [
    "PATH",
    "PATHEXT",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "USER",
    "SHELL",
  ];
  const result: NodeJS.ProcessEnv = {};
  for (const name of names) {
    const key = Object.keys(env).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase(),
    );
    if (key && env[key]) result[name] = env[key];
  }
  result.HOME = userHome(env);
  return result;
}

export function nativeExecutable(name: string, platform: NodeJS.Platform = process.platform) {
  return platform === "win32" ? `${name}.exe` : name;
}

export function defaultPython(platform: NodeJS.Platform = process.platform) {
  return platform === "win32" ? "python" : "python3";
}
