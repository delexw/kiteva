import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  activeSpeech,
  SpeechTrackSchema,
  speechVoices,
  type SpeechReadiness,
  type SpeechTrack,
} from "../../shared/speech";
import type { VideoRequest } from "../../shared/domains/video";
import type { Brief } from "../../shared/agents/schemas/video";
import { agentTurn, type ProviderEvent } from "../agents/providers";
import { textModels } from "../agents/models";
import { appRoot, dataRoot } from "../runtime/config";
import { command } from "../runtime/process";
import { probeVideo } from "../rendering/video-probe";
import { WorkQueue } from "../jobs/queue";
import { CodedError } from "../../shared/errors";

const cli = path.join(appRoot, "node_modules/hyperframes/bin/hyperframes.mjs");
const synthesisQueue = new WorkQueue(1);
const managedPython = path.join(
  dataRoot,
  "speech-venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const python = () =>
  process.env.HYPERFRAMES_PYTHON || (existsSync(managedPython) ? managedPython : "python3");

export async function speechReadiness(signal: AbortSignal): Promise<SpeechReadiness> {
  const checks = async () => {
    await command(
      python(),
      ["-c", "import kokoro_onnx, soundfile; print('ready')"],
      appRoot,
      signal,
      () => {},
      15000,
    );
    const cache = path.join(os.homedir(), ".cache/hyperframes/tts");
    await Promise.all([
      access(cli),
      access(path.join(cache, "models/kokoro-v1.0.onnx")),
      access(path.join(cache, "voices/voices-v1.0.bin")),
    ]);
  };
  // Retry transient interpreter/cache errors before declaring the runtime unavailable.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await checks();
      return { available: true, detail: "Local narration · Kokoro. No provider credits." };
    } catch {
      signal.throwIfAborted();
    }
  }
  return {
    available: false,
    detail:
      "Local speech needs setup. Run npm run speech:setup or see docs/speech.md. Uploaded vocals still work.",
  };
}

export async function synthesizeSpeech(
  text: string,
  file: string,
  voice: string,
  speed: number,
  signal: AbortSignal,
) {
  return synthesisQueue.run(async () => {
    signal.throwIfAborted();
    const ready = await speechReadiness(signal);
    if (!ready.available) throw new CodedError("SPEECH_NOT_READY", ready.detail);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.wav`;
    const script = `${temporary}.txt`;
    await writeFile(script, text);
    try {
      await command(
        process.execPath,
        [
          cli,
          "tts",
          "--text-file",
          script,
          "--voice",
          voice,
          "--speed",
          String(speed),
          "--output",
          temporary,
          "--json",
        ],
        path.dirname(file),
        signal,
        () => {},
        300000,
        false,
        () => {},
        { HYPERFRAMES_PYTHON: python() },
      );
      const probe = await probeVideo(temporary, signal);
      if (!probe.streams.some((stream) => stream.codec_type === "audio"))
        throw Error("Speech synthesis returned no audio.");
      signal.throwIfAborted();
      await rename(temporary, file);
      return Number(probe.format.duration);
    } catch (error) {
      signal.throwIfAborted();
      throw new CodedError("SPEECH_FAILED", `Voice synthesis failed: ${(error as Error).message}`);
    } finally {
      await rm(script, { force: true });
      await rm(temporary, { force: true });
    }
  });
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
  const settings = activeSpeech(request);
  if (!settings) return undefined;
  signal.throwIfAborted();
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        revision: 1,
        settings,
        lyrics: request.lyrics,
        instructions: request.instructions,
        brief,
        duration,
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
    let text =
      settings.source === "provided"
        ? settings.text.trim()
        : settings.source === "lyrics" && request.lyrics?.mode === "provided"
          ? request.lyrics.text
          : "";
    const scriptFile = path.join(folder, `script-${hash}.json`);
    if (settings.source === "write") {
      try {
        text = ScriptSchema.parse(JSON.parse(await readFile(scriptFile, "utf8"))).text;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        emit("state", "Writing narration…");
        const result = await (dependencies.generate || agentTurn)({
          provider: request.provider,
          model: textModels[request.provider],
          workspace,
          signal,
          onEvent,
          readOnly: true,
          schema: ScriptSchema,
          promptContext: {
            instructions: request.instructions,
            brief,
            delivery: settings.instructions,
            duration,
            language: speechVoices.find((voice) => voice.id === settings.voice)!.language,
          },
          prompt: `Write original faceless narration for this concept. Read the supplied context. Preserve facts and exact required copy; no invented claims. Return spoken text only in the schema, with one short sentence per line. Aim to leave breathing space and musical pauses inside ${duration} seconds at ${settings.speed}x speaking speed; use at most ${Math.floor(duration * 1.8 * settings.speed)} words for English. Do not write scene instructions or synthesize audio.`,
        });
        text = ScriptSchema.parse(result.value).text;
        await writeFile(scriptFile, JSON.stringify({ text }));
      }
    }
    if (!text) throw Error("Provide narration text or prepare lyrics before generating speech.");
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 80) throw Error("Use at most 80 narration lines.");
    const cues: SpeechTrack["cues"] = [];
    const files: string[] = [];
    let elapsed = 0;
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

/** Mix once after any renderer, ducking the existing soundtrack beneath the voice. */
export async function mixSpeech(
  video: string,
  track: SpeechTrack,
  duration: number,
  signal: AbortSignal,
) {
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
    ? `[1:a]apad,atrim=duration=${duration},asplit=2[voice][control];[0:a][control]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=300[bed];[bed][voice]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[audio]`
    : `[1:a]apad,atrim=duration=${duration},alimiter=limit=0.95[audio]`;
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
