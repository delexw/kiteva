import { afterEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Run } from "../src/shared/contracts";
import { cardClipOf, playbackVideoOf, type VideoGenerationJob } from "../src/shared/domains/video";
import { makePlaybackCopies } from "../src/server/rendering/render";
import { probeVideo, type VideoProbe } from "../src/server/rendering/video-probe";
import {
  audioChannelsFor,
  cardClipArgs,
  cardClipProblems,
  cardClipStart,
  encodedFrames,
  makeCardClip,
  makeViewingWebm,
  playbackCopyProfile,
  playbackFilter,
  playbackShape,
  viewingWebmArgs,
  viewingWebmProblems,
  type MediaSpans,
} from "../src/server/rendering/playback-copies";
import {
  playbackCopyItems,
  unusedHeavyCopies,
} from "../src/server/rendering/playback-copy-migration";

// These integration cases encode and inspect real media; the unit-test timeout is too short.
const realMediaTestTimeoutMs = 60_000;
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function folder() {
  const created = await mkdtemp(path.join(os.tmpdir(), "playback-copies-"));
  folders.push(created);
  return created;
}
function master(file: string, seconds: number, audio: boolean, size = "1600x900", rate = 60) {
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${size}:rate=${rate}:duration=${seconds}`,
    ...(audio
      ? [
          "-f",
          "lavfi",
          "-i",
          `aevalsrc=0.4*sin(2*PI*440*t)|0.4*sin(2*PI*660*t):s=48000:d=${seconds}`,
          "-c:a",
          "aac",
        ]
      : []),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
}
const sha = async (file: string) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const video = (width: number, height: number, rate: string, frames = "7200") => ({
  codec_type: "video",
  codec_name: "h264",
  width,
  height,
  avg_frame_rate: rate,
  nb_read_frames: frames,
});
const audio = (codec: string, channels: number) => ({
  codec_type: "audio",
  codec_name: codec,
  channels,
  width: 0,
  height: 0,
  avg_frame_rate: "0/0",
});
const probe = (...streams: VideoProbe["streams"]): VideoProbe => ({
  streams,
  format: { duration: "120.000000" },
});

it("targets 720p at up to 30 fps, keeps the shape and never scales or speeds up", () => {
  const shape = (width: number, height: number, rate: string) =>
    playbackShape(probe(video(width, height, rate)));
  expect(shape(2560, 1440, "60/1")).toEqual({
    width: 1280,
    height: 720,
    frameRate: "30/1",
    fps: 30,
  });
  expect(shape(1440, 2560, "60/1")).toMatchObject({ width: 720, height: 1280 });
  expect(shape(1080, 1080, "30/1")).toMatchObject({ width: 720, height: 720, frameRate: "30/1" });
  expect(shape(1920, 1080, "24000/1001")).toMatchObject({
    width: 1280,
    height: 720,
    frameRate: "24000/1001",
  });
  expect(shape(640, 360, "60/1")).toMatchObject({ width: 640, height: 360, frameRate: "30/1" });
  const small = probe(video(640, 360, "30/1"));
  expect(playbackFilter(small, playbackShape(small))).toBe("null");
  const big = probe(video(2560, 1440, "60/1"));
  expect(playbackFilter(big, playbackShape(big))).toBe("fps=30/1,scale=1280:720:flags=lanczos");
});

it("keeps stereo Opus for the viewing copy and makes a silent card clip", () => {
  const view = viewingWebmArgs("full.mp4", "view.webm.partial", "fps=30/1", 30, 2);
  expect(view).toEqual(
    expect.arrayContaining(["0:a:0", "libopus", "128k", "-ac", "2", "libvpx-vp9", "33"]),
  );
  expect(view.slice(view.indexOf("-progress"), view.indexOf("-progress") + 2)).toEqual([
    "-progress",
    "pipe:1",
  ]);
  expect(view[view.indexOf("-g") + 1]).toBe("30");
  expect(viewingWebmArgs("full.mp4", "v.webm", "null", 30, 0)).toContain("-an");
  const card = cardClipArgs("full.mp4", "card.webm.partial", 36.5, 3, "null", 30);
  expect(card.slice(card.indexOf("-ss"), card.indexOf("-ss") + 4)).toEqual([
    "-ss",
    "36.500",
    "-t",
    "3.000",
  ]);
  expect(card).toContain("-an");
  expect(card).not.toContain("libopus");
  expect(audioChannelsFor(probe(video(1, 1, "30/1"), audio("aac", 6)))).toBe(2);
  expect(audioChannelsFor(probe(video(1, 1, "30/1"), audio("aac", 1)))).toBe(1);
  expect(audioChannelsFor(probe(video(1, 1, "30/1")))).toBe(0);
  expect(encodedFrames("frame=10\nout_time_us=1500000\nprogress=continue\nframe=12\n")).toBe(12);
  expect(encodedFrames("frame=40\nframe=32\n")).toBe(40);
  expect(encodedFrames("out_time_us=1753500\n")).toBeUndefined();
});

it("starts the card clip inside the scene a third of the way through", () => {
  const scenes = [
    { startSeconds: 0, endSeconds: 12.8 },
    { startSeconds: 12.8, endSeconds: 24.6 },
    { startSeconds: 24.6, endSeconds: 38.6 },
  ];
  expect(cardClipStart(90, scenes)).toBe(24.6 + 0.5);
  expect(cardClipStart(90, [{ startSeconds: 26, endSeconds: 28 }])).toBe(27);
  expect(cardClipStart(10, [])).toBe(3);
  expect(cardClipStart(4, [])).toBe(1);
  expect(cardClipStart(2, [])).toBe(0);
});

it("rejects a viewing copy that changes the shape, frames, sound or timing", () => {
  const source = probe(video(2560, 1440, "60/1"), audio("aac", 2));
  const good = probe({ ...video(1280, 720, "30/1", "3600"), codec_name: "vp9" }, audio("opus", 2));
  const sourceSpans: MediaSpans = {
    video: { start: 0, end: 120 },
    audio: { start: 0, end: 120.01 },
  };
  const spans: MediaSpans = { video: { start: 0, end: 120.001 }, audio: { start: 0, end: 120.02 } };
  const check = (webm = good, timing = spans, similarity = 0.98) =>
    viewingWebmProblems(source, webm, similarity, sourceSpans, timing);
  expect(check()).toEqual([]);
  const vp9 = (width: number, height: number, frames: string, rate = "30/1") => ({
    ...video(width, height, rate, frames),
    codec_name: "vp9",
  });
  expect(check(probe(vp9(2560, 1440, "3600"), audio("opus", 2)))[0]).toContain("size");
  expect(check(probe(vp9(1280, 720, "7200", "60/1"), audio("opus", 2)))[0]).toContain("frame rate");
  expect(check(probe(vp9(1280, 720, "3601"), audio("opus", 2)))).toEqual([]);
  expect(check(probe(vp9(1280, 720, "3590"), audio("opus", 2)))[0]).toContain("frame count");
  expect(check(probe(vp9(1280, 720, "3600")))[0]).toContain("0 audio tracks");
  expect(check(probe(vp9(1280, 720, "3600"), audio("vorbis", 2)))[0]).toContain("not opus");
  expect(check(probe(vp9(1280, 720, "3600"), audio("opus", 1)))[0]).toContain("1 channels");
  expect(check(good, { ...spans, audio: { start: 0.05, end: 120.06 } })[0]).toContain("audio runs");
  expect(check(good, { ...spans, video: { start: 0, end: 119.9 } })[0]).toContain("video runs");
  expect(check(good, spans, 0.5)[0]).toContain("similarity");
  const silent = probe(video(2560, 1440, "60/1"));
  expect(
    viewingWebmProblems(
      silent,
      probe(vp9(1280, 720, "3600"), audio("opus", 2)),
      0.98,
      sourceSpans,
      spans,
    )[0],
  ).toContain("the MP4 does not have");
  const clip = probe(vp9(1280, 720, "90"));
  expect(cardClipProblems(source, clip, 0.98, { start: 0, end: 3 }, 3)).toEqual([]);
  expect(cardClipProblems(source, clip, 0.98, { start: 0, end: 2.5 }, 3)[0]).toContain("lasts");
  expect(
    cardClipProblems(
      source,
      probe(vp9(1280, 720, "90"), audio("opus", 2)),
      0.98,
      { start: 0, end: 3 },
      3,
    )[0],
  ).toContain("audio");
});

it(
  "makes a real 720p30 viewing copy with stereo sound and leaves the master untouched",
  async () => {
    const workspace = await folder();
    const source = path.join(workspace, "full.mp4");
    master(source, 2, true);
    const before = await sha(source);
    const target = path.join(workspace, "view-720p30.webm");
    const signal = new AbortController().signal;
    const progress: number[] = [];
    const result = await makeViewingWebm(source, target, signal, (fraction) =>
      progress.push(fraction),
    );
    expect(result.similarity).toBeGreaterThan(0.94);
    expect(progress.length).toBeGreaterThan(0);
    expect(
      progress.every((value, index) => value <= 1 && value >= (progress[index - 1] ?? 0)),
    ).toBe(true);
    expect(await sha(source)).toBe(before);
    expect(existsSync(`${target}.partial`)).toBe(false);
    const webm = await probeVideo(target, signal);
    expect(webm.streams.map((stream) => stream.codec_name)).toEqual(["vp9", "opus"]);
    expect(webm.streams[0]).toMatchObject({ width: 1280, height: 720, avg_frame_rate: "30/1" });
    expect(webm.streams[1].channels).toBe(2);
  },
  realMediaTestTimeoutMs,
);

it(
  "keeps a silent film silent and cuts a silent three-second card clip",
  async () => {
    const workspace = await folder();
    const source = path.join(workspace, "full.mp4");
    master(source, 5, false, "1280x720", 30);
    const signal = new AbortController().signal;
    await makeViewingWebm(source, path.join(workspace, "view.webm"), signal);
    expect(
      (await probeVideo(path.join(workspace, "view.webm"), signal)).streams.map(
        (s) => s.codec_name,
      ),
    ).toEqual(["vp9"]);
    const card = path.join(workspace, "card.webm");
    await makeCardClip(source, card, 1, signal);
    const clip = await probeVideo(card, signal);
    expect(clip.streams.map((stream) => stream.codec_name)).toEqual(["vp9"]);
    expect(Number(clip.format.duration)).toBeCloseTo(3, 1);
  },
  realMediaTestTimeoutMs,
);

it(
  "stops cleanly when cancelled and leaves no partial file",
  async () => {
    const workspace = await folder();
    const source = path.join(workspace, "full.mp4");
    master(source, 8, true, "1920x1080", 30);
    const controller = new AbortController();
    await expect(
      makeViewingWebm(source, path.join(workspace, "view.webm"), controller.signal, () =>
        controller.abort(),
      ),
    ).rejects.toThrow("Cancelled");
    expect(await readdir(workspace)).toEqual([".runtime", "full.mp4"]);
  },
  realMediaTestTimeoutMs,
);

it(
  "records ready copies, or keeps the MP4 playing when a copy fails or stops",
  async () => {
    const workspace = await folder();
    await mkdir(path.join(workspace, "renders"));
    master(path.join(workspace, "renders", "full.mp4"), 4, true, "1280x720", 30);
    const job = {
      id: "full",
      kind: "full",
      video: "renders/full.mp4",
      duration: 4,
      workspace,
    } as VideoGenerationJob;
    const events: string[] = [];
    const emit = (type: string, message: string) => events.push(`${type}: ${message}`);
    const made = await makePlaybackCopies(job, new AbortController().signal, emit);
    expect(made).toMatchObject({
      viewingVideo: "renders/view-720p30.webm",
      cardClip: "renders/card-3s.webm",
      playbackCopies: { profile: playbackCopyProfile, status: "ready" },
    });
    expect(events.some((event) => event.startsWith("render_progress: 720p viewing copy"))).toBe(
      true,
    );
    await writeFile(path.join(workspace, "renders", "broken.mp4"), "not a video");
    const broken = await makePlaybackCopies(
      { ...job, video: "renders/broken.mp4" },
      new AbortController().signal,
      emit,
    );
    expect(broken).toMatchObject({ playbackCopies: { status: "failed" } });
    expect(broken.viewingVideo).toBeUndefined();
    expect(events.at(-1)).toMatch(
      /^warning: The 720p viewing copy isn't ready [\s\S]*the MP4 plays instead\.$/,
    );
    const stopped = new AbortController();
    stopped.abort();
    expect(await makePlaybackCopies(job, stopped.signal, emit)).toMatchObject({
      playbackCopies: { status: "failed", error: "Stopped before it finished" },
    });
  },
  realMediaTestTimeoutMs,
);

it("chooses the viewing copy and card clip with MP4 fallbacks", () => {
  expect(
    playbackVideoOf({ video: "renders/full.mp4", viewingVideo: "renders/view-720p30.webm" }),
  ).toBe("renders/view-720p30.webm");
  expect(playbackVideoOf({ video: "renders/full.mp4" })).toBe("renders/full.mp4");
  expect(cardClipOf({ kind: "full", cardClip: "renders/card-3s.webm" })).toBe(
    "renders/card-3s.webm",
  );
  expect(cardClipOf({ kind: "preview", cardClip: "renders/card-3s.webm" })).toBeUndefined();
  expect(cardClipOf({ kind: "full" })).toBeUndefined();
});

it("lists finished films that still need copies and the old 2K copies they replace", () => {
  const job = (id: string, extra = {}) =>
    ({
      id,
      kind: "full",
      video: "renders/full.mp4",
      phase: "ready",
      duration: 90,
      workspace: `/runs/p/${id}`,
      outputType: "video",
      ...extra,
    }) as never;
  const ready = { profile: playbackCopyProfile, status: "ready", updatedAt: "" };
  const run = {
    id: "p",
    jobs: [
      job("a"),
      job("b", { playbackCopies: ready }),
      job("c", { playbackCopies: { ...ready, status: "failed" } }),
      job("d", { playbackCopies: { ...ready, profile: "older" } }),
      job("e", { playbackCopies: { ...ready, status: "making" } }),
      job("f", { phase: "rendering" }),
      job("g", { kind: "preview" }),
      job("h", { outputType: "page", video: undefined }),
    ],
  } as unknown as Run;
  expect(playbackCopyItems([run]).map((item) => item.jobId)).toEqual(["a", "c", "d"]);
  expect(playbackCopyItems([run])[0]).toEqual({
    runId: "p",
    jobId: "a",
    master: "/runs/p/a/renders/full.mp4",
    duration: 90,
  });
  expect(unusedHeavyCopies([run])).toEqual(["/runs/p/b/renders/full.webm"]);
});
