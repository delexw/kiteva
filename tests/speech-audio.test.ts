import { SpeechSettingsSchema } from "../src/shared/speech";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prepareSpeech, mixSpeech } from "../src/server/audio/speech";
import { command } from "../src/server/runtime/process";
import { probeVideo } from "../src/server/rendering/video-probe";
import { BriefSchema } from "../src/shared/agents/schemas/video";
import { VideoRequestSchema } from "../src/shared/domains/video";
import type { agentTurn } from "../src/server/agents/providers";
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
const signal = () => new AbortController().signal;
it("rejects narration outside the chosen timeline instead of silently trimming it", async () => {
  await expect(
    mixSpeech(
      "/unused.mp4",
      { file: "audio/voice.wav", durationSeconds: 125, source: "narration", cues: [] },
      120,
      signal(),
    ),
  ).rejects.toThrow("Audio was not truncated");
});
async function input() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "speech-test-"));
  folders.push(workspace);
  return {
    workspace,
    duration: 4,
    signal: signal(),
    onEvent: vi.fn(),
    emit: vi.fn(),
    request: VideoRequestSchema.parse({
      instructions: "Introduce an idea",
      subtitles: { mode: "provided", text: "First line\nSecond line" },
      speech: { mode: "narration" },
    }),
    brief: BriefSchema.parse({
      subject: "Idea",
      audience: "Creators",
      objective: "Explore",
      facts: [],
      exactCopy: [],
      previewBeat: "An idea emerges",
      assetDescriptions: [],
      constraints: [],
      suggestedDuration: 4,
      durationReason: "Short",
    }),
  };
}
async function tone(file: string, seconds = 0.25) {
  await command(
    "ffmpeg",
    ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=650:duration=${seconds}`, file],
    path.dirname(file),
    signal(),
  );
}
it("measures line cues, caches successful speech across reloads, and regenerates changed scripts", async () => {
  const options = await input();
  const synthesize = vi.fn(async (_text: string, file: string) => {
    await tone(file);
    return 0.25;
  });
  const first = await prepareSpeech(options, { synthesize });
  expect(first?.cues).toEqual([
    { text: "First line", startSeconds: 0, endSeconds: 0.25 },
    { text: "Second line", startSeconds: 0.25, endSeconds: 0.5 },
  ]);
  expect(await prepareSpeech({ ...options, signal: signal() }, { synthesize })).toEqual(first);
  expect(synthesize).toHaveBeenCalledTimes(2);
  options.request.subtitles = { mode: "provided", text: "Changed words" };
  await prepareSpeech(options, { synthesize });
  expect(synthesize).toHaveBeenCalledTimes(3);
  expect(
    JSON.parse(
      await readFile(path.join(options.workspace, first!.file.replace(".wav", ".json")), "utf8"),
    ).cues,
  ).toHaveLength(2);
});
it("does not generate when disabled, does not cache cancelled work, and rejects overlong speech", async () => {
  const options = await input();
  const synthesize = vi.fn(async (_text: string, file: string) => {
    await tone(file);
    return 3;
  });
  expect(
    await prepareSpeech(
      { ...options, request: { ...options.request, subtitles: { mode: "off" } } },
      { synthesize },
    ),
  ).toBeUndefined();
  expect(synthesize).not.toHaveBeenCalled();
  await expect(prepareSpeech(options, { synthesize })).rejects.toThrow(/exceeds/);
  const controller = new AbortController();
  controller.abort();
  await expect(
    prepareSpeech({ ...options, signal: controller.signal }, { synthesize }),
  ).rejects.toThrow();
  await expect(prepareSpeech(options, { synthesize })).rejects.toThrow(/exceeds/);
  expect(synthesize).toHaveBeenCalledTimes(4);
});

it("reuses a written script after cancellation and publishes voice only after completion", async () => {
  const options = await input();
  options.request.speech = {
    mode: "narration",
    source: "write",
    voice: "af_heart",
    speed: 1,
    text: "",
    instructions: "Warm and concise",
  };
  const generate = vi.fn(async () => ({
    value: { text: "An original introduction" },
  })) as unknown as typeof agentTurn;
  const controller = new AbortController();
  const interrupted = vi.fn(async (_text: string, file: string) => {
    await tone(file);
    controller.abort();
    return 0.25;
  });
  await expect(
    prepareSpeech({ ...options, signal: controller.signal }, { generate, synthesize: interrupted }),
  ).rejects.toThrow();
  const synthesize = vi.fn(async (_text: string, file: string) => {
    await tone(file);
    return 0.25;
  });
  const resumed = await prepareSpeech(options, { generate, synthesize });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(resumed?.cues[0].text).toBe("An original introduction");
  expect(synthesize).toHaveBeenCalledTimes(1);
  if (options.request.speech?.mode !== "narration") throw Error("Expected narration");
  options.request.speech.volume = 1.5;
  const adjusted = await prepareSpeech(options, { generate, synthesize });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(adjusted?.file).not.toBe(resumed?.file);
  expect(adjusted?.cues).toEqual(resumed?.cues);
});
it("uses only selected attached recordings and mixes speech onto silent and musical films", async () => {
  const options = await input();
  await mkdir(path.join(options.workspace, "assets"));
  await mkdir(path.join(options.workspace, "renders"));
  await tone(path.join(options.workspace, "assets/voice.wav"), 1);
  options.request.speech = { mode: "uploaded", assetId: "voice" };
  await writeFile(
    path.join(options.workspace, "style-context.json"),
    JSON.stringify({ assetInputs: [{ id: "voice", path: "assets/voice.wav" }] }),
  );
  const track = (await prepareSpeech(options))!;
  expect(track.source).toBe("uploaded");
  expect(track.cues).toEqual([]);
  for (const music of [false, true]) {
    const video = path.join(options.workspace, "renders", music ? "music.mp4" : "silent.mp4");
    await command(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=96x54:r=30:d=4",
        ...(music ? ["-f", "lavfi", "-i", "sine=frequency=220:duration=4"] : []),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        video,
      ],
      options.workspace,
      signal(),
    );
    await mixSpeech(video, track, 4, signal());
    const probe = await probeVideo(video, signal());
    expect(probe.streams.some((stream) => stream.codec_type === "audio")).toBe(true);
    expect(Number(probe.format.duration)).toBeCloseTo(4, 1);
    await command(
      "ffmpeg",
      ["-v", "error", "-i", video, "-f", "null", "-"],
      options.workspace,
      signal(),
    );
  }
  options.request.speech = { mode: "uploaded", assetId: "missing" };
  await expect(prepareSpeech(options)).rejects.toThrow(/not attached/);
}, 60000);

it("passes the selected Pocket engine through narration preparation and reuses its completed track", async () => {
  const options = await input();
  options.request.speech = {
    mode: "narration",
    engine: "pocket-tts",
    voice: "pocket_alba",
    speed: 1,
    source: "provided",
    text: "An example narration.",
    instructions: "",
  };
  const synthesize = vi.fn(async (_text: string, file: string) => {
    await tone(file);
    return 0.25;
  });
  const track = await prepareSpeech(options, { synthesize });
  expect(synthesize).toHaveBeenCalledWith(
    "An example narration.",
    expect.any(String),
    "pocket_alba",
    1,
    options.signal,
    "pocket-tts",
    undefined,
    1,
  );
  expect(await prepareSpeech(options, { synthesize })).toEqual(track);
  expect(synthesize).toHaveBeenCalledTimes(1);
  if (options.request.speech?.mode !== "narration") throw Error("Expected narration");
  options.request.speech.volume = 1.5;
  const louder = await prepareSpeech(options, { synthesize });
  expect(louder?.file).not.toBe(track?.file);
  expect(synthesize).toHaveBeenLastCalledWith(
    "An example narration.",
    expect.any(String),
    "pocket_alba",
    1,
    options.signal,
    "pocket-tts",
    undefined,
    1.5,
  );
  expect(louder?.cues).toEqual(track?.cues);
});

it("prepares a provided narration track while on-screen subtitles are off", async () => {
  const options = await input();
  options.request = VideoRequestSchema.parse({
    ...options.request,
    subtitles: { mode: "off" },
    speech: { mode: "narration", source: "provided", text: "An independent spoken story" },
  });
  const synthesize = vi.fn(async (_text: string, file: string) => {
    await tone(file);
    return 0.25;
  });
  const track = await prepareSpeech(options, { synthesize });
  expect(track?.cues).toEqual([
    { text: "An independent spoken story", startSeconds: 0, endSeconds: 0.25 },
  ]);
  expect(synthesize).toHaveBeenCalledTimes(1);
});

it("adds real opening silence and shifts caption cues with the narration start time", async () => {
  const options = await input();
  options.request.speech = SpeechSettingsSchema.parse({ mode: "narration", startSeconds: 1 });
  const synthesize = vi.fn(async (_text: string, file: string) => {
    await tone(file);
    return 0.25;
  });
  const track = (await prepareSpeech(options, { synthesize }))!;
  expect(track.cues).toEqual([
    { text: "First line", startSeconds: 1, endSeconds: 1.25 },
    { text: "Second line", startSeconds: 1.25, endSeconds: 1.5 },
  ]);
  expect(track.durationSeconds).toBe(1.5);
  const pcm = path.join(options.workspace, "speech.pcm");
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-i",
      path.join(options.workspace, track.file),
      "-f",
      "s16le",
      "-ar",
      "8000",
      "-ac",
      "1",
      pcm,
    ],
    options.workspace,
    signal(),
  );
  const bytes = await readFile(pcm);
  expect(bytes.subarray(0, 14400).every((byte) => byte === 0)).toBe(true);
  expect(bytes.subarray(16000, 19200).some((byte) => byte !== 0)).toBe(true);
  expect(await prepareSpeech(options, { synthesize })).toEqual(track);
  expect(synthesize).toHaveBeenCalledTimes(2);
  options.request.speech = SpeechSettingsSchema.parse({ mode: "narration", startSeconds: 4 });
  await expect(prepareSpeech(options, { synthesize })).rejects.toThrow("start before");
});

it("renders timed voices with independent providers, measured cues and real silent gaps", async () => {
  const options = await input();
  options.request.scriptItems = [
    {
      id: "opener",
      startSeconds: 0,
      endSeconds: 1,
      text: "Silent opening caption",
      showSubtitles: true,
      speech: { mode: "off" },
    },
    {
      id: "english",
      startSeconds: 1,
      endSeconds: 1.5,
      text: "Hello",
      showSubtitles: false,
      speech: { mode: "narration", engine: "kokoro", voice: "af_heart", speed: 1, volume: 0.7 },
    },
    {
      id: "chinese",
      startSeconds: 2,
      endSeconds: 2.5,
      text: "你好",
      showSubtitles: true,
      speech: {
        mode: "narration",
        engine: "pocket-tts",
        voice: "pocket_zh_xiaobei",
        language: "zh",
        speed: 1.1,
      },
    },
  ];
  const synthesize = vi.fn(async (_text: string, file: string) => {
    await tone(file, 0.2);
    return 0.2;
  });
  const track = await prepareSpeech(options, { synthesize });
  expect(synthesize).toHaveBeenCalledTimes(2);
  expect(synthesize.mock.calls[0].slice(0, 1)).toEqual(["Hello"]);
  expect(synthesize).toHaveBeenNthCalledWith(
    1,
    "Hello",
    expect.any(String),
    "af_heart",
    1,
    expect.any(AbortSignal),
    "kokoro",
    undefined,
    0.7,
  );
  expect(synthesize).toHaveBeenNthCalledWith(
    2,
    "你好",
    expect.any(String),
    "pocket_zh_xiaobei",
    1.1,
    expect.any(AbortSignal),
    "pocket-tts",
    "zh",
    1,
  );
  expect(track?.cues).toEqual([
    {
      text: "Hello",
      startSeconds: 1,
      endSeconds: 1.2,
      scriptItemId: "english",
      showSubtitles: false,
    },
    {
      text: "你好",
      startSeconds: 2,
      endSeconds: 2.2,
      scriptItemId: "chinese",
      showSubtitles: true,
    },
  ]);
  const raw = path.join(options.workspace, "voice.pcm");
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-i",
      path.join(options.workspace, track!.file),
      "-ar",
      "8000",
      "-ac",
      "1",
      "-f",
      "s16le",
      raw,
    ],
    options.workspace,
    options.signal,
  );
  const samples = await readFile(raw);
  const energy = (start: number, end: number) => {
    let total = 0,
      count = 0;
    for (let n = Math.floor(start * 8000); n < Math.floor(end * 8000); n++) {
      total += Math.abs(samples.readInt16LE(n * 2));
      count++;
    }
    return total / count;
  };
  expect(energy(0.2, 0.8)).toBeLessThan(1);
  expect(energy(1.02, 1.15)).toBeGreaterThan(500);
  expect(energy(1.4, 1.8)).toBeLessThan(1);
  expect(energy(2.02, 2.15)).toBeGreaterThan(500);
  await prepareSpeech(options, { synthesize });
  expect(synthesize).toHaveBeenCalledTimes(2);
  options.request.scriptItems![2].text = "Changed only this item.";
  await prepareSpeech(options, { synthesize });
  expect(synthesize).toHaveBeenCalledTimes(3);
});
it("refuses a spoken item that exceeds its own window instead of truncating it", async () => {
  const options = await input();
  options.request.scriptItems = [
    {
      id: "short",
      startSeconds: 1,
      endSeconds: 1.5,
      text: "Too much speech",
      showSubtitles: true,
      speech: { mode: "narration", voice: "af_heart", speed: 1 },
    },
  ];
  const synthesize = vi.fn(async (_text: string, file: string) => {
    await tone(file, 0.6);
    return 0.6;
  });
  await expect(prepareSpeech(options, { synthesize })).rejects.toThrow(/exceeds the 0.5s/);
});
it("does not synthesize a subtitle-only timeline even when legacy narration remains stored", async () => {
  const options = await input();
  const synthesize = vi.fn();
  options.request.scriptItems = [
    {
      id: "silent",
      startSeconds: 0,
      endSeconds: 4,
      text: "Read this without speech",
      showSubtitles: true,
      speech: { mode: "off" },
    },
  ];
  expect(await prepareSpeech(options, { synthesize })).toBeUndefined();
  expect(synthesize).not.toHaveBeenCalled();
});

it("regenerates edited Qwen voice audio while reusing the written script", async () => {
  const { qwenVoices } = await import("../src/shared/speech");
  const voice = qwenVoices[0];
  const original = voice.description;
  const options = await input();
  options.request.speech = SpeechSettingsSchema.parse({
    mode: "narration",
    engine: "qwen3-tts",
    voice: voice.id,
    source: "write",
  });
  const generate = vi.fn(async () => ({
    value: { text: "An original introduction" },
  })) as unknown as typeof agentTurn;
  const synthesize = vi.fn(async (_text: string, file: string) => {
    await tone(file);
    return 0.25;
  });
  try {
    const first = await prepareSpeech(options, { generate, synthesize });
    voice.description = original + " Steady broadcast diction.";
    const second = await prepareSpeech(options, { generate, synthesize });
    expect(second?.file).not.toBe(first?.file);
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledTimes(1);
  } finally {
    voice.description = original;
  }
});
