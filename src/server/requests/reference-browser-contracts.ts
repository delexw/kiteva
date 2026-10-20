import type { EditableCapture, NativeCaptureReply } from "../capture/native-editor";
import type { ReferenceScreenshot } from "../../shared/contracts";
import type { createReferenceBrowser } from "../jobs/subworkflows/website-reference";
import type { WebsiteRecording } from "../jobs/subworkflows/website-capture";
export const referenceToolNames = {
  inspect: "inspect_page",
  click: "click_control",
  capture: "capture_screenshot",
  video: "capture_video",
  fill: "fill_control",
  scroll: "scroll_page",
  wait: "wait_for_view",
} as const;
export type ReferenceToolResult =
  | EditableCapture
  | NativeCaptureReply
  | {
      kind: "inspection";
      page: Awaited<ReturnType<Awaited<ReturnType<typeof createReferenceBrowser>>["inspect"]>>;
    }
  | { kind: "screenshot"; screenshot: ReferenceScreenshot; assetPath: string }
  | { kind: "recording_started"; recordingId: string; maxSeconds: number }
  | { kind: "video"; recording: WebsiteRecording }
  | { kind: "waiting"; milliseconds: number }
  | { kind: "error"; message: string };

export function enabledReferenceTools(readOnly = false) {
  return readOnly
    ? [
        referenceToolNames.inspect,
        referenceToolNames.click,
        referenceToolNames.capture,
        referenceToolNames.scroll,
      ]
    : Object.values(referenceToolNames);
}
