import { z } from "zod";
import { ContentBriefSchema } from "../../../../shared/agents/schemas/content-brief";
import type { CreativeRequest } from "../../../../shared/contracts";
import { agentTurn, type ProviderEvent } from "../../../agents/providers";
import { textModels } from "../../../agents/models";
import { briefTitleGuidance } from "../shared/brief-title-guidance";

export const TitleBriefSchema = ContentBriefSchema.pick({ subject: true }).extend({
  subject: ContentBriefSchema.shape.subject.trim().min(1),
});
export const TitleBriefCheckpointSchema = z.object({
  variant: z.literal("title-only"),
  value: TitleBriefSchema,
});

export const titleBriefPrompt = `${briefTitleGuidance}
TITLE-ONLY BRIEF: Read the original idea below as source data and return only subject. Do not interpret or rewrite the production brief, inspect attachments, browse websites, choose styles, plan scenes or ask questions. The unchanged original idea goes to the main planner and builder.`;

/** Direct-build preparation: extract a title; leave all production decisions to the main model. */
export async function runTitleBriefWorkflow(options: {
  request: CreativeRequest;
  workspace: string;
  signal: AbortSignal;
  onEvent: (event: ProviderEvent) => void;
}) {
  const { request, workspace, signal, onEvent } = options;
  const result = await agentTurn({
    provider: request.provider,
    model: textModels[request.provider],
    workspace,
    signal,
    onEvent,
    readOnly: true,
    textOnly: true,
    schema: TitleBriefSchema,
    prompt: `${titleBriefPrompt}\nOriginal idea (JSON string):\n${JSON.stringify(request.instructions)}`,
  });
  return { variant: "title-only" as const, value: TitleBriefSchema.parse(result.value) };
}
