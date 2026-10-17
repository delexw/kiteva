import { afterEach, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { matchNarrationLevel } from "../src/server/audio/narration-level";
import { command } from "../src/server/runtime/process";
const folders: string[] = [];
const signal = new AbortController().signal;
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function measure(file: string) {
  const result = await command(
    "ffmpeg",
    ["-hide_banner", "-i", file, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
    path.dirname(file),
    signal,
  );
  return JSON.parse(result.match(/\{[^{}]*"input_i"[^{}]*\}/)![0]) as {
    input_i: string;
    input_tp: string;
  };
}
it("matches quiet and loud sources, applies volume once, preserves timing and caps peaks", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "narration-level-"));
  folders.push(folder);
  for (const [name, gain] of [
    ["quiet", 0.1],
    ["loud", 3],
  ] as const) {
    await command(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=650:duration=3",
        "-af",
        `volume=${gain}`,
        path.join(folder, `${name}.wav`),
      ],
      folder,
      signal,
    );
    expect(
      await matchNarrationLevel(
        path.join(folder, `${name}.wav`),
        path.join(folder, `${name}-matched.wav`),
        1,
        signal,
      ),
    ).toBeCloseTo(3, 2);
  }
  const quiet = await measure(path.join(folder, "quiet-matched.wav"));
  const loud = await measure(path.join(folder, "loud-matched.wav"));
  expect(Number(quiet.input_i)).toBeCloseTo(-18, 0);
  expect(Number(quiet.input_i)).toBeCloseTo(Number(loud.input_i), 1);
  for (const volume of [0, 0.5, 2]) {
    const output = path.join(folder, `volume-${volume}.wav`);
    await matchNarrationLevel(path.join(folder, "quiet.wav"), output, volume, signal);
    const measured = await measure(output);
    if (volume === 0) expect(measured.input_i).toBe("-inf");
    else
      expect(Number(measured.input_i) - Number(quiet.input_i)).toBeCloseTo(
        20 * Math.log10(volume),
        0,
      );
    expect(
      measured.input_tp === "-inf" ? -Infinity : Number(measured.input_tp),
    ).toBeLessThanOrEqual(-1.4);
  }
  const peaks = path.join(folder, "peaks.wav");
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=if(lt(mod(t\\,0.5)\\,0.01)\\,sin(2*PI*650*t)\\,0):d=3",
      peaks,
    ],
    folder,
    signal,
  );
  await matchNarrationLevel(peaks, path.join(folder, "limited.wav"), 2, signal);
  expect(Number((await measure(path.join(folder, "limited.wav"))).input_tp)).toBeLessThanOrEqual(
    -1.4,
  );
  const silent = path.join(folder, "volume-0.wav");
  await matchNarrationLevel(silent, path.join(folder, "silent-matched.wav"), 2, signal);
  expect((await measure(path.join(folder, "silent-matched.wav"))).input_i).toBe("-inf");
  const aborted = AbortSignal.abort();
  await expect(
    matchNarrationLevel(
      path.join(folder, "quiet.wav"),
      path.join(folder, "cancelled.wav"),
      1,
      aborted,
    ),
  ).rejects.toThrow();
  await expect(
    matchNarrationLevel(
      path.join(folder, "missing.wav"),
      path.join(folder, "failed.wav"),
      1,
      signal,
    ),
  ).rejects.toThrow();
  expect((await readdir(folder)).some((file) => /cancelled|failed/.test(file))).toBe(false);
}, 20000);
