import { deliverySpeech, videoLanguageLabel } from "../../shared/video-language";
import type { CreativeRequest } from "../../shared/contracts";
import type { RoomLibraryAsset } from "../../shared/room";
import { modelDisplayName, providerDisplayName } from "../../shared/model-display-name";
import {
  activeSpeech,
  speechVoices,
  speechEngines,
  speechLanguage,
  pocketLanguages,
} from "../../shared/speech";
import { videoRendererOf, videoRenderers } from "../../shared/video-renderers";
import { roomMaterialSection, roomMaterialSteps, roomQuestions } from "./onboarding";

type ReplyStyle = { id: string; name_en: string };
function speechReply(request: CreativeRequest, assets: RoomLibraryAsset[]) {
  if (request.outputType !== "video") return [];
  const speech = activeSpeech({ ...request, speech: deliverySpeech(request) });
  if (!speech) return ["Speech: Off"];
  if (speech.mode === "uploaded") {
    return [
      `Speech: Uploaded vocals — ${assets.find((asset) => asset.id === speech.assetId)?.originalName || "Unavailable audio file"}`,
    ];
  }
  return [
    "Speech: Narration",
    `Speech engine: ${speechEngines.find((engine) => engine.id === (speech.engine || "kokoro"))!.label}`,
    `Speech language: ${pocketLanguages.find((language) => language.id === speechLanguage(speech.voice, speech.engine, speech.language))?.label || speechLanguage(speech.voice, speech.engine, speech.language)}`,
    `Voice: ${speechVoices.find((voice) => voice.id === speech.voice)?.label || speech.voice}`,
    `Narration volume: ${Math.round((speech.volume ?? 1) * 100)}%`,
    `Speech speed: ${speech.speed}×`,
    `Script source: ${speech.source === "provided" ? "My script" : speech.source === "lyrics" ? "Use lyrics" : "Write a script"}`,
    speech.source === "provided" && speech.text ? `Narration script:\n${speech.text}` : "",
    speech.instructions ? `Speech instructions:\n${speech.instructions}` : "",
  ].filter(Boolean);
}

export function roomSettingsReply(request: CreativeRequest, styles: ReplyStyle[]) {
  const selectedStyles = request.selectedStyleIds || [];
  const styleNames = selectedStyles.map(
    (id) => styles.find((style) => style.id === id)?.name_en || id,
  );
  return [
    ...(request.outputType === "video" && request.outputLanguage
      ? [`Video language: ${videoLanguageLabel(request.outputLanguage)}`]
      : []),
    `Model: ${request.mainModel ? modelDisplayName(request.mainModel) : providerDisplayName(request.provider)}`,
    `Output: ${request.outputType === "page" ? "Interactive page" : "Video"}`,
    ...(request.outputType === "video"
      ? [
          `Length: ${request.duration === "auto" ? "Auto" : `${request.duration} seconds`}`,
          `Aspect ratio: ${request.aspectRatio}`,
          `Resolution: ${request.resolution || "1080p"}`,
          `Frame rate: ${request.frameRate || 30} fps`,
          `Renderer: ${videoRenderers[videoRendererOf(request)].label}`,
        ]
      : [`Preview viewport: ${request.viewport === "mobile" ? "Mobile" : "Desktop"}`]),
    `Creative approach: ${request.preference === "creative" ? "Explore creative ideas" : "Follow my brief"}`,
    styleNames.length
      ? `Selected Motion Graphics: ${styleNames.join(", ")}\nPreview directions: Skipped — build selected Motion Graphics directly`
      : `Preview directions: ${request.candidateCount || 5}\nStyles: Select from preview directions`,
  ].join("\n");
}

/** Derive replies from the current draft so earlier edits never leave stale conversation text. */
export function roomOnboardingReplies(
  request: CreativeRequest,
  assets: RoomLibraryAsset[],
  styles: ReplyStyle[],
) {
  const selected = assets.filter((asset) => request.assetIds.includes(asset.id));
  return roomQuestions.map((_, index) => {
    if (index === 0) return { text: request.instructions, skipped: false };
    if (index === 6) return { text: roomSettingsReply(request, styles), skipped: false };
    if (index === 5) {
      if (request.outputType !== "video")
        return { text: "Not used for interactive pages", skipped: true };
      const text = [
        request.lyrics?.mode === "provided"
          ? `Lyrics on screen:\n${request.lyrics.text}`
          : request.lyrics?.mode === "write"
            ? "Lyrics on screen: Write lyrics for me"
            : "Lyrics on screen: Off",
        ...speechReply(request, selected),
      ].join("\n\n");
      return { text, skipped: false };
    }
    if (index === 3) {
      const parts = [
        request.urls.filter((url) => url.trim()).join("\n"),
        request.requirements?.urls.instructions,
      ];
      const text = parts.filter(Boolean).join("\n\n");
      return { text: text || "No websites", skipped: !text };
    }
    const section = roomMaterialSteps[index as keyof typeof roomMaterialSteps];
    if (!section) return { text: "", skipped: true };
    const files = selected.filter((asset) => roomMaterialSection(asset.originalName) === section);
    const parts = [
      request.requirements?.[section].instructions,
      files.length ? `Files:\n${files.map((asset) => asset.originalName).join("\n")}` : "",
    ];
    const text = parts.filter(Boolean).join("\n\n");
    return { text: text || "Skipped", skipped: !text };
  });
}
