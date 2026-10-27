import { afterEach, expect, it, vi } from "vitest";
import { ensureSpeechGenerationReady } from "../src/client/lib/speech";
import { api } from "../src/client/lib/api";
vi.mock("../src/client/lib/api", () => ({ api: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const request = {
  subtitles: { mode: "write" },
  speech: {
    mode: "narration" as const,
    source: "subtitles" as const,
    voice: "af_heart" as const,
    text: "",
    instructions: "",
    speed: 1,
  },
};
it("does not run voice preflight for existing or disabled voice projects", async () => {
  await ensureSpeechGenerationReady({});
  await ensureSpeechGenerationReady({ ...request, subtitles: { mode: "off" } });
  expect(api).not.toHaveBeenCalled();
});
it("blocks an old worker and an unavailable runtime before project creation", async () => {
  vi.mocked(api).mockResolvedValueOnce({});
  await expect(ensureSpeechGenerationReady(request)).rejects.toThrow(/active jobs/);
  vi.mocked(api)
    .mockResolvedValueOnce({ speechSupported: true })
    .mockResolvedValueOnce({ available: false, detail: "Setup required" });
  await expect(ensureSpeechGenerationReady(request)).rejects.toThrow("Setup required");
});
it("accepts ready narration and lets uploaded vocals work without local TTS", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ speechSupported: true })
    .mockResolvedValueOnce({ available: true });
  await expect(ensureSpeechGenerationReady(request)).resolves.toBeUndefined();
  vi.mocked(api).mockResolvedValueOnce({ speechSupported: true });
  await ensureSpeechGenerationReady({
    ...request,
    speech: { mode: "uploaded", assetId: "recording" },
  });
  expect(api).toHaveBeenCalledTimes(3);
});

it("checks only the chosen speech engine", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ speechSupported: true })
    .mockResolvedValueOnce({ available: true });
  await ensureSpeechGenerationReady({
    ...request,
    speech: { ...request.speech, engine: "pocket-tts", voice: "pocket_alba" },
  });
  expect(api).toHaveBeenLastCalledWith("/api/speech/status?engine=pocket-tts&voice=pocket_alba");
});

it("blocks a worker that would drop narration timing and accepts an offset-capable worker", async () => {
  const delayed = { ...request, speech: { ...request.speech, startSeconds: 17 } };
  vi.mocked(api).mockResolvedValueOnce({ speechSupported: true });
  await expect(ensureSpeechGenerationReady(delayed)).rejects.toThrow("start-time support");
  vi.mocked(api)
    .mockResolvedValueOnce({ speechSupported: true, speechStartSupported: true })
    .mockResolvedValueOnce({ available: true });
  await expect(ensureSpeechGenerationReady(delayed)).resolves.toBeUndefined();
});

it("requires an updated worker and checks each timed item's selected voice independently", async () => {
  const items = [
    {
      id: "english",
      startSeconds: 0,
      endSeconds: 2,
      text: "Hello",
      showSubtitles: true,
      speech: {
        mode: "narration" as const,
        engine: "kokoro" as const,
        voice: "af_heart",
        speed: 1,
      },
    },
    {
      id: "chinese",
      startSeconds: 2,
      endSeconds: 4,
      text: "你好",
      showSubtitles: false,
      speech: {
        mode: "narration" as const,
        engine: "pocket-tts" as const,
        voice: "pocket_zh_xiaobei",
        language: "zh",
        speed: 1,
      },
    },
  ];
  vi.mocked(api).mockResolvedValueOnce({});
  await expect(ensureSpeechGenerationReady({ scriptItems: items })).rejects.toThrow(
    /timed script items/,
  );
  vi.mocked(api)
    .mockResolvedValueOnce({ scriptItemsSupported: true })
    .mockResolvedValueOnce({ available: true })
    .mockResolvedValueOnce({ available: true });
  await ensureSpeechGenerationReady({ scriptItems: items });
  expect(api).toHaveBeenCalledWith("/api/speech/status?engine=kokoro&voice=af_heart");
  expect(api).toHaveBeenCalledWith(
    "/api/speech/status?engine=pocket-tts&voice=pocket_zh_xiaobei&language=zh",
  );
});

it("blocks generated items on workers that only support fixed scripts", async () => {
  const scriptItems = [
    {
      id: "demo",
      source: "write" as const,
      startSeconds: 0,
      endSeconds: 10,
      text: "Explain the planned result",
      showSubtitles: true,
      speech: { mode: "off" as const },
    },
  ];
  vi.mocked(api).mockResolvedValueOnce({ scriptItemsSupported: true });
  await expect(ensureSpeechGenerationReady({ scriptItems })).rejects.toThrow(
    "generated script items",
  );
  vi.mocked(api).mockResolvedValueOnce({
    scriptItemsSupported: true,
    generatedScriptItemsSupported: true,
  });
  await expect(ensureSpeechGenerationReady({ scriptItems })).resolves.toBeUndefined();
});
