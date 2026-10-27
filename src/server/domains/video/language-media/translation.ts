import path from "node:path";
import { localizeVideoRequest } from "../../../jobs/subworkflows/video-localization";
import type { LanguageMediaInput, TrackTranslator } from "./types";
import { languageMediaPaths } from "./paths";
export function createTrackTranslator(input: LanguageMediaInput): TrackTranslator {
  const { request, signal } = input;
  const { folder } = languageMediaPaths(input.job.workspace);
  return async (text, language, window, attempt) => {
    const translated = await localizeVideoRequest(
      {
        ...request,
        scriptItems: undefined,
        languageTracks: undefined,
        outputLanguage: language,
        subtitles: { mode: "provided", text },
        speech: { mode: "off" },
        translations: undefined,
        instructions: `${request.instructions}\nTranslate faithfully for a ${window.toFixed(2)} second subtitle/narration window.${attempt ? " Shorten the wording to fit naturally without dropping supported meaning." : ""}`,
      },
      path.join(folder, "translations"),
      signal,
      input.onEvent,
    );
    if (translated.subtitles?.mode !== "provided")
      throw Error("Subtitle translation returned no text.");
    return translated.subtitles.text;
  };
}
