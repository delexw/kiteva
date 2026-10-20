import { briefTitleGuidance } from "../shared/brief-title-guidance";
import { assetRequirementsPolicy } from "../../../../shared/asset-requirements-policy";
import { briefExplorationInstructions } from "../../../agents/brief-exploration";
import { briefAttachmentInstructions } from "../../../requests/brief-attachments";
import { briefAssetAlignmentPrinciple } from "./asset-review";
import { preparationOutputGuidance } from "../../../../shared/agents/schemas/preparation-brief";
import type { CreativeRequest, ReferenceScreenshot } from "../../../../shared/contracts";
import { BriefSchema } from "../../../../shared/agents/schemas/video";
import { PageBriefSchema } from "../../../../shared/agents/schemas/page";
import { preparationBriefSchemaFor } from "../../../../shared/agents/schemas/preparation-brief";

/** Assemble the full handoff without asking the model to regenerate existing request data. */
export function assemblePreparationBrief(
  request: CreativeRequest,
  value: unknown,
  sourceDescriptions: string[],
  screenshots: ReferenceScreenshot[],
) {
  const interpretation = preparationBriefSchemaFor(request).parse(value);
  const exactCopy: string[] = [];
  if (request.outputType !== "page") {
    if (request.lyrics?.mode === "provided") exactCopy.push(request.lyrics.text);
    if (request.speech?.mode === "narration" && request.speech.text.trim())
      exactCopy.push(request.speech.text);
  }
  const content = {
    ...interpretation,
    exactCopy: [...new Set(exactCopy)],
    assetDescriptions: [
      ...sourceDescriptions,
      ...screenshots.map(
        (screenshot) =>
          `assets/${screenshot.name}: captured reference from ${screenshot.url}; inspect the image before making visual claims.`,
      ),
    ],
  };
  if (request.outputType === "page") return PageBriefSchema.parse(content);
  return BriefSchema.parse(
    request.duration === "auto"
      ? content
      : {
          ...content,
          suggestedDuration: request.duration,
          durationReason: "Explicit user-requested duration, preserved by the application.",
        },
  );
}

export const preparationBriefPrompt = `${assetRequirementsPolicy.guidance}\n${briefExplorationInstructions}\n${briefAttachmentInstructions}\n${briefAssetAlignmentPrinciple}\nRead input.json, brief-images.json and brief-attachments.json completely. Pica copies are only for brief inspection, never production assets. ${briefTitleGuidance} Keep previewBeat and any proposed scenes Motion Graphic-neutral: describe the narrative action and intended meaning. Do not suggest Motion Graphics anywhere in the brief. Preserve visual choices explicitly requested by the user or evidenced in supplied assets. Defer all other visual treatment to the subsequent Motion Graphic selection stage. Inspect supplied sources and use reference_browser tools for relevant existing pages when URLs are supplied. Inspect captures before making image-content claims. Gather evidence and genuine access limitations; leave the production plan and pending recordings to the main model. Do not require screenshots of every future demo interaction. Preserve explicit user choices in the original request; do not invent Motion Graphics or product claims. Infer audience and objective only if omitted. For a page identify its sections and interaction goals; for a video identify one representative silent preview beat. Describe the story action without inventing visual treatments. Detailed source evidence remains in the manifests and independent asset review. Uploaded audio metadata does not prove speech, vocals or instrument content. Do not generate narration, lyrics, music or video during preparation.\n${preparationOutputGuidance}`;
