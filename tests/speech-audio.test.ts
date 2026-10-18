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
      lyrics: { mode: "provided", text: "First line\nSecond line" },
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
  options.request.lyrics = { mode: "provided", text: "Changed words" };
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
      { ...options, request: { ...options.request, lyrics: { mode: "off" } } },
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

it("prepares a provided narration track while on-screen lyrics are off", async () => {
  const options = await input();
  options.request = VideoRequestSchema.parse({
    ...options.request,
    lyrics: { mode: "off" },
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
