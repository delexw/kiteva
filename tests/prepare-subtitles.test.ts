import { BriefSchema } from "../src/shared/agents/schemas/video";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VideoRequestSchema } from "../src/shared/domains/video";
import {
  prepareSubtitles,
  resolvedSubtitlesRequest,
} from "../src/server/domains/video/prepare-subtitles";
import type { agentTurn } from "../src/server/agents/providers";
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
const brief = BriefSchema.parse({
  subject: "Ideas",
  audience: "General",
  objective: "Inspire",
  facts: [],
  exactCopy: [],
  previewBeat: "An idea takes flight",
  assetDescriptions: [],
  constraints: [],
  suggestedDuration: 15,
  durationReason: "Reading time",
});
async function input(provider: "claude" | "codex" = "claude") {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "subtitles-test-"));
  folders.push(workspace);
  return {
    request: VideoRequestSchema.parse({
      instructions: "Show an idea taking flight",
      provider,
      subtitles: { mode: "write" },
    }),
    brief,
    workspace,
    signal: new AbortController().signal,
    onEvent: vi.fn(),
  };
}
it.each([
  ["claude", "claude-haiku-5-5"],
  ["codex", "gpt-6-luna"],
] as const)(
  "uses the small %s model once and reuses its checkpoint after a restart",
  async (provider, model) => {
    const options = await input(provider);
    const generate = vi.fn(async () => ({
      value: { text: "One idea takes flight" },
    })) as unknown as typeof agentTurn;
    const first = await prepareSubtitles(options, generate);
    const second = await prepareSubtitles(
      {
        ...options,
        signal: new AbortController().signal,
        brief: { ...brief, objective: "Rephrased on retry" },
      },
      generate,
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider,
        model,
        textOnly: true,
        prompt: expect.stringContaining(JSON.stringify(brief)),
        readOnly: true,
      }),
    );
    expect(first).toEqual({ text: "One idea takes flight", model });
    expect(second).toEqual(first);
    const resolved = resolvedSubtitlesRequest(options.request, first);
    expect(resolved.subtitles).toEqual({ mode: "provided", text: "One idea takes flight" });
    expect(options.request.subtitles?.mode).toBe("write");
  },
);
it("does not call a model for supplied or disabled subtitles", async () => {
  const options = await input();
  const generate = vi.fn() as unknown as typeof agentTurn;
  for (const subtitles of [
    undefined,
    { mode: "off" as const },
    { mode: "provided" as const, text: "Exact words" },
  ]) {
    const request = { ...options.request, subtitles };
    expect(await prepareSubtitles({ ...options, request }, generate)).toBeUndefined();
    expect(resolvedSubtitlesRequest(request)).toBe(request);
  }
  expect(generate).not.toHaveBeenCalled();
  expect(() => resolvedSubtitlesRequest(options.request)).toThrow("Subtitles must be prepared");
});
it("does not cache invalid, failed, or cancelled generations", async () => {
  const options = await input();
  const failed = vi.fn(async () => {
    throw Error("Model unavailable");
  }) as unknown as typeof agentTurn;
  await expect(prepareSubtitles(options, failed)).rejects.toThrow("Model unavailable");
  const invalid = vi.fn(async () => ({ value: { text: " " } })) as unknown as typeof agentTurn;
  await expect(prepareSubtitles(options, invalid)).rejects.toThrow();
  const valid = vi.fn(async () => ({
    value: { text: "Valid subtitles" },
  })) as unknown as typeof agentTurn;
  const controller = new AbortController();
  controller.abort();
  await expect(
    prepareSubtitles({ ...options, signal: controller.signal }, valid),
  ).rejects.toThrow();
  expect(valid).not.toHaveBeenCalled();
  expect(await prepareSubtitles(options, valid)).toMatchObject({ text: "Valid subtitles" });
});
