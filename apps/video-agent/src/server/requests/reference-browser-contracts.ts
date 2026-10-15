import type { ReferenceScreenshot } from "../../shared/contracts";
import type { createReferenceBrowser } from "./reference-screenshot";
export const referenceToolNames = {
  inspect: "inspect_page",
  click: "click_control",
  capture: "capture_screenshot",
} as const;
export type ReferenceToolResult =
  | {
      kind: "inspection";
      page: Awaited<ReturnType<Awaited<ReturnType<typeof createReferenceBrowser>>["inspect"]>>;
    }
  | { kind: "screenshot"; screenshot: ReferenceScreenshot; assetPath: string }
  | { kind: "error"; message: string };
