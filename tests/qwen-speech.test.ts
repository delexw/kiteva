import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  qwenVoices,
  qwenBaseVoices,
  qwenBaseVoiceGroups,
  qwenVoiceGroups,
  speechLanguage,
  speechVoiceDefinition,
  SpeechSettingsSchema,
} from "../src/shared/speech";
import { deliverySpeech } from "../src/shared/video-language";
import { ScriptItemSchema } from "../src/shared/script-items";

vi.mock("../src/server/runtime/process", () => ({ command: vi.fn(async () => "ready") }));
vi.mock("../src/server/rendering/video-probe", () => ({
  probeVideo: vi.fn(async () => ({
    streams: [{ codec_type: "audio" }],
    format: { duration: "1.5" },
  })),
}));
import { command } from "../src/server/runtime/process";
import { qwenSpeechProvider } from "../src/server/audio/providers/qwen3-tts";
import { qwenBaseSpeechProvider } from "../src/server/audio/providers/qwen3-tts-base";
import { speechProvider } from "../src/server/audio/providers";
const folders: string[] = [];
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const arch = Object.getOwnPropertyDescriptor(process, "arch")!;
beforeEach(() => {
  Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
  Object.defineProperty(process, "arch", { ...arch, value: "arm64" });
  vi.mocked(command)
    .mockReset()
    .mockImplementation(async (_executable, args) => {
      if (args.includes("--output")) await writeFile(args[args.indexOf("--output") + 1], "audio");
      if (_executable === "ffmpeg") await writeFile(args.at(-1)!, "adjusted");
      return "ready";
    });
});
afterEach(async () => {
  Object.defineProperty(process, "platform", platform);
  Object.defineProperty(process, "arch", arch);
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
it("offers nine narration profiles grouped by gender and validates saved/timed settings", () => {
  expect(qwenVoices).toHaveLength(9);
  expect(qwenVoiceGroups.map((group) => group.options.length)).toEqual([5, 4]);
  for (const voice of qwenVoices)
    for (const language of ["en", "zh"]) {
      const settings = SpeechSettingsSchema.parse({
        mode: "narration",
        engine: "qwen3-tts",
        voice: voice.id,
        language,
      });
      expect(speechLanguage(voice.id, "qwen3-tts", language)).toBe(language);
      expect(
        ScriptItemSchema.safeParse({
          id: "one",
          startSeconds: 0,
          endSeconds: 10,
          text: "Hello",
          showSubtitles: true,
          speech: settings,
        }).success,
      ).toBe(true);
    }
  for (const fields of [{ voice: "af_heart" }, { voice: "qwen_bright_female", language: "fr" }])
    expect(
      SpeechSettingsSchema.safeParse({ mode: "narration", engine: "qwen3-tts", ...fields }).success,
    ).toBe(false);
  expect(speechProvider("qwen3-tts")).toBe(qwenSpeechProvider);
  expect(
    SpeechSettingsSchema.safeParse({ mode: "narration", voice: "qwen_bright_female" }).success,
  ).toBe(false);
});
it("preserves each selected Qwen voice when following either video language", () => {
  for (const voice of qwenVoices)
    for (const outputLanguage of ["en", "zh"] as const) {
      const speech = SpeechSettingsSchema.parse({
        mode: "narration",
        engine: "qwen3-tts",
        voice: voice.id,
      });
      expect(deliverySpeech({ speech, outputLanguage })).toMatchObject({
        engine: "qwen3-tts",
        voice: voice.id,
        language: outputLanguage,
      });
      expect(
        deliverySpeech({
          speech: { ...speech, followVideoLanguage: false } as typeof speech,
          outputLanguage,
        }),
      ).toEqual({ ...speech, followVideoLanguage: false });
    }
});
it("retries readiness and retains the actual failure instead of assuming missing installation", async () => {
  vi.mocked(command).mockRejectedValue(Error("Metal initialization failed"));
  const status = await qwenSpeechProvider.readiness(
    new AbortController().signal,
    "qwen_warm_female",
    "zh",
  );
  expect(command).toHaveBeenCalledTimes(2);
  expect(status).toMatchObject({
    available: false,
    detail: expect.stringContaining("Metal initialization failed"),
  });
});
it("reports unsupported hardware without starting Python", async () => {
  Object.defineProperty(process, "arch", { ...arch, value: "x64" });
  expect((await qwenSpeechProvider.readiness(new AbortController().signal)).available).toBe(false);
  expect(command).not.toHaveBeenCalled();
});
it.each(["en", "zh"])(
  "synthesizes %s through the selected voice with shared speed validation and cleanup",
  async (language) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "qwen-speech-test-"));
    folders.push(folder);
    const file = path.join(folder, "voice.wav");
    expect(
      await qwenSpeechProvider.synthesize(
        "DeepInfer",
        file,
        "qwen_deep_male",
        1.2,
        new AbortController().signal,
        language,
      ),
    ).toBe(1.5);
    const synth = vi.mocked(command).mock.calls.find(([, args]) => args.includes("--text-file"))!;
    expect(synth[1]).toEqual(
      expect.arrayContaining(["--voice", "qwen_deep_male", "--language", language]),
    );
    expect(synth[2]).toBe(folder);
    expect(vi.mocked(command).mock.calls.find(([exe]) => exe === "ffmpeg")?.[1]).toContain(
      "atempo=1.2",
    );
    expect(await readdir(folder)).toEqual(["voice.wav"]);
  },
);
it("rejects invalid selections and pre-cancelled calls without starting work", async () => {
  const signal = new AbortController().signal;
  await expect(
    qwenSpeechProvider.synthesize("Hi", "/tmp/unused-qwen.wav", "af_heart", 1, signal, "en"),
  ).rejects.toThrow("Choose a Qwen3-TTS voice");
  const controller = new AbortController();
  controller.abort();
  await expect(
    qwenSpeechProvider.synthesize(
      "Hi",
      "/tmp/unused-qwen.wav",
      "qwen_bright_female",
      1,
      controller.signal,
      "en",
    ),
  ).rejects.toThrow();
  expect(command).not.toHaveBeenCalled();
});
it("cleans partial audio on synthesis failure", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "qwen-speech-failed-"));
  folders.push(folder);
  vi.mocked(command).mockImplementation(async (_exe, args) => {
    if (args.includes("--output")) {
      await writeFile(args[args.indexOf("--output") + 1], "partial");
      throw Error("Metal command failed");
    }
    return "ready";
  });
  await expect(
    qwenSpeechProvider.synthesize(
      "Hi",
      path.join(folder, "voice.wav"),
      "qwen_bright_female",
      1,
      new AbortController().signal,
    ),
  ).rejects.toThrow("Metal command failed");
  expect(await readdir(folder)).toEqual([]);
});

