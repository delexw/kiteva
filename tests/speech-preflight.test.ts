import { afterEach, expect, it, vi } from "vitest";
import { ensureSpeechGenerationReady } from "../src/client/lib/speech";
import { api } from "../src/client/lib/api";
vi.mock("../src/client/lib/api", () => ({ api: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const request = {
  lyrics: { mode: "write" },
  speech: {
    mode: "narration" as const,
    source: "lyrics" as const,
    voice: "af_heart" as const,
    text: "",
    instructions: "",
    speed: 1,
  },
};
it("does not run voice preflight for existing or disabled voice projects", async () => {
  await ensureSpeechGenerationReady({});
  await ensureSpeechGenerationReady({ ...request, lyrics: { mode: "off" } });
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
