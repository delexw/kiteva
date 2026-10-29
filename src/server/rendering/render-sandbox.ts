import { projectRuntimeEnvironment } from "../runtime/project-files";
import { macosRenderSandbox } from "./sandbox/macos";
import { windowsRenderCommand } from "./sandbox/windows";
import type { RenderCommand } from "./sandbox/contracts";

export async function renderCommand(
  executable: string,
  args: string[],
  workspace: string,
  executionDirectory = workspace,
): Promise<RenderCommand> {
  if (process.platform === "win32")
    return windowsRenderCommand(executable, args, workspace, executionDirectory);
  const sandbox = macosRenderSandbox(workspace);
  return {
    executable: "/usr/bin/sandbox-exec",
    args: ["-p", sandbox.profile, executable, ...args],
    env: {
      ...projectRuntimeEnvironment(workspace, "render"),
      HYPERFRAMES_BROWSER_PATH: sandbox.browserPath,
    },
  };
}
