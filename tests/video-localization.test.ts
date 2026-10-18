import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { localizeVideoRequest } from "../src/server/jobs/subworkflows/video-localization";
import type { agentTurn } from "../src/server/agents/providers";
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
const request = () =>
  VideoRequestSchema.parse({
    instructions: "An English idea",
    outputLanguage: "zh",
    provider: "claude",
    lyrics: { mode: "provided", text: "Hello, world" },
    speech: { mode: "narration", source: "provided", text: "A story", voice: "am_michael" },
  });
const workspace = async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "video-localize-"));
  folders.push(folder);
  return folder;
};
it("translates provided copy, preserves originals, caches per language and shares the provider path", async () => {
  const folder = await workspace();
  const onEvent = vi.fn();
  const generate = vi.fn(async (input) => {
    input.onEvent({
      type: "usage",
      message: "Translation complete",
      data: { invocationId: "translation", inputTokens: 12, outputTokens: 4 },
    });
    return {
      value: {
        text:
          JSON.parse(input.prompt.split("SOURCE DATA:\n")[1]).field === "lyrics"
            ? "你好，世界"
            : "一个故事",
      },
    };
  }) as unknown as typeof agentTurn;
  const source = request();
  const localized = await localizeVideoRequest(
    source,
    folder,
    new AbortController().signal,
    onEvent,
    generate,
  );
  expect(localized.instructions).toBe(source.instructions);
  expect(localized.lyrics).toEqual({ mode: "provided", text: "你好，世界" });
  expect(localized.speech).toMatchObject({ text: "一个故事" });
  expect(localized.translations?.original).toEqual({
    lyrics: "Hello, world",
    narration: "A story",
  });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(onEvent).toHaveBeenCalledTimes(2);
  expect(onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "usage",
      data: expect.objectContaining({
        videoLocalization: true,
        invocationId: "translation",
        inputTokens: 12,
        outputTokens: 4,
      }),
    }),
  );
  await localizeVideoRequest(source, folder, new AbortController().signal, vi.fn(), generate);
  await localizeVideoRequest(localized, folder, new AbortController().signal, vi.fn(), generate);
  expect(generate).toHaveBeenCalledTimes(2);
  await localizeVideoRequest(
    { ...source, provider: "codex" },
    folder,
    new AbortController().signal,
    onEvent,
    generate,
  );
  expect(generate).toHaveBeenCalledTimes(4);
});
it("keeps legacy and generated copy model-free and rejects aborted translations", async () => {
  const folder = await workspace();
  const generate = vi.fn();
  const source = VideoRequestSchema.parse({
    instructions: "An original idea",
    outputLanguage: "zh",
    lyrics: { mode: "write" },
  });
  expect(
    (await localizeVideoRequest(source, folder, new AbortController().signal, vi.fn(), generate))
      .lyrics,
  ).toEqual({ mode: "write" });
  expect(generate).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(
    localizeVideoRequest(source, folder, controller.signal, vi.fn(), generate),
  ).rejects.toThrow();
});
