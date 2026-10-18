import { macosRenderSandbox } from "./sandbox/macos";
import { windowsRenderCommand } from "./sandbox/windows";
import type { RenderCommand } from "./sandbox/contracts";

export async function renderCommand(
  executable: string,
  args: string[],
  workspace: string,
): Promise<RenderCommand> {
  if (process.platform === "win32") return windowsRenderCommand(executable, args, workspace);
  const sandbox = macosRenderSandbox(workspace);
  return {
    executable: "/usr/bin/sandbox-exec",
    args: ["-p", sandbox.profile, executable, ...args],
    env: { HOME: sandbox.home, HYPERFRAMES_BROWSER_PATH: sandbox.browserPath },
  };
}
