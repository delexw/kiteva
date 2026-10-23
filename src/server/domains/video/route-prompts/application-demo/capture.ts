import { readFileSync } from "node:fs";
import { captureInteractionGuidance } from "./shared";

export const openScreenDemoGuidance = readFileSync(
  new URL("../openscreen-demo.md", import.meta.url),
  "utf8",
);

export const applicationDemoCapturePrompt = `CAPTURE STAGE — ONE APPROVED CHAPTER:
Assigned chapter + previous handoff -> isolated starting state -> OpenScreen workflow below -> actual export/result. Do not rediscover or replan the full film. Preserve user timing and readable actions/results.
Shared rules apply to every chapter and retry:
${captureInteractionGuidance}

${openScreenDemoGuidance}`;
