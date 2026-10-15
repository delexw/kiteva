import { browserExecutablePath } from "../runtime/browser";
import path from "node:path";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dataRoot, appRoot } from "../runtime/config";
export function renderSandbox(workspace: string) {
  if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec"))
    throw Error("Isolated rendering requires the macOS sandbox runtime in this local V1.");
  const home = path.join(dataRoot, "runtime", "render-home");
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const quote = (value: string) =>
    JSON.stringify(existsSync(value) ? realpathSync(value) : path.resolve(value));
  const privatePaths = [".codex", ".claude", ".ssh", ".aws", ".config"].map((name) =>
    path.join(process.env.HOME || "", name),
  );
  privatePaths.push(
    path.join(dataRoot, "runtime", "codex"),
    path.join(appRoot, ".env"),
    path.join(appRoot, ".env.local"),
  );
  const profile = `(version 1)
(allow default)
(deny file-write*)
(allow file-write* (subpath ${quote(workspace)}) (subpath ${quote(home)}) (subpath ${quote(tmpdir())}) (subpath "/private/tmp") (literal "/dev/null"))
(deny file-read* ${privatePaths.map((p) => `(subpath ${quote(p)})`).join(" ")})
(deny network-outbound)
(allow network-outbound (remote ip "localhost:*"))`;
  const browserPath = browserExecutablePath();
  return { home, profile, browserPath };
}
