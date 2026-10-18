import path from "node:path";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { appRoot } from "../../runtime/config";
import { command } from "../../runtime/process";
import { probeVideo } from "../../rendering/video-probe";
import { InstrumentScoreSchema, scoreToMidi, type InstrumentScore } from "./score";

export const instrumentSoundFontDirectory = path.join(appRoot, "models/instruments/generaluser-gs");
export function instrumentConfiguration() {
  return {
    executable: process.env.VIDEO_FLUIDSYNTH_PATH || "fluidsynth",
    soundFont:
      process.env.VIDEO_INSTRUMENT_SOUNDFONT ||
      path.join(instrumentSoundFontDirectory, "GeneralUser-GS.sf2"),
  };
}
export interface InstrumentReadiness {
  available: boolean;
  message: string;
}
export interface RenderedInstrumental {
  audioFile: string;
  scoreFile: string;
  midiFile: string;
  provenanceFile: string;
  durationSeconds: number;
  sampleRate: number;
}
export async function instrumentReadiness(signal: AbortSignal): Promise<InstrumentReadiness> {
  const config = instrumentConfiguration();
  let message = "Instrument renderer unavailable";
  // Retry before reporting a missing executable/configuration, including transient IO failures.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const version = await command(
        config.executable,
        ["--version"],
        appRoot,
        signal,
        undefined,
        10000,
      );
      if (!version.includes("FluidSynth")) throw Error("Configured executable is not FluidSynth");
      const font = await open(config.soundFont, "r");
      try {
        const header = Buffer.alloc(12);
        await font.read(header, 0, 12, 0);
        if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "sfbk")
          throw Error("Configured SoundFont is not an SF2/SF3 bank");
      } finally {
        await font.close();
      }
      return {
        available: true,
        message: "Local FluidSynth instrument rendering is ready. No narration engine is required.",
      };
    } catch (error) {
      signal.throwIfAborted();
      message = `${error instanceof Error ? error.message : "Setup incomplete"}. Install FluidSynth and run npm run music:setup, or configure VIDEO_FLUIDSYNTH_PATH and VIDEO_INSTRUMENT_SOUNDFONT.`;
    }
  }
  return { available: false, message };
}

export async function renderInstrumental(
  workspace: string,
  input: InstrumentScore,
  signal: AbortSignal,
): Promise<RenderedInstrumental> {
  const score = InstrumentScoreSchema.parse(input);
  const bytes = scoreToMidi(score);
  const readiness = await instrumentReadiness(signal);
  if (!readiness.available) throw Error(readiness.message);
  if (!(await lstat(workspace)).isDirectory())
    throw Error("Instrument workspace must be a directory, not a link");
  const folder = await mkdtemp(path.join(workspace, "instrumental-"));
  const config = instrumentConfiguration();
  const midi = path.join(folder, "music.mid");
  const raw = path.join(folder, "raw.wav");
  const audio = path.join(folder, "music.wav");
  const timeout = Math.max(180000, Math.ceil(score.durationSeconds * 10000));
  try {
    await writeFile(midi, bytes, { flag: "wx" });
    await writeFile(path.join(folder, "score.json"), JSON.stringify(score, null, 2), {
      flag: "wx",
    });
    // No shell, audio device, MIDI input, user FluidSynth config, downloaded scripts or AI calls.
    await command(
      config.executable,
      [
        "-ni",
        "-q",
        "-f",
        process.platform === "win32" ? "NUL" : "/dev/null",
        "-r",
        "48000",
        "-T",
        "wav",
        "-O",
        "float",
        "-F",
        raw,
        "-o",
        "synth.cpu-cores=1",
        "-o",
        "synth.reverb.active=0",
        "-o",
        "synth.chorus.active=0",
        config.soundFont,
        midi,
      ],
      folder,
      signal,
      undefined,
      timeout,
    );
    // Normalize the bed, pad rests to the full video duration, and protect peaks.
    await command(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        raw,
        "-af",
        `apad,atrim=duration=${score.durationSeconds},loudnorm=I=-20:TP=-2:LRA=11,afade=t=out:st=${Math.max(0, score.durationSeconds - 0.03)}:d=0.03`,
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s24le",
        audio,
      ],
      folder,
      signal,
      undefined,
      timeout,
    );
    const probe = await probeVideo(audio, signal);
    const duration = Number(probe.format.duration);
    if (
      !probe.streams.some((stream) => stream.codec_type === "audio") ||
      !Number.isFinite(duration) ||
      Math.abs(duration - score.durationSeconds) > 0.01
    )
      throw Error("Instrumental output failed audio/duration verification");
    const version = await command(config.executable, ["--version"], folder, signal);
    const soundFontHash = createHash("sha256")
      .update(await readFile(config.soundFont))
      .digest("hex");
    await writeFile(
      path.join(folder, "provenance.json"),
      JSON.stringify(
        {
          engine: "FluidSynth",
          version: version.trim(),
          soundFont: path.basename(config.soundFont),
          soundFontSha256: soundFontHash,
          scoreSha256: createHash("sha256").update(JSON.stringify(score)).digest("hex"),
          sampleRate: 48000,
          durationSeconds: duration,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
    signal.throwIfAborted();
    const local = (file: string) =>
      path.relative(workspace, path.join(folder, file)).split(path.sep).join("/");
    return {
      audioFile: local("music.wav"),
      scoreFile: local("score.json"),
      midiFile: local("music.mid"),
      provenanceFile: local("provenance.json"),
      durationSeconds: duration,
      sampleRate: 48000,
    };
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(raw, { force: true });
  }
}
