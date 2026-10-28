import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildLanguageMedia } from "../src/server/domains/video/language-media";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { command } from "../src/server/runtime/process";
import { probeVideo } from "../src/server/rendering/video-probe";
import { validStoryboard } from "./fixtures/storyboard";
import type { Brief } from "../src/shared/agents/schemas/video";
import type { VideoGenerationJob } from "../src/shared/domains/video";
import { SubtitleProgressSchema } from "../src/shared/subtitle-progress";
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "language-media-"));
  folders.push(workspace);
  const signal = AbortSignal.timeout(60000);
  await mkdir(path.join(workspace, "renders"));
  await mkdir(path.join(workspace, "audio"));
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=160x90:r=12:d=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=110:duration=4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      path.join(workspace, "renders/full.music.mp4"),
    ],
    workspace,
    signal,
  );
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-i",
      path.join(workspace, "renders/full.music.mp4"),
      "-c",
      "copy",
      path.join(workspace, "renders/full.mp4"),
    ],
    workspace,
    signal,
  );
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:duration=2",
      path.join(workspace, "audio/primary.wav"),
    ],
    workspace,
    signal,
  );
  await writeFile(path.join(workspace, "STORYBOARD.json"), JSON.stringify(validStoryboard(4)));
  const request = VideoRequestSchema.parse({
    instructions: "Explain an example",
    duration: 4,
    languageTracks: {
      narration: [
        { language: "en", speech: { mode: "narration" } },
        { language: "zh", speech: { mode: "narration", voice: "zf_xiaobei" } },
      ],
      subtitles: ["en", "zh"],
      defaultNarration: "en",
      defaultSubtitle: "zh",
    },
  });
  const job = {
    workspace,
    kind: "full",
    duration: 4,
    video: "renders/full.mp4",
    speechTrack: {
      file: "audio/primary.wav",
      durationSeconds: 2,
      source: "narration",
      cues: [{ text: "An example", startSeconds: 0.5, endSeconds: 2.5, showSubtitles: true }],
    },
  } as VideoGenerationJob;
  return { job, request, brief: {} as Brief, signal, onEvent: vi.fn(), emit: vi.fn() };
}
it("creates language MP4/audio/subtitle files while preserving the same picture and duration", async () => {
  const input = await fixture();
  const speak = vi.fn(async (options) => {
    await command(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        path.join(options.workspace, "voice.wav"),
      ],
      options.workspace,
      options.signal,
    );
    return { file: "voice.wav", durationSeconds: 1, source: "narration" as const, cues: [] };
  });
  const result = await buildLanguageMedia(input, { translate: async () => "示例", speak });
  const subtitleProgress = input.onEvent.mock.calls
    .map(([event]) => event)
    .filter((event) => event.type === "subtitle_progress")
    .map((event) => SubtitleProgressSchema.parse(event.data.subtitleProgress));
  expect(
    subtitleProgress.map((item) => [item.language, item.completed, item.total, item.status]),
  ).toEqual([
    ["en", 0, 1, "running"],
    ["en", 1, 1, "complete"],
    ["zh", 0, 1, "running"],
    ["zh", 1, 1, "complete"],
  ]);
  expect(speak).toHaveBeenCalledTimes(1);
  expect(result.narration.map((track) => track.language)).toEqual(["en", "zh"]);
  for (const track of result.narration) {
    const video = path.join(input.job.workspace, track.video);
    const probe = await probeVideo(video, input.signal);
    expect(Number(probe.format.duration)).toBeCloseTo(4, 1);
    expect(
      Number(
        (await probeVideo(path.join(input.job.workspace, track.audio), input.signal)).format
          .duration,
      ),
    ).toBeCloseTo(4, 1);
    const frame = (file: string) =>
      command(
        "ffmpeg",
        ["-v", "error", "-i", file, "-map", "0:v", "-f", "framemd5", "-"],
        input.job.workspace,
        input.signal,
      );
    expect(await frame(video)).toBe(await frame(path.join(input.job.workspace, result.musicVideo)));
  }
  expect(await readFile(path.join(input.job.workspace, result.subtitles[0].srt), "utf8")).toContain(
    "An example",
  );
  expect(await readFile(path.join(input.job.workspace, result.subtitles[1].vtt), "utf8")).toContain(
    "00:00:00.500 --> 00:00:02.500\n示例",
  );
}, 60000);
it("retries shortening and refuses speech that cannot fit instead of changing the picture timing", async () => {
  const input = await fixture();
  const translate = vi.fn(async () => "Too long");
  const speak = vi.fn(async () => ({
    file: "not-used.wav",
    durationSeconds: 10,
    source: "narration" as const,
    cues: [],
  }));
  await expect(buildLanguageMedia(input, { translate, speak })).rejects.toThrow("does not fit");
  expect(speak).toHaveBeenCalledTimes(2);
  await expect(
    readFile(path.join(input.job.workspace, "audio/languages/tracks.json")),
  ).rejects.toThrow();
}, 60000);
it("propagates cancellation before starting work", async () => {
  const input = await fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(buildLanguageMedia({ ...input, signal: controller.signal })).rejects.toThrow();
}, 60000);

it("omits all subtitle downloads when the global subtitle switch is off", async () => {
  const input = await fixture();
  input.request.languageTracks = {
    ...input.request.languageTracks!,
    narration: input.request.languageTracks!.narration.slice(0, 1),
    showSubtitles: false,
  };
  const translate = vi.fn(async (text) => text);
  const speak = vi.fn();
  const result = await buildLanguageMedia(input, { translate, speak });
  expect(result.narration).toHaveLength(1);
  expect(result.subtitles).toEqual([]);
  expect(result.defaultSubtitle).toBe("off");
  expect(speak).not.toHaveBeenCalled();
}, 60000);
