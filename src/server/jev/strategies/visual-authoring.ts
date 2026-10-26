import { animateUiAuthoring } from "../../agents/capabilities/animate-ui/metadata";
import { reactBitsAuthoring } from "../../agents/capabilities/react-bits/metadata";
import { anatomyAuthoring } from "../../agents/bundled-skills/anatomy-metadata";
import { localAuthoring } from "../../agents/local-authoring";
import { rendererMetadataFor } from "../../rendering/renderer-metadata";
import { runJevChoice } from "../choice";
import { randomUUID } from "node:crypto";
import { safeMessage } from "../../runtime/config";
import { bundledSkills } from "../../agents/bundled-skills/registry";
import type {
  AuthoringResource,
  AuthoringResourceSelection,
} from "../../../shared/agents/authoring-resources";
import type {
  ContentBrief,
  CreativeRequest,
  Style,
  StyleCandidate,
} from "../../../shared/contracts";
import { videoRendererOf } from "../../../shared/video-renderers";
import type { ProviderEvent } from "../../agents/agent";

export const authoringResourceSelectionGuidance =
  "AUTHORING RESOURCE SELECTION: Read authoringResources in style-context.json when present. JEV chose exactly one primary authoring resource using its Choice API for this specific brief and renderer. Use that chosen capability, bundled skill or local-code approach; read its skill or component guidance before implementation. Do not mix in an alternative component library or bundled skill by default. Ordinary local implementation code remains available. This is not a Motion Graphic selection or a replacement for the main model's production plan. If a selected resource proves incompatible or unavailable on inspection, preserve the requested result with available tools and document the reason. If JEV is unavailable or the field is absent, choose appropriate available resources directly. Never force a component or skill into a scene solely because it is installed. All calls retain the current provider and default reasoning effort.";

export const authoringResources: AuthoringResource[] = [
  animateUiAuthoring,
  reactBitsAuthoring,
  ...bundledSkills
    .filter((skill) => skill.purpose === "visual_authoring")
    .map((skill) =>
      skill.id === anatomyAuthoring.id
        ? anatomyAuthoring
        : {
            id: skill.id,
            name: skill.name,
            kind: "bundled_skill" as const,
            guidance: skill.guidance,
          },
    ),
  localAuthoring,
];

/** JEV selects useful resources; it does not gate tools, change styles or replace production planning. */
export async function selectAuthoringResources(input: {
  request: CreativeRequest;
  brief: ContentBrief;
  candidate: StyleCandidate;
  styles: Style[];
  signal: AbortSignal;
  onEvent: (event: ProviderEvent) => void;
}): Promise<AuthoringResourceSelection> {
  input.signal.throwIfAborted();
  const invocationId = randomUUID();
  const visualInstructions = input.request.requirements?.images?.instructions;
  const state = {
    visualInstructions,
    instructions: input.request.instructions,
    brief: input.brief,
    outputType: input.request.outputType || "video",
    renderer:
      input.request.outputType === "page"
        ? "standalone HTML with user-driven interactions; locally bundled React and installed UI packages are permitted"
        : rendererMetadataFor(videoRendererOf(input.request)),
    selected: {
      primary: input.candidate.primaryStyleId,
      supporting: input.candidate.supportingStyleIds,
    },
    styles: input.styles
      .filter((s) =>
        [input.candidate.primaryStyleId, ...input.candidate.supportingStyleIds].includes(s.id),
      )
      .map((s) => ({ id: s.id, name: s.name_en, visualDirection: s.visual_cues })),
    resources: authoringResources.map(({ id, name, kind }) => ({ id, name, kind })),
    policy:
      "Choose one primary authoring resource by comparing the advantages, disadvantages and costs written in the Choice option descriptions against the original idea, image instructions, selected Motion Graphics and renderer contract. Honor explicit compatible resource requests. Local code remains available with any choice. Do not change selected styles, renderer, settings, explicit act assignments or user exclusions. No option has a fixed preference. Evaluate visual fit and adaptation effort rather than novelty or catalog size. These descriptions explain capabilities, not runtime readiness: the main model must inspect current source/skills, dependencies and license constraints before use. Video effects must support seekable composition time. The main model owns production planning and reads selected styles through creative_pool.",
  };
  try {
    const result = await runJevChoice({
      invocationId,
      label: "Authoring resource selection",
      questionKey: "resource",
      question:
        "Which primary resource best fits this job? Compare each option's textual advantages, disadvantages, implementation costs and video adaptation needs against state.policy and the requested result. Choose local_code when a specialized component or skill adds no useful fidelity. Select exactly one option.",
      criteria: Object.fromEntries(
        authoringResources.map((resource) => [resource.id, resource.guidance]),
      ),
      state,
      signal: input.signal,
      onEvent: input.onEvent,
    });
    const answer = result.answer;
    const decisions = authoringResources.map((resource) => ({
      id: resource.id,
      use: resource.id === answer.choice,
      probability: answer.probabilities[resource.id],
    }));
    return {
      source: "jev",
      model: result.model,
      selectedIds: [answer.choice],
      decisions,
    };
  } catch (error) {
    input.signal.throwIfAborted();
    const limitation = safeMessage(error);
    input.onEvent({
      type: "warning",
      message:
        "JEV resource selection unavailable; the main model will use the available authoring tools.",
      data: { provider: "jev", invocationId, reason: "resource_selection_unavailable", limitation },
    });
    return { source: "unavailable", selectedIds: [], decisions: [], limitation };
  }
}