it("provides language-neutral broadcast and technical profile labels for both genders", () => {
  for (const gender of ["female", "male"]) {
    const broadcast = qwenVoices.find((voice) => voice.id === `qwen_broadcast_${gender}`)!;
    const technical = qwenVoices.find((voice) => voice.id === `qwen_technical_${gender}`)!;
    expect(broadcast).toMatchObject({ gender, language: "zh", label: "Broadcast narrator" });
    expect(broadcast.description).toContain("标准普通话");
    expect(technical).toMatchObject({ gender, language: "zh", label: "Technical explainer" });
    expect(technical.description).toContain("术语");
  }
  expect(new Set(qwenVoices.map((voice) => voice.id)).size).toBe(qwenVoices.length);
});

it("keys only Qwen audio by its current profile definition", () => {
  const settings = SpeechSettingsSchema.parse({
    mode: "narration",
    engine: "qwen3-tts",
    voice: qwenVoices[0].id,
  });
  expect(speechVoiceDefinition(settings)).toEqual({
    description: qwenVoices[0].description,
    language: qwenVoices[0].language,
  });
  expect(speechVoiceDefinition({ mode: "off" })).toBeUndefined();
  expect(speechVoiceDefinition(SpeechSettingsSchema.parse({ mode: "narration" }))).toBeUndefined();
});

