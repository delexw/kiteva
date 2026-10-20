import { BriefSchema } from "../../../../shared/agents/schemas/video";
import { PageBriefSchema } from "../../../../shared/agents/schemas/page";
import { preparationBriefSchemaFor } from "../../../../shared/agents/schemas/preparation-brief";
import { BriefCorrectionSchema } from "../../../../shared/agents/schemas/brief-correction";
import type { Asset, CreativeRequest, ReferenceScreenshot } from "../../../../shared/contracts";
import { MIN_AUTO_VIDEO_DURATION, resolveVideoDuration } from "../../../../shared/domains/video";
import { agentTurn, type ProviderEvent } from "../../../agents/providers";
import { textModels } from "../../../agents/models";
import {
  prepareBriefAttachments,
  briefAttachmentKind,
  briefAttachmentInstructions,
} from "../../../requests/brief-attachments";
import { prepareBriefImages } from "../../../requests/brief-images";
import { readReferenceScreenshots } from "../../../requests/reference-browser-tools";
import { assemblePreparationBrief, preparationBriefPrompt } from "./preparation";
import {
  reviewBriefAssets,
  briefAssetAlignmentPrinciple,
  briefAssetRepairScopeRule,
} from "./asset-review";
import { reviseBriefWithRetry } from "./correction";

/** Full preparation for direction exploration: inspect sources, interpret and review. */
export async function runFullBriefWorkflow(options: {
  request: CreativeRequest;
  workspace: string;
  signal: AbortSignal;
  sourceDescriptions: string[];
  getAsset: (id: string) => Asset | undefined;
  restoreReferences: (screenshots: ReferenceScreenshot[]) => Promise<void>;
  schedule: <T>(task: () => Promise<T>) => Promise<T>;
  onEvent: (purpose?: string) => (event: ProviderEvent) => void;
}) {
  const {
    request,
    workspace,
    signal,
    sourceDescriptions,
    getAsset,
    restoreReferences,
    schedule,
    onEvent,
  } = options;
  const briefSchema = request.outputType === "page" ? PageBriefSchema : BriefSchema;
  const preparationBriefSchema = preparationBriefSchemaFor(request);
  await restoreReferences([]);
  const imageNames = request.assetIds.flatMap((id) => {
    const asset = getAsset(id);
    return asset && briefAttachmentKind(asset) === "image" ? [asset.name] : [];
  });
  const images = await prepareBriefImages(workspace, imageNames, signal);
  const attachments = request.assetIds.map((id) => {
    const asset = getAsset(id);
    if (!asset) throw Error("Uploaded asset not found");
    return asset;
  });
  await prepareBriefAttachments(workspace, attachments, images, signal);
  const interpretation = await schedule(() =>
    agentTurn({
      provider: request.provider,
      model: textModels[request.provider],
      workspace,
      signal: signal,
      readOnly: true,
      referenceUrls: request.urls,
      schema: preparationBriefSchema,
      exploreBriefSections: true,
      onEvent: onEvent(),
      prompt: preparationBriefPrompt,
    }),
  );
  let prepared = {
    ...interpretation,
    value: assemblePreparationBrief(
      request,
      interpretation.value,
      sourceDescriptions,
      await readReferenceScreenshots(workspace),
    ),
  };
  prepared = await reviewBriefAssets({
    brief: prepared.value,
    sessionId: prepared.sessionId,
    request: request,
    workspace,
    signal: signal,
    schedule: (task) => schedule(task),
    onEvent: onEvent("Brief asset self-review"),
    revise: (draft, sessionId, feedback) =>
      schedule(() =>
        reviseBriefWithRetry({
          draft,
          schema: briefSchema,
          signal: signal,
          sessionId,
          revise: (repairSessionId, previousIssue) =>
            agentTurn({
              provider: request.provider,
              model: textModels[request.provider],
              workspace,
              signal: signal,
              sessionId: repairSessionId,
              readOnly: true,
              referenceUrls: request.urls,
              schema: BriefCorrectionSchema,
              promptContext: {
                currentDraft: draft,
                focusedReview: JSON.parse(feedback),
                previousValidationIssue: previousIssue,
              },
              onEvent: onEvent("Brief asset alignment repair"),
              prompt: `${briefAttachmentInstructions}\n${briefAssetAlignmentPrinciple}\n${briefAssetRepairScopeRule} Repair only the single assigned asset alignment issue in this brief. Continue the original preparation session. Inspect affected sources; use reference_browser tools to recapture the correct existing view when required. Preserve the core idea, exact copy and requested settings. Apply only this issue's expected fix and acceptance criterion. Keep every unaffected field, scene, asset, exact copy, requirement and setting unchanged; no unrelated cleanup, rewriting or extra fixes. Change only the targeted source extraction or scene usage and any strictly necessary references, and record any genuine remaining inspection limitation rather than inventing evidence. Update currentDraft.assetPlan for source exclusions and scene links; the available-source inventory is application-owned and must remain unchanged. Return only an edits array conforming to the correction schema, never the full brief or an entire array/object. Use JSON Pointer paths into currentDraft. For replace/remove, copy the exact current leaf value into expected; replace value is the complete corrected leaf, not an excerpt. Add/remove only individual text-array entries; paths and indexes refer to the draft after preceding edits. Keep source identity fields unchanged. The application applies the edits atomically and validates the resulting full brief before a separate review rechecks it. If previousValidationIssue is present, correct that exact rejected-edit error against the unchanged currentDraft; locate scenes/assets by stable ID before choosing their array indexes.\nRead currentDraft and focusedReview from the required input JSON. The review contains exactly one issue, its expected fix and acceptance criteria.`,
            }),
        }),
      ),
  });
  const screenshots = await readReferenceScreenshots(workspace);
  let brief = prepared.value;
  if (request.outputType !== "page") {
    const videoBrief = BriefSchema.parse(brief);
    const duration = resolveVideoDuration(request.duration, videoBrief.suggestedDuration);
    brief = {
      ...videoBrief,
      suggestedDuration: duration,
      durationReason:
        request.duration === "auto" && videoBrief.suggestedDuration < duration
          ? `${videoBrief.durationReason} Auto duration has a ${MIN_AUTO_VIDEO_DURATION}-second minimum for a complete story.`
          : videoBrief.durationReason,
    };
  }
  return {
    assetReviewRevision: 2 as const,
    value: brief,
    sessionId: prepared.sessionId,
    screenshots: screenshots,
  };
}
