import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "@iarna/toml";
import { dataRoot } from "../../runtime/config";
import { browserExecutablePath } from "../../runtime/browser";
import { assertWindowsRenderReady } from "./readiness";
import { renderPrivatePaths } from "./private-paths";
import type { RenderCommand } from "./contracts";

export const windowsRenderSandboxHome = path.join(dataRoot, "runtime", "render-sandbox");
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
          [tmpdir()]: "write",
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
): Promise<RenderCommand> {
  await assertWindowsRenderReady();
  const home = path.join(dataRoot, "runtime", "render-home");
  await mkdir(home, { recursive: true, mode: 0o700 });
  await mkdir(windowsRenderSandboxHome, { recursive: true, mode: 0o700 });
  const privatePaths = renderPrivatePaths();
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
      require.resolve("tsx"),
      fileURLToPath(new URL("./windows-exec.ts", import.meta.url)),
      Buffer.from(
        JSON.stringify({
          cli,
          outputRoot: home,
          configOverrides: sandboxConfigOverrides(
            windowsRenderPolicy(workspace, home, privatePaths),
          ),
          cwd: workspace,
          command: [executable, ...args],
        }),
      ).toString("base64url"),
    ],
    env: {
      CODEX_HOME: windowsRenderSandboxHome,
      HOME: home,
      HYPERFRAMES_BROWSER_PATH: browserExecutablePath(),
    },
  };
}

/** Pass complete top-level tables so CLI dotted-key parsing cannot split paths or domains. */
export function sandboxConfigOverrides(policy: string): string[] {
  return Object.entries(parse(policy)).map(([key, value]) => `${key}=${stringify.value(value)}`);
}
