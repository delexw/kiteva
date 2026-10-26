import path from "node:path";
import { appRoot, agentMode } from "../../../runtime/config";
import type { AgentTurnOptions } from "../../agent";
import type { AgentMcpCapability } from "../shared/types";
import { enabledReferenceTools } from "./types";
import { recordingToolTimeoutSeconds } from "../../../capture/recording-slot";

export type ReferenceBrowserOptions = Pick<
  AgentTurnOptions<unknown>,
  | "referenceUrls"
  | "textOnly"
  | "readOnly"
  | "enableVideoCapture"
  | "captureChapterId"
  | "captureChapterDurationSeconds"
>;

export function referenceBrowserCapability(
  workspace: string,
  options: ReferenceBrowserOptions,
): AgentMcpCapability | undefined {
  return options.referenceUrls?.length && !options.textOnly
    ? {
        command: process.execPath,
        args: [
          "--import",
          path.join(appRoot, "node_modules/tsx/dist/loader.mjs"),
          path.join(appRoot, "src/server/agents/capabilities/reference-browser/server.ts"),
          JSON.stringify({
            workspace,
            urls: options.referenceUrls,
            mode: agentMode,
            enableVideoCapture: !options.readOnly && options.enableVideoCapture !== false,
            captureChapterId: options.captureChapterId,
            captureChapterDurationSeconds: options.captureChapterDurationSeconds,
          }),
        ],
        enabledTools: enabledReferenceTools(
          options.readOnly || options.enableVideoCapture === false,
        ),
        toolTimeoutSeconds: recordingToolTimeoutSeconds,
        env: {
          VIDEO_BROWSER_PATH: process.env.VIDEO_BROWSER_PATH || "",
          OPENSCREEN_EXECUTABLE: process.env.OPENSCREEN_EXECUTABLE || "",
          KITEVA_CAPTURE_WORKER_URL: process.env.KITEVA_CAPTURE_WORKER_URL || "",
          KITEVA_CAPTURE_WORKER_TOKEN: process.env.KITEVA_CAPTURE_WORKER_TOKEN || "",
          HYPERFRAMES_BROWSER_PATH: process.env.HYPERFRAMES_BROWSER_PATH || "",
        },
      }
    : undefined;
}
