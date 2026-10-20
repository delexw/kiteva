import { projectName } from "../../shared/project-name";
import type { CreativeRequest } from "../../shared/contracts";
import { BriefSchema } from "../../shared/agents/schemas/video";
import { PageBriefSchema } from "../../shared/agents/schemas/page";
import { MIN_AUTO_VIDEO_DURATION, resolveVideoDuration } from "../../shared/domains/video";

/** Compatibility context only: the main planner interprets the unabridged request. */
export function directBuildContext(
  request: CreativeRequest,
  assetDescriptions: string[],
  title?: string,
) {
  const source = {
    subject: title ?? projectName({ request }),
    audience: "",
    objective: request.instructions,
    facts: [],
    exactCopy:
      request.outputType === "video" && request.lyrics?.mode === "provided"
        ? [request.lyrics.text]
        : [],
    previewBeat: "",
    assetDescriptions,
    constraints: [],
  };
  return request.outputType === "page"
    ? PageBriefSchema.parse({
        ...source,
        sections: [request.instructions],
        interactionGoals: [request.instructions],
      })
    : BriefSchema.parse({
        ...source,
        suggestedDuration: resolveVideoDuration(request.duration, MIN_AUTO_VIDEO_DURATION),
        durationReason:
          request.duration === "auto"
            ? "Duration is pending main-model planning."
            : "User-selected duration.",
      });
}
