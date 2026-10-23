import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const workerMock = vi.hoisted(() => ({ create: vi.fn(), synthesize: vi.fn(), stop: vi.fn() }));
vi.mock("../src/server/audio/providers/pocket-worker", () => ({
  PocketTtsWorker: class {
    constructor(...args: unknown[]) {
      workerMock.create(...args);
    }
    synthesize(...args: unknown[]) {
      return workerMock.synthesize(...args);
    }
    stop() {
      workerMock.stop();
    }
  },
}));
vi.mock("../src/server/runtime/process", () => ({ command: vi.fn(async () => "ready") }));
vi.mock("../src/server/rendering/video-probe", () => ({
  probeVideo: vi.fn(async () => ({
    streams: [{ codec_type: "audio" }],
    format: { duration: "0.5" },
  })),
}));
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
  access: vi.fn(async () => {}),
  stat: vi.fn(async () => ({ mtimeMs: 1 })),
}));
import { command } from "../src/server/runtime/process";
import { access } from "node:fs/promises";
import { probeVideo } from "../src/server/rendering/video-probe";
import {
  pocketTtsSpeechProvider,
  stopPocketTtsWorker,
} from "../src/server/audio/providers/pocket-tts";
import { speechProvider } from "../src/server/audio/providers";
import { kokoroSpeechProvider } from "../src/server/audio/providers/kokoro";
import { speechModelDirectory } from "../src/server/audio/providers/paths";
import { pocketVoices } from "../src/shared/speech";
import { pocketZhVoiceReference } from "../src/server/audio/providers/pocket-tts-zh";
import { appRoot } from "../src/server/runtime/config";
const folders: string[] = [];
beforeEach(() => {
  workerMock.synthesize.mockImplementation(async ({ output }: { output: string }) => {
    await writeFile(output, "natural audio");
  });
});
afterEach(async () => {
  stopPocketTtsWorker();
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
  vi.clearAllMocks();
  vi.mocked(command).mockReset().mockResolvedValue("ready");
  vi.mocked(access).mockReset().mockResolvedValue();
});
it("owns explicit model directories for each engine outside generated project data", () => {
  expect(speechModelDirectory("kokoro")).toBe(path.join(appRoot, "models/kokoro"));
  expect(speechModelDirectory("pocket-tts")).toBe(path.join(appRoot, "models/pocket-tts"));
});
it("retries readiness and checks app-owned model files instead of personal cache files", async () => {
  vi.mocked(command).mockRejectedValueOnce(Error("Transient failure"));
  expect((await kokoroSpeechProvider.readiness(new AbortController().signal)).available).toBe(true);
  expect(command).toHaveBeenCalledTimes(2);
  expect(vi.mocked(access).mock.calls.map(([file]) => String(file))).toContain(
    path.join(speechModelDirectory("kokoro"), "kokoro-v1.0.onnx"),
  );
  vi.mocked(access).mockRejectedValue(Error("Missing model"));
  expect((await kokoroSpeechProvider.readiness(new AbortController().signal)).available).toBe(
    false,
  );
  expect(command).toHaveBeenCalledTimes(4);
});
it("passes model paths to the Python API and publishes validated audio with temporary files removed", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "speech-provider-"));
  folders.push(folder);
  vi.mocked(command).mockImplementation(async (_executable, args) => {
    const output = args.indexOf("--output");
    if (output >= 0) await writeFile(args[output + 1], "test audio");
    return "ready";
  });
  expect(
    await kokoroSpeechProvider.synthesize(
      "Hello",
      path.join(folder, "voice.wav"),
      "bf_emma",
      1,
      new AbortController().signal,
    ),
  ).toBe(0.5);
  const args = vi.mocked(command).mock.calls[1][1];
  expect(args).toContain(path.join(speechModelDirectory("kokoro"), "kokoro-v1.0.onnx"));
  expect(args.slice(args.indexOf("--language"), args.indexOf("--language") + 2)).toEqual([
    "--language",
    "en-gb",
  ]);
  expect(probeVideo).toHaveBeenCalled();
  expect(await readdir(folder)).toEqual(["voice.wav"]);
});

