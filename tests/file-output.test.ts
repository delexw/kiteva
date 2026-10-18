import { mkdtemp, writeFile, appendFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it } from "vitest";
import { watchCommandOutput } from "../src/server/runtime/file-output";
let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "output-watch-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});
it("forwards bytes while running and drains final bytes in order", async () => {
  const file = path.join(folder, "stdout");
  await writeFile(file, "");
  const chunks: Buffer[] = [];
  let arrived: () => void = () => {};
  const first = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const close = watchCommandOutput(file, (data) => {
    chunks.push(data);
    arrived();
  });
  const text = Buffer.from("中文 output");
  try {
    await appendFile(file, text.subarray(0, 1));
    await first;
    await appendFile(file, text.subarray(1));
  } finally {
    await close();
  }
  expect(Buffer.concat(chunks)).toEqual(text);
});
it("reports capture truncation instead of silently losing bytes", async () => {
  const file = path.join(folder, "stdout");
  await writeFile(file, "");
  let arrived: () => void = () => {};
  const first = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const close = watchCommandOutput(file, () => arrived());
  await appendFile(file, "full output");
  await first;
  await writeFile(file, "");
  await expect(close()).rejects.toThrow("truncated");
});
