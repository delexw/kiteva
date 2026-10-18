import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
const run = vi.hoisted(() => vi.fn());
vi.mock("../src/server/runtime/process", () => ({ command: run }));
import {
  instrumentReadiness,
  renderInstrumental,
} from "../src/server/audio/instruments/fluidsynth";
import { InstrumentScoreSchema } from "../src/server/audio/instruments/score";
afterEach(() => {
  vi.unstubAllEnvs();
  run.mockReset();
});
it("retries missing engine/configuration checks before reporting setup instructions", async () => {
  run.mockRejectedValue(Error("executable unavailable"));
  const result = await instrumentReadiness(new AbortController().signal);
  expect(result.available).toBe(false);
  expect(result.message).toContain("npm run music:setup");
  expect(run).toHaveBeenCalledTimes(2);
});
it("reports render failures and removes partial artifacts rather than returning a false success", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "instrument-failure-"));
  const font = path.join(workspace, "example.sf2");
  try {
    await writeFile(font, Buffer.from("RIFFxxxxsfbk"));
    vi.stubEnv("VIDEO_INSTRUMENT_SOUNDFONT", font);
    run.mockImplementation(async (_exe, args) => {
      if (args[0] === "--version") return "FluidSynth runtime version test";
      throw Error("SoundFont parser failed");
    });
    const score = InstrumentScoreSchema.parse({
      title: "Example",
      bpm: 120,
      durationSeconds: 3,
      tracks: [
        { name: "Piano", program: 0, notes: [{ midi: 60, time: 0, duration: 1, velocity: 0.5 }] },
      ],
    });
    await expect(
      renderInstrumental(workspace, score, new AbortController().signal),
    ).rejects.toThrow("SoundFont parser failed");
    expect(await readdir(workspace)).toEqual(["example.sf2"]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
