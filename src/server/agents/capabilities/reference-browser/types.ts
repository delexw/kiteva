import { referenceToolRegistry, type BrowserCapabilityResult } from "./tool-registry";
import type { EditableCapture, NativeCaptureReply } from "../../../capture/native-editor";
import type { ReferenceScreenshot } from "../../../../shared/contracts";
import type { createReferenceBrowser } from "../../../jobs/subworkflows/website-reference";
import type { WebsiteRecording } from "../../../jobs/subworkflows/website-capture";
export type ReferenceToolResult =
  | BrowserCapabilityResult
  | EditableCapture
  | NativeCaptureReply
  | {
      kind: "inspection";
      page: Awaited<ReturnType<Awaited<ReturnType<typeof createReferenceBrowser>>["inspect"]>>;
    }
  | { kind: "screenshot"; screenshot: ReferenceScreenshot; assetPath: string }
  | { kind: "recording_started"; recordingId: string }
  | { kind: "video"; recording: WebsiteRecording }
  | { kind: "waiting"; milliseconds: number }
  | { kind: "error"; message: string };

export function enabledReferenceTools(readOnly = false) {
  return Object.entries(referenceToolRegistry)
    .filter(([, definition]) => !readOnly || definition.readOnly)
    .map(([name]) => name);
}
