import { RetryBudget } from "../../../../shared/retry-budget";
import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import { prepareSpeech, mixSpeech } from "../../../audio/speech";
import { command } from "../../../runtime/process";
import type { SpeechTrack } from "../../../../shared/speech";
import type { LanguageTracks, LanguageMedia } from "../../../../shared/language-tracks";
import type { VideoLanguage } from "../../../../shared/video-language";
import type {
  LanguageMediaInput,
  LanguageMediaDependencies,
  TrackTranslator,
  SubtitleCue as Cue,
} from "./types";
import { languageMediaPaths } from "./paths";
export async function buildNarrationTrack(
  input: LanguageMediaInput,
  profile: LanguageTracks["narration"][number],
  primaryLanguage: VideoLanguage | undefined,
  translate: TrackTranslator,
  dependencies: LanguageMediaDependencies,
): Promise<{ media: LanguageMedia["narration"][number]; cues: Cue[] }> {
  const { job, request, signal } = input;
  const { folder, base } = languageMediaPaths(job.workspace);
  const spoken = job.speechTrack?.cues || [];
  const subtitles = spoken.filter((cue) => cue.showSubtitles !== false);
  if (profile.language === primaryLanguage && job.speechTrack) {
    const video = path.join(job.workspace, "renders", `full.${profile.language}.mp4`);
    await copyFile(path.join(job.workspace, job.video || "renders/full.mp4"), video);
    const audio = path.join(folder, `${profile.language}.wav`);
    await command(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        path.join(job.workspace, job.speechTrack.file),
        "-af",
        `apad=whole_dur=${job.duration}`,
        "-ar",
        "48000",
        "-ac",
        "2",
        audio,
      ],
      job.workspace,
      signal,
    );
    const mix = path.join(folder, `${profile.language}.mix.m4a`);
    await command(
      "ffmpeg",
      ["-y", "-v", "error", "-i", video, "-vn", "-c:a", "copy", mix],
      job.workspace,
      signal,
    );
    return {
      media: {
        language: profile.language,
        video: path.relative(job.workspace, video),
        audio: path.relative(job.workspace, audio),
        mix: path.relative(job.workspace, mix),
      },
      cues: subtitles,
    };
  }
  signal.throwIfAborted();
  input.emit("phase", `Preparing ${profile.language} narration…`);
  const pieces: { file: string; cue: Cue; ratio: number }[] = [];
  for (const [index, cue] of spoken.entries()) {
    const window = Math.min(job.duration, cue.endSeconds) - cue.startSeconds;
    if (window <= 0) throw Error("Narration cue has no usable time window.");
    let accepted = false;
    for (const { index: attempt } of new RetryBudget(2)) {
      const text = await translate(cue.text, profile.language, window, attempt);
      const workspace = path.join(folder, profile.language, `${index}-${attempt}`);
      await mkdir(workspace, { recursive: true });
      const track = await (dependencies.speak || prepareSpeech)({
        ...input,
        workspace,
        duration: job.duration,
        request: {
          ...request,
          languageTracks: undefined,
          scriptItems: undefined,
          subtitles: { mode: "off" },
          speech: {
            ...profile.speech,
            language: profile.language,
            source: "provided",
            text,
            startSeconds: 0,
            followVideoLanguage: false,
          },
        },
      });
      if (!track) throw Error("Language narration returned no audio.");
      const ratio = Math.max(1, track.durationSeconds / window);
      if (ratio > 1.5) continue;
      pieces.push({ file: path.join(workspace, track.file), cue: { ...cue, text }, ratio });
      accepted = true;
      break;
    }
    if (!accepted)
      throw Error(
        `${profile.language} narration does not fit cue ${index + 1} after shortening. The shared visual timing was preserved.`,
      );
  }
  const audio = path.join(folder, `${profile.language}.wav`);
  const filters = pieces.map(
    (piece, i) =>
      `[${i}:a]atempo=${piece.ratio},adelay=${Math.round(piece.cue.startSeconds * 1000)}:all=1[a${i}]`,
  );
  filters.push(
    `${pieces.map((_, i) => `[a${i}]`).join("")}amix=inputs=${pieces.length}:duration=longest:normalize=0,aresample=48000,apad=whole_dur=${job.duration}[out]`,
  );
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      ...pieces.flatMap((piece) => ["-i", piece.file]),
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-ar",
      "48000",
      "-ac",
      "2",
      audio,
    ],
    job.workspace,
    signal,
  );
  const video = path.join(job.workspace, "renders", `full.${profile.language}.mp4`);
  await copyFile(base, video);
  const track: SpeechTrack = {
    file: path.relative(job.workspace, audio),
    durationSeconds: job.duration,
    source: "narration",
    cues: pieces.map((piece) => piece.cue),
  };
  await mixSpeech(video, track, job.duration, signal);
  const mix = path.join(folder, `${profile.language}.mix.m4a`);
  await command(
    "ffmpeg",
    ["-y", "-v", "error", "-i", video, "-vn", "-c:a", "copy", mix],
    job.workspace,
    signal,
  );
  return {
    cues: pieces
      .filter((_, index) => spoken[index].showSubtitles !== false)
      .map((piece) => piece.cue),
    media: {
      language: profile.language,
      video: path.relative(job.workspace, video),
      audio: track.file,
      mix: path.relative(job.workspace, mix),
    },
  };
}
