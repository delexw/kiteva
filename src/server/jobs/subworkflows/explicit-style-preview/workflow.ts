import { requestedStyleScopeGuidance } from "../../../../shared/style-combinations";
import { z } from "zod";
import { CandidateCopySchema } from "../../../../shared/agents/schemas/candidate-copy";
import { ProposalSchema } from "../../../../shared/agents/schemas/proposals";
import type { CreativeRequest, Style, StyleCandidate } from "../../../../shared/contracts";
import { agentTurn, type ProviderEvent } from "../../../agents/providers";
import { models } from "../../../runtime/config";
import { manualDirection } from "../../manual-direction";

export const ExplicitStylePreviewsSchema = z.object({
  policy: z.literal("explicit-style-previews-v1"),
  candidates: z
    .array(
      ProposalSchema.shape.options.element.extend({
        id: z.string(),
        score: z.literal(0),
        confidence: z.literal(0),
        dimensions: z.object({}).strict(),
      }),
    )
    .min(1)
    .max(5),
});

/** Plan creative executions of fixed user styles; neither propose nor rank style combinations. */
export async function runExplicitStylePreviewWorkflow(input: {
  request: CreativeRequest;
  styles: Style[];
  workspace: string;
  signal: AbortSignal;
  previousDirections: StyleCandidate[];
  onEvent: (event: ProviderEvent) => void;
}) {
  const { request, styles, workspace, signal, onEvent } = input;
  const base = manualDirection(request, styles);
  const schema = z.object({
    previewBeat: z.string().min(1),
    directions: z
      .array(
        CandidateCopySchema.extend({
          sceneRoles: z.array(z.string()).min(1),
          rationale: z.string().min(1),
        }),
      )
      .length(request.candidateCount),
  });
  const result = await agentTurn({
    provider: request.provider,
    model: request.mainModel || models[request.provider],
    workspace,
    signal,
    onEvent,
    readOnly: true,
    referenceUrls: request.urls,
    schema,
    promptContext: {
      request,
      candidate: base,
      previousDirections: input.previousDirections,
    },
    prompt: `EXPLICIT-STYLE PREVIEWS: The original request and supplied styles in the input JSON are authoritative. Inspect supplied sources as needed. Choose one representative previewBeat, then plan exactly ${request.candidateCount} distinct creative executions of that same beat using the Settings-selected Motion Graphics within their requested scopes. Vary composition, storytelling, typography or motion treatment meaningfully while preserving those styles. Do not propose, score, rank or choose alternative style combinations. ${requestedStyleScopeGuidance} Describe each execution and its style roles concretely for the builder. Keep the original idea unchanged. Read input.json and available attachments when relevant. Previous directions are context for fresh executions, not a request to change the styles.`,
  });
  const plan = schema.parse(result.value);
  return {
    policy: "explicit-style-previews-v1" as const,
    previewBeat: plan.previewBeat,
    candidates: plan.directions.map((direction) => ({
      ...manualDirection(request, styles),
      ...direction,
      score: 0 as const,
      confidence: 0 as const,
      dimensions: {},
      primaryStyleId: base.primaryStyleId,
      supportingStyleIds: base.supportingStyleIds,
    })),
  };
}
