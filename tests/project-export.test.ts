import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm, truncate } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import {
  projectAvailable,
  projectFiles,
  createProjectBundle,
} from "../src/server/project-export/bundle";
import { editableTimeline, storyboardSubtitles } from "../src/server/project-export/timeline";
import type { VideoGenerationJob } from "../src/shared/domains/video";
import type { Storyboard } from "../src/shared/agents/schemas/storyboard";
import { command } from "../src/server/runtime/process";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function workspace() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "project-export-test-"));
  folders.push(folder);
  return folder;
}
const storyboard = {
  version: 3,
  title: "Example",
  durationSeconds: 2,
  scenes: [
    {
      id: "one",
      title: "Opening",
      startSeconds: 0,
      endSeconds: 1,
      purpose: "Introduce",
      visuals: [],
      assets: [],
      beats: [
        {
          startSeconds: 0,
          endSeconds: 1,
          development: "Show",
          captions: [],
          audio: { music: "", effects: "", subtitles: ["Hello"] },
          readingHoldSeconds: 1,
        },
      ],
    },
    {
      id: "two",
      title: "Result",
      startSeconds: 1,
      endSeconds: 2,
      purpose: "Finish",
      visuals: [],
      assets: [],
      beats: [
        {
          startSeconds: 1,
          endSeconds: 2,
          development: "Show",
          captions: [],
          audio: { music: "", effects: "", subtitles: ["Hello"] },
          readingHoldSeconds: 1,
        },
      ],
    },
  ],
  pacingAudit: { findings: [], justifiedHolds: [] },
  notes: [],
} satisfies Storyboard;
const job = (workspace: string): VideoGenerationJob => ({
  id: "job",
  runId: "run",
  candidateId: "candidate",
  model: "claude-opus-5-5",
  kind: "full",
  phase: "failed",
  createdAt: "2026-01-01",
  workspace,
  duration: 2,
});
it("exports a failed partial build without inventing missing media and skips symlinks and agent files", async () => {
  const root = await workspace();
  expect(await projectAvailable(root)).toBe(false);
  await mkdir(path.join(root, "assets"));
  await mkdir(path.join(root, ".agents"));
  await writeFile(path.join(root, "shot.html"), "<canvas></canvas>");
  await writeFile(path.join(root, "production.json"), "{incomplete");
  await writeFile(path.join(root, "style-context.json"), "private context");
  await writeFile(path.join(root, ".agents", "secret.txt"), "excluded");
  await symlink(path.join(root, "style-context.json"), path.join(root, "assets", "linked.json"));
  expect(await projectAvailable(root)).toBe(true);
  expect((await projectFiles(root)).map((file) => file.name)).toEqual([
    "production.json",
    "shot.html",
  ]);
  const stream = await createProjectBundle(job(root), new AbortController().signal);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const files = unzipSync(Buffer.concat(chunks));
  expect(files["source/shot.html"]).toBeDefined();
  expect(files["source/style-context.json"]).toBeUndefined();
  expect(JSON.parse(strFromU8(files["export.json"]))).toMatchObject({
    phase: "failed",
    videoAvailable: false,
  });
  expect(JSON.parse(strFromU8(files["timeline.otio"])).tracks.children[0].children ?? []).toEqual(
    [],
  );
});
it("serializes separate scene and audio tracks with relative media and OTIO time schema tags", () => {
  const timeline = JSON.parse(
    editableTimeline({
      title: "Example",
      fps: 60,
      video: { path: "media/visuals.mp4", name: "Video", duration: 2 },
      audio: [{ path: "media/music.wav", name: "Music", duration: 2 }],
      storyboard,
    }),
  );
  const tracks = timeline.tracks.children;
  expect(tracks[0].children).toHaveLength(2);
  expect(tracks[0].children[1].source_range).toMatchObject({
    OTIO_SCHEMA: "TimeRange.1",
    start_time: { OTIO_SCHEMA: "RationalTime.1", value: 60, rate: 60 },
    duration: { value: 60 },
  });
  expect(tracks[1]).toMatchObject({
    kind: "Audio",
    children: [{ media_reference: { target_url: "media/music.wav" } }],
  });
  expect(storyboardSubtitles(storyboard)).toBe("1\n00:00:00,000 --> 00:00:02,000\nHello\n");
});
it("packages real rendered visuals without embedded audio and keeps stems separate", async () => {
  const root = await workspace();
  await mkdir(path.join(root, "renders"));
  await mkdir(path.join(root, "audio"));
  const signal = new AbortController().signal;
  await command(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=64x64:r=30:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-shortest",
      path.join(root, "renders/full.mp4"),
    ],
    root,
    signal,
  );
  await command(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      path.join(root, "audio/voice.wav"),
    ],
    root,
    signal,
  );
  await writeFile(path.join(root, "STORYBOARD.json"), JSON.stringify(storyboard));
  const stream = await createProjectBundle(
    {
      ...job(root),
      speechTrack: { file: "audio/voice.wav", durationSeconds: 2, source: "narration", cues: [] },
    },
    signal,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const files = unzipSync(Buffer.concat(chunks));
  expect(files["media/visuals.mp4"]).toBeDefined();
  expect(files["media/reference-mix.wav"]).toBeDefined();
  expect(files["media/narration.wav"]).toBeDefined();
  expect(strFromU8(files["captions.srt"])).toContain("Hello");
  const timeline = JSON.parse(strFromU8(files["timeline.otio"]));
  expect(timeline.tracks.children[1].children[0].media_reference.target_url).toBe(
    "media/reference-mix.wav",
  );
  expect(timeline.tracks.children.map((track: { kind: string }) => track.kind)).toEqual([
    "Video",
    "Audio",
  ]);
  await writeFile(path.join(root, "visuals.mp4"), files["media/visuals.mp4"]);
  const probe = await command(
    "ffprobe",
    ["-v", "error", "-show_streams", "-of", "json", path.join(root, "visuals.mp4")],
    root,
    signal,
  );
  expect(
    JSON.parse(probe).streams.map((stream: { codec_type: string }) => stream.codec_type),
  ).toEqual(["video"]);
});

it("streams projects larger than the former 100 MB limit", async () => {
  const root = await workspace();
  const file = path.join(root, "footage.bin");
  await writeFile(file, "");
  await truncate(file, 100_000_001);
  const stream = await createProjectBundle(job(root), new AbortController().signal);
  let bytes = 0;
  for await (const chunk of stream) bytes += chunk.length;
  expect(bytes).toBeGreaterThan(100_000_001);
});

it("preserves the existing root-level HTML page bundle layout", async () => {
  const root = await workspace();
  await writeFile(path.join(root, "index.html"), "<h1>Example</h1>");
  const pageJob = {
    id: "page-job",
    runId: "run",
    candidateId: "candidate",
    kind: "full" as const,
    phase: "failed" as const,
    model: "claude-opus-5-5",
    createdAt: "2026-01-01",
    workspace: root,
    outputType: "page" as const,
  };
  const stream = await createProjectBundle(pageJob, new AbortController().signal);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const files = unzipSync(Buffer.concat(chunks));
  expect(files["index.html"]).toBeDefined();
  expect(files["timeline.otio"]).toBeUndefined();
});
