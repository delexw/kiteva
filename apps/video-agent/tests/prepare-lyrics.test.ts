import { BriefSchema } from "../src/shared/agents/schemas/video";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { prepareLyrics, resolvedLyricsRequest } from "../src/server/domains/video/prepare-lyrics";
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "lyrics-test-"));
  folders.push(workspace);
  return {
    request: VideoRequestSchema.parse({
      instructions: "Show an idea taking flight",
      provider,
      lyrics: { mode: "write" },
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
    const first = await prepareLyrics(options, generate);
    const second = await prepareLyrics(
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
        promptContext: expect.objectContaining({ brief }),
        readOnly: true,
        prompt: expect.stringContaining("Read the full instructions, duration and brief"),
      }),
    );
    expect(first).toEqual({ text: "One idea takes flight", model });
    expect(second).toEqual(first);
    const resolved = resolvedLyricsRequest(options.request, first);
    expect(resolved.lyrics).toEqual({ mode: "provided", text: "One idea takes flight" });
    expect(options.request.lyrics?.mode).toBe("write");
  },
);
it("does not call a model for supplied or disabled lyrics", async () => {
  const options = await input();
  const generate = vi.fn() as unknown as typeof agentTurn;
  for (const lyrics of [
    undefined,
    { mode: "off" as const },
    { mode: "provided" as const, text: "Exact words" },
  ]) {
    const request = { ...options.request, lyrics };
    expect(await prepareLyrics({ ...options, request }, generate)).toBeUndefined();
    expect(resolvedLyricsRequest(request)).toBe(request);
  }
  expect(generate).not.toHaveBeenCalled();
  expect(() => resolvedLyricsRequest(options.request)).toThrow("Lyrics must be prepared");
});
it("does not cache invalid, failed, or cancelled generations", async () => {
  const options = await input();
  const failed = vi.fn(async () => {
    throw Error("Model unavailable");
  }) as unknown as typeof agentTurn;
  await expect(prepareLyrics(options, failed)).rejects.toThrow("Model unavailable");
  const invalid = vi.fn(async () => ({ value: { text: " " } })) as unknown as typeof agentTurn;
  await expect(prepareLyrics(options, invalid)).rejects.toThrow();
  const valid = vi.fn(async () => ({
    value: { text: "Valid lyrics" },
  })) as unknown as typeof agentTurn;
  const controller = new AbortController();
  controller.abort();
  await expect(prepareLyrics({ ...options, signal: controller.signal }, valid)).rejects.toThrow();
  expect(valid).not.toHaveBeenCalled();
  expect(await prepareLyrics(options, valid)).toMatchObject({ text: "Valid lyrics" });
});
