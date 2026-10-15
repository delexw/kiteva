import { expect, it } from "vitest";
import { mkdtemp, writeFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { assetLimits, validateAssetLimits } from "../src/shared/asset-limits";
import {
  inspectAssetLimits,
  validateProjectAssetLimits,
} from "../src/server/requests/asset-limits";
import { command } from "../src/server/runtime/process";
const files = (count: number, name: string, bytes = 1) =>
  Array.from({ length: count }, () => ({ name, bytes }));
it("enforces category counts, combined count and exact byte boundaries", () => {
  expect(() => validateAssetLimits([])).not.toThrow();
  for (const [name, count] of [
    ["image.png", 8],
    ["track.mp3", 2],
    ["notes.txt", 3],
  ] as const) {
    expect(() => validateAssetLimits(files(count, name))).not.toThrow();
    expect(() => validateAssetLimits(files(count + 1, name))).toThrow();
  }
  expect(() =>
    validateAssetLimits([
      ...files(8, "image.png"),
      ...files(2, "track.mp3"),
      ...files(2, "notes.txt"),
    ]),
  ).not.toThrow();
  expect(() =>
    validateAssetLimits([
      ...files(8, "image.png"),
      ...files(2, "track.mp3"),
      ...files(3, "notes.txt"),
    ]),
  ).toThrow("12");
  for (const name of ["image.png", "track.mp3", "notes.txt"]) {
    const limit = name.endsWith("mp3") ? assetLimits.audio.bytes : assetLimits.images.bytes;
    expect(() => validateAssetLimits(files(1, name, limit))).not.toThrow();
    expect(() => validateAssetLimits(files(1, name, limit + 1))).toThrow();
  }
  const maximum = [...files(5, "image.png", 10_000_000), ...files(2, "track.mp3", 25_000_000)];
  expect(() => validateAssetLimits(maximum)).not.toThrow();
  expect(() => validateAssetLimits([...maximum, { name: "notes.txt", bytes: 1 }])).toThrow(
    "100 MB",
  );
});
it("enforces combined pages and each audio duration", () => {
  expect(() =>
    validateAssetLimits([
      { name: "one.pdf", bytes: 1, documentPages: 15 },
      { name: "two.pdf", bytes: 1, documentPages: 15 },
    ]),
  ).not.toThrow();
  expect(() => validateAssetLimits([{ name: "one.pdf", bytes: 1, documentPages: 31 }])).toThrow(
    "30 pages",
  );
  expect(() =>
    validateAssetLimits([{ name: "song.mp3", bytes: 1, durationSeconds: 600 }]),
  ).not.toThrow();
  expect(() =>
    validateAssetLimits([{ name: "song.mp3", bytes: 1, durationSeconds: 600.01 }]),
  ).toThrow("10 minutes");
});
it("measures actual text and audio rather than trusting user metadata", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "asset-policy-"));
  try {
    const text = Buffer.from("word ".repeat(15001));
    const textPath = path.join(folder, "notes.txt");
    await writeFile(textPath, text);
    const document = {
      id: "doc",
      name: "notes.txt",
      path: textPath,
      kind: "text/plain",
      bytes: text.length,
    };
    await expect(inspectAssetLimits(document, text)).rejects.toThrow("30 pages");
    const audioPath = path.join(folder, "audio.wav");
    await command(
      "ffmpeg",
      ["-v", "error", "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-t", "1", audioPath],
      folder,
      new AbortController().signal,
    );
    const audio = {
      id: "audio",
      name: "audio.wav",
      path: audioPath,
      kind: "audio/wav",
      bytes: (await stat(audioPath)).size,
    };
    expect((await inspectAssetLimits(audio)).durationSeconds).toBeCloseTo(1);
    await expect(validateProjectAssetLimits(["audio", "audio"], () => audio)).rejects.toThrow(
      "Duplicate",
    );
    await expect(validateProjectAssetLimits(["unknown"], () => undefined)).rejects.toThrow(
      "not found",
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
