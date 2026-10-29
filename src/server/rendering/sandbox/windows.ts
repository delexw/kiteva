import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "@iarna/toml";
import {
  prepareProjectRuntime,
  projectRuntimeEnvironment,
  projectRuntimeFiles,
} from "../../runtime/project-files";
import { browserExecutablePath } from "../../runtime/browser";
import { assertWindowsRenderReady } from "./readiness";
import { renderPrivatePaths } from "./private-paths";
import type { RenderCommand } from "./contracts";

export function windowsRenderSandboxHome(workspace: string) {
  return path.join(projectRuntimeFiles(workspace, "render").root, "sandbox");
}
export const renderPermissionProfile = "kiteva-render";

/** A native, model-free CLI operation. All paths and arguments stay separate argv entries. */
export function windowsRenderPolicy(workspace: string, home: string, privatePaths: string[]) {
  // The profile alone enables direct networking; the feature must enforce the managed proxy too.
  const network = {
    enabled: true,
    mode: "limited",
    allow_local_binding: true,
    domains: { localhost: "allow", "127.0.0.1": "allow", "::1": "allow" },
  };
  return stringify({
    default_permissions: renderPermissionProfile,
    shell_environment_policy: { inherit: "none" },
    windows: { sandbox: "elevated" },
    features: { network_proxy: network },
    permissions: {
      [renderPermissionProfile]: {
        filesystem: {
          ":root": "read",
          [workspace]: "write",
          [home]: "write",
          ...Object.fromEntries(privatePaths.map((file) => [file, "deny"])),
        },
        network,
      },
    },
  });
}

export async function windowsRenderCommand(
  executable: string,
  args: string[],
  workspace: string,
  executionDirectory = workspace,
): Promise<RenderCommand> {
  await assertWindowsRenderReady();
  const { home } = prepareProjectRuntime(workspace, "render");
  const sandboxHome = windowsRenderSandboxHome(workspace);
  await mkdir(sandboxHome, { recursive: true, mode: 0o700 });
  const privatePaths = renderPrivatePaths(workspace);
  const require = createRequire(import.meta.url);
  const cli = path.join(
    path.dirname(require.resolve("@openai/codex/package.json")),
    "bin",
    "codex.js",
  );
  return {
    executable: process.execPath,
    args: [
      "--import",
      pathToFileURL(require.resolve("tsx")).href,
      fileURLToPath(new URL("./windows-exec.ts", import.meta.url)),
      Buffer.from(
        JSON.stringify({
          cli,
          outputRoot: home,
          configOverrides: sandboxConfigOverrides(
            windowsRenderPolicy(workspace, home, privatePaths),
          ),
          cwd: executionDirectory,
          command: [executable, ...args],
        }),
      ).toString("base64url"),
    ],
    env: {
      ...projectRuntimeEnvironment(workspace, "render"),
      CODEX_HOME: sandboxHome,
      HYPERFRAMES_BROWSER_PATH: browserExecutablePath(),
    },
  };
}

/** Pass complete top-level tables so CLI dotted-key parsing cannot split paths or domains. */
export function sandboxConfigOverrides(policy: string): string[] {
  return Object.entries(parse(policy)).map(([key, value]) => `${key}=${stringify.value(value)}`);
}