it("does not start synthesis after cancellation or publish failed output", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "speech-provider-"));
  folders.push(folder);
  const controller = new AbortController();
  controller.abort();
  await expect(
    kokoroSpeechProvider.synthesize(
      "Hello",
      path.join(folder, "voice.wav"),
      "af_heart",
      1,
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(command).not.toHaveBeenCalled();
  vi.mocked(command).mockImplementation(async (_executable, args) => {
    const output = args.indexOf("--output");
    if (output >= 0) {
      await writeFile(args[output + 1], "partial output");
      throw Error("Synthesis failed");
    }
    return "ready";
  });
  await expect(
    kokoroSpeechProvider.synthesize(
      "Hello",
      path.join(folder, "voice.wav"),
      "af_heart",
      1,
      new AbortController().signal,
    ),
  ).rejects.toThrow("Voice synthesis failed");
  expect(await readdir(folder)).toEqual([]);
});

it("dispatches explicit engines without changing the legacy Kokoro default", () => {
  expect(speechProvider()).toBe(kokoroSpeechProvider);
  expect(speechProvider("pocket-tts")).toBe(pocketTtsSpeechProvider);
});
it("checks Pocket models independently and retries failed readiness", async () => {
  vi.mocked(command).mockRejectedValue(Error("Missing Pocket models"));
  expect((await pocketTtsSpeechProvider.readiness(new AbortController().signal)).available).toBe(
    false,
  );
  expect(command).toHaveBeenCalledTimes(2);
  expect(vi.mocked(command).mock.calls[0][1]).toEqual(
    expect.arrayContaining(["--models", speechModelDirectory("pocket-tts"), "--check"]),
  );
});
it("uses Pocket's own voice and local model path, with pitch-preserving tempo and cleanup", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "speech-pocket-"));
  folders.push(folder);
  vi.mocked(command).mockImplementation(async (executable, args) => {
    if (executable === "ffmpeg") await writeFile(args.at(-1)!, "adjusted audio");
    const output = args.indexOf("--output");
    if (output >= 0) await writeFile(args[output + 1], "natural audio");
    return "ready";
  });
  expect(
    await pocketTtsSpeechProvider.synthesize(
      "A test",
      path.join(folder, "voice.wav"),
      "pocket_alba",
      1.2,
      new AbortController().signal,
    ),
  ).toBe(0.5);
  expect(workerMock.create).toHaveBeenCalledWith(
    expect.any(String),
    expect.arrayContaining(["--serve", "--models", speechModelDirectory("pocket-tts")]),
    expect.any(String),
  );
  expect(workerMock.synthesize).toHaveBeenCalledWith(
    expect.objectContaining({ voice: "alba" }),
    expect.any(AbortSignal),
  );
  expect(command).toHaveBeenCalledWith(
    "ffmpeg",
    expect.arrayContaining(["atempo=1.2"]),
    folder,
    expect.any(AbortSignal),
  );
  expect(await readdir(folder)).toEqual(["voice.wav"]);
});
it("rejects foreign Pocket voices before touching the runtime", async () => {
  await expect(
    pocketTtsSpeechProvider.synthesize(
      "Hello",
      "/tmp/unused.wav",
      "af_heart",
      1,
      new AbortController().signal,
    ),
  ).rejects.toThrow("Pocket TTS voice");
  expect(command).not.toHaveBeenCalled();
});

it.each(["missing stream", "invalid duration"])(
  "never publishes speech with %s",
  async (failure) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "invalid-speech-"));
    folders.push(folder);
    vi.mocked(command).mockImplementation(async (_executable, args) => {
      const output = args.indexOf("--output");
      if (output >= 0) await writeFile(args[output + 1], "invalid audio");
      return "ready";
    });
    vi.mocked(probeVideo).mockResolvedValueOnce({
      streams:
        failure === "missing stream"
          ? []
          : [
              {
                codec_type: "audio",
                width: 0,
                height: 0,
                avg_frame_rate: "0/0",
                codec_name: "pcm_s16le",
              },
            ],
      format: { duration: failure === "invalid duration" ? "NaN" : "1" },
    });
    await expect(
      kokoroSpeechProvider.synthesize(
        "Hello",
        path.join(folder, "voice.wav"),
        "af_heart",
        1,
        new AbortController().signal,
      ),
    ).rejects.toThrow("no valid audio");
    expect(await readdir(folder)).toEqual([]);
  },
);

