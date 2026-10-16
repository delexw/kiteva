import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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
}));
import { command } from "../src/server/runtime/process";
import { access } from "node:fs/promises";
import { probeVideo } from "../src/server/rendering/video-probe";
import { kokoroSpeechProvider } from "../src/server/audio/providers/kokoro";
import { speechModelDirectory } from "../src/server/audio/providers/paths";
import { appRoot } from "../src/server/runtime/config";
const folders: string[] = [];
afterEach(async () => {
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
