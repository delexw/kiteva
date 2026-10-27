import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { LanguageMedia } from "../../../../shared/language-tracks";
import type { VideoLanguage } from "../../../../shared/video-language";
import { readStoryboardJson } from "../storyboard";
import { subtitleDocuments } from "./subtitles";
import { buildNarrationTrack } from "./narration";
import { createTrackTranslator } from "./translation";
import { languageMediaPaths } from "./paths";
import type { LanguageMediaInput, LanguageMediaDependencies, SubtitleCue as Cue } from "./types";
export async function buildLanguageMedia(
  input: LanguageMediaInput,
  dependencies: LanguageMediaDependencies = {},
): Promise<LanguageMedia> {
  const { job, request, signal } = input;
  signal.throwIfAborted();
  const settings = request.languageTracks;
  if (!settings) throw Error("Language tracks are not configured.");
  const { folder, base } = languageMediaPaths(job.workspace);
  await mkdir(folder, { recursive: true });
  const result: LanguageMedia = {
    narration: [],
    subtitles: [],
    musicVideo: path.relative(job.workspace, base),
    defaultNarration: settings.defaultNarration || settings.narration[0]?.language,
    defaultSubtitle: settings.defaultSubtitle,
  };
  const translate = dependencies.translate || createTrackTranslator(input);
  const spoken = job.speechTrack?.cues || [];
  if (settings.narration.length && !spoken.length)
    throw Error("Language narration requires measured primary narration cues.");
  const subtitles = spoken.filter((cue) => cue.showSubtitles !== false);
  // Silent subtitle items are represented by the authored storyboard, not their writing instructions.
  const storyboard = await readStoryboardJson(job.workspace);
  const visualCues =
    storyboard.version === 3
      ? storyboard.scenes.flatMap((scene) =>
          scene.beats.flatMap((beat) =>
            beat.audio.subtitles.length
              ? [
                  {
                    text: beat.audio.subtitles.join("\n"),
                    startSeconds: beat.startSeconds,
                    endSeconds: beat.endSeconds,
                  },
                ]
              : [],
          ),
        )
      : [];
  const subtitleSource = [
    ...subtitles,
    ...visualCues.filter(
      (cue) =>
        !subtitles.some(
          (spokenCue) =>
            cue.startSeconds < spokenCue.endSeconds && cue.endSeconds > spokenCue.startSeconds,
        ),
    ),
  ].sort((a, b) => a.startSeconds - b.startSeconds);
  if (settings.subtitles.length && !subtitleSource.length)
    throw Error("No timed subtitle text was provided by the plan or narration.");

  const spokenByLanguage = new Map<VideoLanguage, Cue[]>();
  for (const profile of settings.narration) {
    const track = await buildNarrationTrack(
      input,
      profile,
      result.defaultNarration,
      translate,
      dependencies,
    );
    result.narration.push(track.media);
    spokenByLanguage.set(profile.language, track.cues);
  }
  for (const language of settings.subtitles) {
    signal.throwIfAborted();
    const translatedSpoken = spokenByLanguage.get(language);
    const cues: Cue[] = translatedSpoken ? [...translatedSpoken] : [];
    for (const cue of subtitleSource) {
      if (translatedSpoken && subtitles.includes(cue)) continue;
      cues.push({
        ...cue,
        text: await translate(cue.text, language, cue.endSeconds - cue.startSeconds, 0),
      });
    }
    cues.sort((a, b) => a.startSeconds - b.startSeconds);
    const documents = subtitleDocuments(cues);
    const vtt = path.join(folder, `${language}.vtt`),
      srt = path.join(folder, `${language}.srt`);
    await writeFile(vtt, documents.vtt);
    await writeFile(srt, documents.srt);
    result.subtitles.push({
      language,
      vtt: path.relative(job.workspace, vtt),
      srt: path.relative(job.workspace, srt),
    });
  }
  signal.throwIfAborted();
  await writeFile(path.join(folder, "tracks.json"), JSON.stringify(result, null, 2));
  return result;
}
