import { afterEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Run } from "../src/shared/contracts";
import type { StyleVideo } from "../src/server/catalog/style-motion";
import { probeVideo } from "../src/server/rendering/video-probe";
import {
  previewWebmArgs,
  previewWebmProblems,
  transcodePreviewToWebm,
  verifyPreviewWebm,
  videoMimeType,
} from "../src/server/rendering/webm-video";
import {
  catalogPreviewItems,
  projectPreviewItems,
  switchCatalogReferences,
  switchProjectReferences,
} from "../src/server/rendering/preview-webm-migration";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
const probe = (
  codec: string,
  extra: Partial<{ fps: string; frames: string; audio: boolean; duration: string }> = {},
) => ({
  streams: [
    {
      codec_type: "video",
      codec_name: codec,
      width: 1280,
      height: 720,
      avg_frame_rate: extra.fps ?? "30/1",
      nb_read_frames: extra.frames ?? "90",
    },
    ...(extra.audio
      ? [{ codec_type: "audio", codec_name: "opus", width: 0, height: 0, avg_frame_rate: "0/0" }]
      : []),
  ],
  format: { duration: extra.duration ?? "3.000000" },
});

it("builds a silent VP9 WebM command with one-second keyframes for seeking", () => {
  const args = previewWebmArgs("in.mp4", "out.webm.partial", 60);
  expect(args).toEqual(expect.arrayContaining(["-an", "libvpx-vp9", "yuv420p", "webm"]));
  expect(args[args.indexOf("-g") + 1]).toBe("60");
  expect(args[args.indexOf("-crf") + 1]).toBe("18");
  expect(args.at(-1)).toBe("out.webm.partial");
  expect(videoMimeType("style-001.webm")).toBe("video/webm");
  expect(videoMimeType("renders/full.mp4")).toBe("video/mp4");
});

it("rejects a WebM preview that changes size, timing, frames, sound or picture", () => {
  const source = probe("h264");
  expect(previewWebmProblems(source, probe("vp9"), 0.99)).toEqual([]);
  expect(previewWebmProblems(source, probe("h264"), 0.99)[0]).toContain("not vp9");
  expect(previewWebmProblems(source, probe("vp9", { fps: "60/1" }), 0.99)[0]).toContain(
    "frame rate",
  );
  expect(previewWebmProblems(source, probe("vp9", { frames: "89" }), 0.99)[0]).toContain(
    "frame count",
  );
  expect(previewWebmProblems(source, probe("vp9", { duration: "3.1" }), 0.99)[0]).toContain(
    "duration",
  );
  expect(previewWebmProblems(source, probe("vp9", { audio: true }), 0.99)[0]).toContain("audio");
  expect(previewWebmProblems(source, probe("vp9"), 0.5)[0]).toContain("similarity");
  expect(previewWebmProblems(source, probe("vp9"), Number.NaN)[0]).toContain("similarity");
});

it("converts a real preview to a verified WebM and leaves the original in place", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "preview-webm-"));
  folders.push(folder);
  const source = path.join(folder, "preview.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=30:duration=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    source,
  ]);
  const target = path.join(folder, "preview.webm");
  const signal = new AbortController().signal;
  const result = await transcodePreviewToWebm(source, target, signal);
  expect(result.similarity).toBeGreaterThan(0.94);
  expect(existsSync(source)).toBe(true);
  expect(existsSync(`${target}.partial`)).toBe(false);
  const webm = await probeVideo(target, signal);
  expect(webm.streams.map((stream) => stream.codec_name)).toEqual(["vp9"]);
  expect(webm.streams[0]).toMatchObject({ width: 320, height: 180, avg_frame_rate: "30/1" });
  expect((await verifyPreviewWebm(source, target, signal)).problems).toEqual([]);
  await writeFile(target, "not a video");
  await expect(verifyPreviewWebm(source, target, signal)).rejects.toThrow();
});

it("migrates previews by job role and keeps full films and pages untouched", () => {
  const job = (id: string, kind: "preview" | "full", video: string | undefined, extra = {}) =>
    ({
      id,
      kind,
      video,
      phase: "ready",
      workspace: `/runs/p/${id}`,
      outputType: "video",
      ...extra,
    }) as never;
  const run = {
    id: "p",
    jobs: [
      job("a", "preview", "renders/preview.mp4"),
      job("b", "full", "renders/full.mp4"),
      job("c", "preview", "renders/preview.mp4", { phase: "rendering" }),
      job("d", "preview", "renders/preview.webm"),
      job("e", "preview", undefined, { outputType: "page" }),
      job("f", "full", "renders/preview.mp4"),
    ],
  } as unknown as Run;
  const items = projectPreviewItems([run]);
  expect(items.map((item) => item.key)).toEqual(["p/a"]);
  expect(items[0]).toMatchObject({
    source: "/runs/p/a/renders/preview.mp4",
    target: "/runs/p/a/renders/preview.webm",
    reference: "renders/preview.webm",
  });
  const switched = switchProjectReferences(
    run,
    new Map([
      ["p/a", "renders/preview.webm"],
      ["p/f", "x.webm"],
    ]),
  );
  expect(switched.jobs.map((item) => item.video)).toEqual([
    "renders/preview.webm",
    "renders/full.mp4",
    "renders/preview.mp4",
    "renders/preview.webm",
    undefined,
    "renders/preview.mp4",
  ]);
  const records = [
    { styleId: "style-001", video: "style-001.mp4" },
    { styleId: "style-002", video: "style-002.webm" },
  ] as StyleVideo[];
  expect(catalogPreviewItems(records, "/catalog").map((item) => item.target)).toEqual([
    "/catalog/style-001.webm",
  ]);
  expect(
    switchCatalogReferences(records, new Map([["style-001", "style-001.webm"]])).map(
      (r) => r.video,
    ),
  ).toEqual(["style-001.webm", "style-002.webm"]);
});
