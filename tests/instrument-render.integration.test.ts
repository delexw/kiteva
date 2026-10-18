import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { command } from "../src/server/runtime/process";
import {
  instrumentConfiguration,
  instrumentReadiness,
  renderInstrumental,
} from "../src/server/audio/instruments/fluidsynth";
import { InstrumentScoreSchema } from "../src/server/audio/instruments/score";
const signal = AbortSignal.timeout(60000);
const configured =
  existsSync(instrumentConfiguration().soundFont) && (await instrumentReadiness(signal)).available;
it.skipIf(!configured)(
  "renders a real sampled instrumental of the exact duration without a voice engine and cleans cancellation",
  async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "instrument-render-"));
    try {
      const score = InstrumentScoreSchema.parse({
        title: "Example",
        durationSeconds: 3,
        bpm: 120,
        tracks: [
          {
            name: "Piano",
            program: 0,
            notes: [
              { midi: 60, time: 0, duration: 0.4, velocity: 0.7 },
              { midi: 64, time: 0.5, duration: 0.4, velocity: 0.6 },
            ],
          },
          {
            name: "Bass",
            program: 32,
            notes: [{ midi: 36, time: 0, duration: 0.8, velocity: 0.7 }],
          },
          {
            name: "Drums",
            program: 0,
            percussion: true,
            notes: [{ midi: 36, time: 0, duration: 0.1, velocity: 0.6 }],
          },
        ],
      });
      const result = await renderInstrumental(workspace, score, signal);
      expect(result.durationSeconds).toBeCloseTo(3, 2);
      const wav = await readFile(path.join(workspace, result.audioFile));
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      const measurement = await command(
        "ffmpeg",
        [
          "-hide_banner",
          "-i",
          path.join(workspace, result.audioFile),
          "-af",
          "volumedetect",
          "-f",
          "null",
          "-",
        ],
        workspace,
        signal,
      );
      const peak = Number(measurement.match(/max_volume:\s*([-\d.]+) dB/)?.[1]);
      expect(peak).toBeGreaterThan(-30);
      expect(peak).toBeLessThanOrEqual(0);
      expect(await readFile(path.join(workspace, result.provenanceFile), "utf8")).toContain(
        '"soundFontSha256"',
      );
      expect(await readdir(path.dirname(path.join(workspace, result.audioFile)))).not.toContain(
        "raw.wav",
      );
      const controller = new AbortController();
      controller.abort();
      await expect(renderInstrumental(workspace, score, controller.signal)).rejects.toThrow();
      expect(await readdir(workspace)).toHaveLength(1);
      const link = path.join(workspace, "linked");
      await symlink(workspace, link, process.platform === "win32" ? "junction" : "dir");
      await expect(renderInstrumental(link, score, signal)).rejects.toThrow("not a link");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