it("offers separate Base reference voices for both genders without borrowing VoiceDesign voices", () => {
  expect(speechProvider("qwen3-tts-base")).toBe(qwenBaseSpeechProvider);
  expect(qwenBaseVoiceGroups.map((group) => group.options.length)).toEqual([2, 1]);
  for (const voice of qwenBaseVoices) {
    for (const language of ["en", "zh"]) {
      const settings = SpeechSettingsSchema.parse({
        mode: "narration",
        engine: "qwen3-tts-base",
        voice: voice.id,
        language,
      });
      expect(speechLanguage(voice.id, "qwen3-tts-base", language)).toBe(language);
      expect(
        ScriptItemSchema.safeParse({
          id: "item",
          startSeconds: 0,
          endSeconds: 5,
          text: "Example",
          showSubtitles: true,
          speech: settings,
        }).success,
      ).toBe(true);
      expect(deliverySpeech({ speech: settings, outputLanguage: "zh" })).toMatchObject({
        voice: voice.id,
        language: "zh",
      });
      expect(speechVoiceDefinition(settings)).toMatchObject({
        referenceText: voice.referenceText,
        revision: voice.revision,
      });
    }
    expect(
      SpeechSettingsSchema.safeParse({ mode: "narration", engine: "qwen3-tts", voice: voice.id })
        .success,
    ).toBe(false);
  }
  expect(
    SpeechSettingsSchema.safeParse({
      mode: "narration",
      engine: "qwen3-tts-base",
      voice: "qwen_bright_female",
    }).success,
  ).toBe(false);
  expect(
    SpeechSettingsSchema.safeParse({
      mode: "narration",
      engine: "qwen3-tts-base",
      voice: "qwen_base_male",
      language: "fr",
    }).success,
  ).toBe(false);
});
it.each(["en", "zh"])(
  "synthesizes Base references in %s through its own adapter",
  async (language) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "qwen-base-test-"));
    folders.push(folder);
    for (const voice of qwenBaseVoices) {
      const file = path.join(folder, voice.id + ".wav");
      expect(
        await qwenBaseSpeechProvider.synthesize(
          "Example",
          file,
          voice.id,
          1,
          new AbortController().signal,
          language,
        ),
      ).toBe(1.5);
    }
    const calls = vi.mocked(command).mock.calls.filter(([, args]) => args.includes("--text-file"));
    expect(calls).toHaveLength(qwenBaseVoices.length);
    for (const [, args, , signal] of calls) {
      expect(args[0]).toContain("qwen3-tts-base/adapter.py");
      expect(args).toEqual(expect.arrayContaining(["--language", language]));
      expect(signal).toBeInstanceOf(AbortSignal);
    }
  },
);
it("preserves Base setup diagnostics and rejects foreign references or cancelled work", async () => {
  vi.mocked(command).mockRejectedValue(Error("Missing reference recording"));
  const status = await qwenBaseSpeechProvider.readiness(new AbortController().signal);
  expect(command).toHaveBeenCalledTimes(2);
  expect(status).toMatchObject({
    available: false,
    detail: expect.stringContaining("speech:setup:qwen:base"),
  });
  vi.mocked(command).mockClear();
  await expect(
    qwenBaseSpeechProvider.synthesize(
      "Example",
      "/tmp/unused-base.wav",
      "qwen_bright_female",
      1,
      new AbortController().signal,
    ),
  ).rejects.toThrow("Choose a Qwen3-TTS voice");
  const controller = new AbortController();
  controller.abort();
  await expect(
    qwenBaseSpeechProvider.synthesize(
      "Example",
      "/tmp/unused-base.wav",
      "qwen_base_female",
      1,
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(command).not.toHaveBeenCalled();
});

it("bundles each Base reference independently of local runtime data", async () => {
  const catalog = path.resolve("src/shared/qwen-base-tts-catalog.json");
  for (const voice of qwenBaseVoices) {
    const reference = path.resolve(path.dirname(catalog), voice.referenceAudio);
    expect(reference.startsWith(path.resolve("assets/speech/qwen3-tts-base") + path.sep)).toBe(
      true,
    );
    await expect(access(reference)).resolves.toBeUndefined();
    expect(voice.referenceText.trim()).not.toBe("");
  }
});
