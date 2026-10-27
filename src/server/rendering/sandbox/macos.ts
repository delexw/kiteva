import { browserExecutablePath } from "../../runtime/browser";
import path from "node:path";
import { renderPrivatePaths } from "./private-paths";
import { existsSync, realpathSync } from "node:fs";
import { prepareProjectRuntime } from "../../runtime/project-files";
export function macosRenderSandbox(workspace: string) {
  if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec"))
    throw Error("Isolated rendering requires the macOS sandbox runtime in this local V1.");
  const { home, tmp } = prepareProjectRuntime(workspace, "render");
  const quote = (value: string) =>
    JSON.stringify(existsSync(value) ? realpathSync(value) : path.resolve(value));
  const privatePaths = renderPrivatePaths(workspace);
  const profile = `(version 1)
(allow default)
(deny file-write*)
(allow file-write* (subpath ${quote(workspace)}) (literal "/dev/null"))
(deny file-read* ${privatePaths.map((p) => `(subpath ${quote(p)})`).join(" ")})
(deny network-outbound)
(allow network-outbound (remote ip "localhost:*"))`;
  const browserPath = browserExecutablePath();
  return { home, tmp, profile, browserPath };
}
