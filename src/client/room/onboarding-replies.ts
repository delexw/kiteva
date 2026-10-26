import { creativeApproachLabel } from "../../shared/creative-approach";
import { buildRouteLabel, buildRouteOf } from "../../shared/build-route";
import { translateUi } from "../i18n/service";
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
  if (!speech) return [translateUi("Speech: Off")];
  if (speech.mode === "uploaded") {
    return [
      translateUi("Speech: Uploaded vocals — {{value0}}", {
        value0:
          assets.find((asset) => asset.id === speech.assetId)?.originalName ||
          "Unavailable audio file",
      }),
    ];
  }
  return [
    translateUi("Speech: Narration"),
    translateUi("Speech engine: {{value0}}", {
      value0: speechEngines.find((engine) => engine.id === (speech.engine || "kokoro"))!.label,
    }),
    translateUi("Speech language: {{value0}}", {
      value0:
        pocketLanguages.find(
          (language) =>
            language.id === speechLanguage(speech.voice, speech.engine, speech.language),
        )?.label || speechLanguage(speech.voice, speech.engine, speech.language),
    }),
    translateUi("Voice: {{value0}}", {
      value0: speechVoices.find((voice) => voice.id === speech.voice)?.label || speech.voice,
    }),
    translateUi("Narration volume: {{value0}}%", {
      value0: Math.round((speech.volume ?? 1) * 100),
    }),
    translateUi("Speech speed: {{value0}}×", { value0: speech.speed }),
    translateUi("Script source: {{value0}}", {
      value0:
        speech.source === "provided"
          ? "My script"
          : speech.source === "lyrics"
            ? "Use lyrics"
            : "Write a script",
    }),
    speech.source === "provided" && speech.text
      ? translateUi("Narration script:\n{{value0}}", { value0: speech.text })
      : "",
    speech.instructions
      ? translateUi("Speech instructions:\n{{value0}}", { value0: speech.instructions })
      : "",
  ].filter(Boolean);
}

export function roomSettingsReply(request: CreativeRequest, styles: ReplyStyle[]) {
  const selectedStyles = request.selectedStyleIds || [];
  const styleNames = selectedStyles.map(
    (id) => styles.find((style) => style.id === id)?.name_en || id,
  );
  return [
    ...(request.outputType === "video" && request.outputLanguage
      ? [
          translateUi("Video language: {{value0}}", {
            value0: translateUi(videoLanguageLabel(request.outputLanguage)),
          }),
        ]
      : []),
    translateUi("Model: {{value0}}", {
      value0: request.mainModel
        ? modelDisplayName(request.mainModel)
        : providerDisplayName(request.provider),
    }),
    translateUi("Output: {{value0}}", {
      value0: translateUi(
        { page: "Interactive page", video: "Video" }[request.outputType || "video"],
      ),
    }),
    ...(request.outputType === "video"
      ? [
          translateUi("Length: {{value0}}", {
            value0:
              request.duration === "auto"
                ? translateUi("Auto")
                : translateUi("{{count}} seconds", { count: request.duration }),
          }),
          translateUi("Aspect ratio: {{value0}}", { value0: request.aspectRatio }),
          translateUi("Resolution: {{value0}}", { value0: request.resolution || "1080p" }),
          translateUi("Frame rate: {{value0}} fps", { value0: request.frameRate || 30 }),
          translateUi("Renderer: {{value0}}", {
            value0: videoRenderers[videoRendererOf(request)].label,
          }),
        ]
      : [
          translateUi("Preview viewport: {{value0}}", {
            value0: translateUi(
              { mobile: "Mobile", desktop: "Desktop" }[request.viewport || "desktop"],
            ),
          }),
        ]),
    translateUi("Build route: {{value0}}", { value0: translateUi(buildRouteLabel(request)) }),
    ...(buildRouteOf(request) === "automatic-previews"
      ? [
          translateUi("Creative approach: {{value0}}", {
            value0: translateUi(creativeApproachLabel(request)),
          }),
        ]
      : []),
    styleNames.length
      ? translateUi(
          "Selected Motion Graphics: {{value0}}\nPreview directions: Skipped — build selected Motion Graphics directly",
          { value0: styleNames.map((name) => translateUi(name)).join(", ") },
        )
      : translateUi("Preview directions: {{value0}}\nStyles: Select from preview directions", {
          value0: request.candidateCount || 5,
        }),
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
        return { text: translateUi("Not used for interactive pages"), skipped: true };
      if (request.scriptItems !== undefined)
        return {
          text: request.scriptItems
            .map((item, index) =>
              [
                `${translateUi("Script item {{value0}}", { value0: index + 1 })} · ${item.startSeconds}–${item.endSeconds}s`,
                item.source === "write"
                  ? `${translateUi("Script instructions")}: ${item.text}`
                  : item.text,
                translateUi(item.showLyrics ? "Lyrics on screen: On" : "Lyrics on screen: Off"),
                ...speechReply(
                  {
                    ...request,
                    scriptItems: undefined,
                    lyrics: { mode: "off" },
                    speech:
                      item.speech.mode === "narration"
                        ? {
                            ...item.speech,
                            source: item.source || "provided",
                            text: "",
                            instructions: "",
                            followVideoLanguage: false,
                          }
                        : item.speech,
                  },
                  selected,
                ),
              ].join("\n"),
            )
            .join("\n\n"),
          skipped: false,
        };
      const text = [
        request.lyrics?.mode === "provided"
          ? translateUi("Lyrics on screen:\n{{value0}}", { value0: request.lyrics.text })
          : request.lyrics?.mode === "write"
            ? translateUi("Lyrics on screen: Write lyrics for me")
            : translateUi("Lyrics on screen: Off"),
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
      return { text: text || translateUi("No websites"), skipped: !text };
    }
    const section = roomMaterialSteps[index as keyof typeof roomMaterialSteps];
    if (!section) return { text: "", skipped: true };
    const files = selected.filter((asset) => roomMaterialSection(asset.originalName) === section);
    const parts = [
      request.requirements?.[section].instructions,
      files.length
        ? translateUi("Files:\n{{value0}}", {
            value0: files.map((asset) => asset.originalName).join("\n"),
          })
        : "",
    ];
    const text = parts.filter(Boolean).join("\n\n");
    return { text: text || translateUi("Skipped"), skipped: !text };
  });
}
