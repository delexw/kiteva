import { scriptItemsProblem } from "../../shared/script-items";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  activeSpeech,
  SpeechTrackSchema,
  speechLanguage,
  speechVoiceDefinition,
  type SpeechTrack,
} from "../../shared/speech";
import type { VideoRequest } from "../../shared/domains/video";
import type { Brief } from "../../shared/agents/schemas/video";
import { agentTurn, type ProviderEvent } from "../agents/providers";
import { textModels } from "../agents/models";
import { command } from "../runtime/process";
import { probeVideo } from "../rendering/video-probe";
import { speechProvider } from "./providers";
import type { SpeechProviderId } from "../../shared/speech";
import { matchNarrationLevel, narrationAudioRevision } from "./narration-level";
import { CodedError } from "../../shared/errors";

export const speechReadiness = (
  signal: AbortSignal,
  engine?: SpeechProviderId,
  voice?: string,
  language?: string,
) => speechProvider(engine).readiness(signal, voice, language);
export async function synthesizeSpeech(
  text: string,
  file: string,
  voice: string,
  speed: number,
  signal: AbortSignal,
  engine?: SpeechProviderId,
  language?: string,
  volume = 1,
) {
  const raw = `${file}.${randomUUID()}.raw.wav`;
  try {
    await speechProvider(engine).synthesize(text, raw, voice, speed, signal, language);
    return await matchNarrationLevel(raw, file, volume, signal);
  } finally {
    await rm(raw, { force: true });
  }
}