it("routes non-English speech to its own model and language readiness", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "speech-italian-"));
  folders.push(folder);
  vi.mocked(command).mockImplementation(async (_executable, args) => {
    const output = args.indexOf("--output");
    if (output >= 0) await writeFile(args[output + 1], "Italian audio");
    return "ready";
  });
  await pocketTtsSpeechProvider.synthesize(
    "Una storia",
    path.join(folder, "voice.wav"),
    "pocket_giovanni",
    1,
    new AbortController().signal,
  );
  for (const [, args] of vi.mocked(command).mock.calls)
    expect(args).toEqual(expect.arrayContaining(["--language", "italian"]));
  expect(workerMock.create).toHaveBeenCalledWith(
    expect.any(String),
    expect.arrayContaining(["--language", "italian"]),
    expect.any(String),
  );
  expect(workerMock.synthesize).toHaveBeenCalledWith(
    expect.objectContaining({ voice: "giovanni" }),
    expect.any(AbortSignal),
  );
});

it("uses the explicit speaking language without restricting voices to their reference language", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "speech-cross-language-"));
  folders.push(folder);
  vi.mocked(command).mockImplementation(async (_executable, args) => {
    const output = args.indexOf("--output");
    if (output >= 0) await writeFile(args[output + 1], "French Alba");
    return "ready";
  });
  await pocketTtsSpeechProvider.synthesize(
    "Une idée",
    path.join(folder, "voice.wav"),
    "pocket_alba",
    1,
    new AbortController().signal,
    "fr",
  );
  for (const [, args] of vi.mocked(command).mock.calls)
    expect(args).toEqual(expect.arrayContaining(["--language", "french"]));
  expect(workerMock.create).toHaveBeenCalledWith(
    expect.any(String),
    expect.arrayContaining(["--language", "french"]),
    expect.any(String),
  );
  expect(workerMock.synthesize).toHaveBeenCalledWith(
    expect.objectContaining({ voice: "alba" }),
    expect.any(AbortSignal),
  );
});

it.each(pocketVoices.filter((voice) => voice.language === "zh"))(
  "routes Mandarin $label through its own reference and Chinese checkpoint",
  async (voice) => {
    const signal = new AbortController().signal;
    expect((await pocketTtsSpeechProvider.readiness(signal, voice.id)).available).toBe(true);
    expect(vi.mocked(command).mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("pocket-tts-zh.py"),
        expect.stringContaining("models/pocket-tts-zh"),
        "--check",
        "--reference",
        pocketZhVoiceReference(voice.id),
      ]),
    );
    const folder = await mkdtemp(path.join(os.tmpdir(), "mandarin-provider-"));
    folders.push(folder);
    vi.mocked(command).mockImplementation(async (_executable, args) => {
      const output = args.indexOf("--output");
      if (output >= 0) await writeFile(args[output + 1], "test audio");
      return "ready";
    });
    expect(
      await pocketTtsSpeechProvider.synthesize(
        "你好，世界。",
        path.join(folder, "voice.wav"),
        voice.id,
        1,
        signal,
      ),
    ).toBe(0.5);
    expect(
      vi.mocked(command).mock.calls.find(([, args]) => args.includes("--output"))?.[1],
    ).toEqual(expect.arrayContaining(["--reference", pocketZhVoiceReference(voice.id)]));
    expect(
      vi
        .mocked(command)
        .mock.calls.some(([, args]) => args.includes("--voice") && args.includes("zh_xiaobei")),
    ).toBe(false);
  },
);

it("rejects unknown or non-Mandarin references before using paths", () => {
  for (const voice of ["pocket_alba", "pocket_zh_../../outside", "pocket_zh_unknown"])
    expect(() => pocketZhVoiceReference(voice)).toThrow(
      "Choose a Chinese Pocket TTS reference voice",
    );
});
