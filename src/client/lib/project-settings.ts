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
    lyricsEnabled:
      request.outputType === "video" && Boolean(request.lyrics && request.lyrics.mode !== "off"),
    lyricsText:
      request.outputType === "video" && request.lyrics?.mode === "provided"
        ? request.lyrics.text
        : "",
    urls: request.urls.join("\n"),
    pinnedStyleId: request.pinnedStyleId,
    selectedStyleIds: request.selectedStyleIds || [],
  };
}
