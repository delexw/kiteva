import { hasOnScreenSubtitles } from "../../shared/script-items";
import type { CreativeRequest } from "../../shared/contracts";
import { MAX_VIDEO_DURATION } from "../../shared/domains/video";

export function projectSettingsDraft(request: CreativeRequest) {
  return {
    instructions: request.instructions,
    sectionInstructions: {
      music: request.requirements?.music.instructions || "",
      images: request.requirements?.images.instructions || "",
      urls: request.requirements?.urls.instructions || "",
    },
    preference: request.preference,
    provider: request.provider,
    count: request.candidateCount,
    outputType: request.outputType,
    viewport: request.outputType === "page" ? request.viewport : ("desktop" as const),
    duration:
      request.outputType === "video" && request.duration !== "auto"
        ? Math.min(request.duration, MAX_VIDEO_DURATION)
        : ("auto" as const),
    aspect: request.outputType === "video" ? request.aspectRatio : ("16:9" as const),
    resolution: request.outputType === "video" ? request.resolution || "1080p" : "1080p",
    frameRate: request.outputType === "video" ? request.frameRate || 30 : 30,
    subtitlesEnabled: request.outputType === "video" && hasOnScreenSubtitles(request),
    subtitlesText:
      request.outputType === "video" && request.subtitles?.mode === "provided"
        ? request.subtitles.text
        : "",
    urls: request.urls.join("\n"),
    scriptItems: request.outputType === "video" ? request.scriptItems : undefined,
    speech: request.outputType === "video" ? request.speech : undefined,
    pinnedStyleId: request.pinnedStyleId,
    selectedStyleIds: request.selectedStyleIds || [],
  };
}