const ScriptSchema = z.object({ text: z.string().trim().min(1).max(8000) });
export async function prepareSpeech(
  input: {
    request: VideoRequest;
    brief: Brief;
    workspace: string;
    duration: number;
    signal: AbortSignal;
    onEvent: (event: ProviderEvent) => void;
    emit: (type: string, message: string) => void;
  },
  dependencies: { generate?: typeof agentTurn; synthesize?: typeof synthesizeSpeech } = {},
): Promise<SpeechTrack | undefined> {
  const { request, brief, workspace, duration, signal, onEvent, emit } = input;
  if (request.scriptItems !== undefined) return prepareScriptItemsSpeech(input, dependencies);
  const settings = activeSpeech(request);
  if (!settings) return undefined;
  signal.throwIfAborted();
  const context = {
    settings,
    subtitles: request.subtitles,
    instructions: request.instructions,
    brief,
    duration,
  };
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        ...context,
        revision: narrationAudioRevision,
        voiceDefinition: speechVoiceDefinition(settings),
      }),
    )
    .digest("hex");
  const folder = path.join(workspace, "audio");
  const checkpoint = path.join(folder, `speech-${hash}.json`);
  try {
    const saved = SpeechTrackSchema.parse(JSON.parse(await readFile(checkpoint, "utf8")));
    await access(path.join(workspace, saved.file));
    return saved;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(folder, { recursive: true });
  let track: SpeechTrack;
  if (settings.mode === "uploaded") {
    const context = z
      .object({ assetInputs: z.array(z.object({ id: z.string(), path: z.string() })) })
      .parse(JSON.parse(await readFile(path.join(workspace, "style-context.json"), "utf8")));
    const asset = context.assetInputs.find((item) => item.id === settings.assetId);
    if (!asset) throw Error("The selected vocal recording is not attached to this build.");
    const file = await realpath(path.resolve(workspace, asset.path));
    const root = await realpath(path.join(workspace, "assets"));
    if (!file.startsWith(`${root}${path.sep}`))
      throw Error("Vocal recording must be an attached audio asset.");
    const probe = await probeVideo(file, signal);
    if (!probe.streams.some((stream) => stream.codec_type === "audio"))
      throw Error("The selected recording has no audio track.");
    track = {
      file: path.relative(await realpath(workspace), file),
      durationSeconds: Number(probe.format.duration),
      source: "uploaded",
      cues: [],
    };
  } else {
    const startSeconds = settings.startSeconds ?? 0;
    const speakingDuration = duration - startSeconds;
    if (speakingDuration <= 0)
      throw new CodedError("SPEECH_TOO_LONG", "Narration must start before the film ends.");
    let text =
      settings.source === "provided"
        ? settings.text.trim()
        : settings.source === "subtitles" && request.subtitles?.mode === "provided"
          ? request.subtitles.text
          : "";
    // Adjusting playback volume must not ask the model to rewrite the script.
    const scriptHash = createHash("sha256")
      .update(JSON.stringify({ ...context, settings: { ...settings, volume: undefined } }))
      .digest("hex");
    const scriptFile = path.join(folder, `script-${scriptHash}.json`);
    if (settings.source === "write") {
      try {
        text = ScriptSchema.parse(JSON.parse(await readFile(scriptFile, "utf8"))).text;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        emit("state", "Writing narration…");
        const scriptContext = {
          instructions: request.instructions,
          brief,
          delivery: settings.instructions,
          duration: speakingDuration,
          language: speechLanguage(settings.voice, settings.engine, settings.language),
        };
        const result = await (dependencies.generate || agentTurn)({
          textOnly: true,
          provider: request.provider,
          model: textModels[request.provider],
          workspace,
          signal,
          onEvent,
          readOnly: true,
          schema: ScriptSchema,
          prompt: `Write original faceless narration for this concept. Read the supplied context. Preserve facts and exact required copy; no invented claims. Return spoken text only in the schema, with one short sentence per line. The language field is authoritative even when the idea or brief uses another language. Write natural native wording. Aim to leave breathing space and musical pauses inside ${speakingDuration} seconds at ${settings.speed}x speaking speed; for Chinese use at most ${Math.floor(speakingDuration * 3.5 * settings.speed)} Chinese characters, and for English at most ${Math.floor(speakingDuration * 1.8 * settings.speed)} words. Do not write scene instructions or synthesize audio.\nSOURCE DATA:\n${JSON.stringify(scriptContext)}`,
        });
        text = ScriptSchema.parse(result.value).text;
        await writeFile(scriptFile, JSON.stringify({ text }));
      }
    }
    if (!text) throw Error("Provide narration text or prepare subtitles before generating speech.");
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 80) throw Error("Use at most 80 narration lines.");
    const cues: SpeechTrack["cues"] = [];
    const files: string[] = [];
    let elapsed = startSeconds;
    for (const [index, line] of lines.entries()) {
      signal.throwIfAborted();
      emit("state", `Preparing narration ${index + 1}/${lines.length}…`);
      const file = path.join(folder, `voice-${hash}-${index}.wav`);
      const seconds = await (dependencies.synthesize || synthesizeSpeech)(
        line,
        file,
        settings.voice,
        settings.speed,
        signal,
        settings.engine,
        settings.language,
        settings.volume ?? 1,
      );
      if (!Number.isFinite(seconds) || seconds <= 0)
        throw Error("Speech returned an invalid duration.");
      cues.push({ text: line, startSeconds: elapsed, endSeconds: elapsed + seconds });
      elapsed += seconds;
      files.push(file);
    }
    const file = path.join(folder, `speech-${hash}.wav`);
    // Paths are app-generated hex names; the concat list contains no user filenames.
    const list = path.join(folder, `concat-${hash}.txt`);
    await writeFile(list, files.map((file) => `file '${path.basename(file)}'`).join("\n"));
    await command(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        list,
        ...(startSeconds > 0 ? ["-af", `adelay=${startSeconds * 1000}:all=1`] : []),
        "-ar",
        "48000",
        "-ac",
        "2",
        file,
      ],
      folder,
      signal,
    );
    track = {
      file: path.relative(workspace, file),
      durationSeconds: elapsed,
      source: "narration",
      cues,
    };
  }
  if (!Number.isFinite(track.durationSeconds) || track.durationSeconds > duration)
    throw new CodedError(
      "SPEECH_TOO_LONG",
      `The voice recording (${track.durationSeconds.toFixed(1)}s) exceeds the ${duration}s film. Shorten the script, increase speaking speed, or choose a longer film; audio was not truncated.`,
    );
  signal.throwIfAborted();
  const temporary = `${checkpoint}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(track, null, 2));
  await rename(temporary, checkpoint);
  return track;
}

/** Synthesize separately, enforce each window, then let FFmpeg place the measured tracks. */
async function prepareScriptItemsSpeech(
  input: Parameters<typeof prepareSpeech>[0],
  dependencies: Parameters<typeof prepareSpeech>[1],
): Promise<SpeechTrack | undefined> {
  const items = input.request.scriptItems!;
  if (items.some((item) => item.source === "write"))
    throw new CodedError(
      "INVALID_REQUEST",
      "Generate script items from the film plan before preparing speech.",
    );
  const problem = scriptItemsProblem(items, input.duration);
  if (problem) throw new CodedError("INVALID_REQUEST", problem);
  const voiceDefinitions = items.map((item) => speechVoiceDefinition(item.speech)).filter(Boolean);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        items,
        revision: narrationAudioRevision,
        voiceDefinitions: voiceDefinitions.length ? voiceDefinitions : undefined,
      }),
    )
    .digest("hex");
  const folder = path.join(input.workspace, "audio", "items", hash);
  await mkdir(folder, { recursive: true });
  const tracks: { file: string; start: number }[] = [];
  const cues: SpeechTrack["cues"] = [];
  let end = 0;
  for (const item of items) {
    if (item.speech.mode !== "narration") continue;
    const itemHash = createHash("sha256")
      .update(
        JSON.stringify({
          item,
          revision: narrationAudioRevision,
          voiceDefinition: speechVoiceDefinition(item.speech),
        }),
      )
      .digest("hex");
    const workspace = path.join(input.workspace, "audio", "items", itemHash);
    const track = await prepareSpeech(
      {
        ...input,
        workspace,
        duration: item.endSeconds - item.startSeconds,
        request: {
          ...input.request,
          scriptItems: undefined,
          subtitles: { mode: "off" },
          speech: {
            ...item.speech,
            source: "provided",
            text: item.text,
            startSeconds: 0,
            followVideoLanguage: false,
            instructions: "",
          },
        },
      },
      dependencies,
    );
    if (!track) throw Error("Spoken item returned no audio.");
    tracks.push({ file: path.join(workspace, track.file), start: item.startSeconds });
    end = Math.max(end, item.startSeconds + track.durationSeconds);
    cues.push(
      ...track.cues.map((cue) => ({
        ...cue,
        startSeconds: cue.startSeconds + item.startSeconds,
        endSeconds: cue.endSeconds + item.startSeconds,
        scriptItemId: item.id,
        showSubtitles: item.showSubtitles,
      })),
    );
  }
  if (!tracks.length) return undefined;
  const file = path.join(folder, "speech.wav");
  const filters = tracks.map(
    (track, index) => `[${index}:a]adelay=${track.start * 1000}:all=1[v${index}]`,
  );
  filters.push(
    `${tracks.map((_, index) => `[v${index}]`).join("")}amix=inputs=${tracks.length}:duration=longest:normalize=0[out]`,
  );
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      ...tracks.flatMap((track) => ["-i", track.file]),
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-ar",
      "48000",
      "-ac",
      "2",
      file,
    ],
    folder,
    input.signal,
  );
  return {
    file: path.relative(input.workspace, file),
    durationSeconds: end,
    source: "narration",
    cues: cues.sort((a, b) => a.startSeconds - b.startSeconds),
  };
}

/** Mix once after any renderer, ducking the existing soundtrack beneath the voice. */
export async function mixSpeech(
  video: string,
  track: SpeechTrack,
  duration: number,
  signal: AbortSignal,
) {
  if (!Number.isFinite(track.durationSeconds) || track.durationSeconds > duration)
    throw new CodedError(
      "SPEECH_TOO_LONG",
      "Narration exceeds the chosen film duration; revise its text or placement. Audio was not truncated.",
    );
  const probe = await probeVideo(video, signal);
  const background = probe.streams.some((stream) => stream.codec_type === "audio");
  const output = `${video}.speech.mp4`;
  const workspace = await realpath(path.resolve(path.dirname(video), ".."));
  const voice = await realpath(path.resolve(workspace, track.file));
  if (
    !voice.startsWith(`${workspace}${path.sep}`) ||
    voice.includes(`${path.sep}node_modules${path.sep}`)
  )
    throw new CodedError(
      "SPEECH_FAILED",
      "Voice audio must be inside the current build workspace.",
    );
  const filter = background
    ? `[1:a]apad,atrim=duration=${duration},asplit=2[voice][control];[0:a][control]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=300[bed];[bed][voice]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true[audio]`
    : `[1:a]apad,atrim=duration=${duration},alimiter=limit=0.95:level=false:latency=true[audio]`;
  try {
    await command(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        video,
        "-i",
        voice,
        "-filter_complex",
        filter,
        "-map",
        "0:v:0",
        "-map",
        "[audio]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        String(duration),
        "-movflags",
        "+faststart",
        output,
      ],
      path.dirname(video),
      signal,
    );
    signal.throwIfAborted();
    await rename(output, video);
  } catch (error) {
    signal.throwIfAborted();
    throw new CodedError("SPEECH_FAILED", `Voice mixing failed: ${(error as Error).message}`);
  } finally {
    await rm(output, { force: true });
  }
}
