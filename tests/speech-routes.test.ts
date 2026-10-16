import { afterEach, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { rm } from "node:fs/promises";
import { registerSpeechRoutes } from "../src/server/audio/routes";
import { apiErrorHandler } from "../src/server/runtime/api-errors";
vi.mock("../src/server/audio/speech", () => ({
  speechReadiness: vi.fn(async () => ({ available: false, detail: "Setup required" })),
  synthesizeSpeech: vi.fn(async () => {}),
}));
vi.mock("../src/server/runtime/config", async () => {
  const path = await import("node:path");
  const os = await import("node:os");
  const { randomUUID } = await import("node:crypto");
  return {
    dataRoot: path.join(os.tmpdir(), `speech-route-${randomUUID()}`),
    safeMessage: (error: unknown) => String(error),
  };
});
import { dataRoot } from "../src/server/runtime/config";
import { synthesizeSpeech } from "../src/server/audio/speech";
afterEach(async () => {
  await rm(dataRoot, { recursive: true, force: true });
  vi.clearAllMocks();
});
it("reports readiness and rejects invalid sample controls and arbitrary file paths", async () => {
  const app = Fastify();
  app.setErrorHandler(apiErrorHandler);
  registerSpeechRoutes(app);
  try {
    expect((await app.inject({ method: "GET", url: "/api/speech/status" })).json()).toEqual({
      available: false,
      detail: "Setup required",
    });
    for (const payload of [
      { mode: "singing" },
      { mode: "narration", voice: "invented" },
      { mode: "narration", speed: 7 },
      { mode: "uploaded", assetId: "file" },
    ])
      expect(
        (await app.inject({ method: "POST", url: "/api/speech/sample", payload })).statusCode,
      ).toBe(400);
    expect(vi.mocked(synthesizeSpeech)).not.toHaveBeenCalled();
    expect(
      (await app.inject({ method: "GET", url: "/api/speech/samples/not-a-hash" })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: "GET", url: `/api/speech/samples/${"0".repeat(64)}` }))
        .statusCode,
    ).toBe(404);
  } finally {
    await app.close();
  }
});
