import { mkdtemp, mkdir, rm, writeFile, symlink, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/runtime/process", () => ({ command: vi.fn() }));
import { command } from "../src/server/runtime/process";
import { prepareReviewFrames, reviewFrameTimes } from "../src/server/rendering/review-frames";

afterEach(() => vi.resetAllMocks());

it("samples an early and developed state for each scene, retaining opening and closing scenes under the cap", () => {
  expect(
    reviewFrameTimes(15, {
      scenes: [
        { startSeconds: 0, endSeconds: 12 },
        { startSeconds: 12, endSeconds: 15 },
      ],
    }).map((time) => Number(time.toFixed(3))),
  ).toEqual([0.5, 7.2, 12.3, 13.8]);
  const scenes = Array.from({ length: 100 }, (_, i) => ({ startSeconds: i, endSeconds: i + 1 }));
  const times = reviewFrameTimes(100, { scenes });
  expect(times).toHaveLength(12);
  expect(times[0]).toBeCloseTo(0.1);
  expect(times.at(-1)).toBeCloseTo(99.6);
  expect(times.every((time) => time < 100)).toBe(true);
  expect(reviewFrameTimes(0.01, undefined).every((time) => time >= 0 && time < 0.01)).toBe(true);
  expect(() => reviewFrameTimes(NaN, undefined)).toThrow("Invalid review duration");
});

it("extracts timestamped PNG attachments only from the validated export and propagates decoding failures", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "review-frames-"));
  try {
    await mkdir(path.join(workspace, "renders"));
    const videoPath = path.join(workspace, "renders", "full.mp4");
    await writeFile(videoPath, "fixture");
    vi.mocked(command).mockImplementation(async (_cmd, args) => {
      await writeFile(args.at(-1)!, "PNG");
      return "";
    });
    const input = {
      workspace,
      videoPath,
      duration: 10,
      storyboard: undefined,
      signal: new AbortController().signal,
    };
    const frames = await prepareReviewFrames(input);
    expect(frames).toHaveLength(6);
    expect(command).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining([
        "-ss",
        String(frames[0].timestamp),
        "-i",
        await realpath(videoPath),
        "-frames:v",
        "1",
      ]),
      expect.any(String),
      input.signal,
      undefined,
      15000,
    );
    expect(frames.every((frame) => frame.path.endsWith(".png"))).toBe(true);
    vi.mocked(command).mockRejectedValueOnce(Error("Decode failed"));
    await expect(prepareReviewFrames(input)).rejects.toThrow("Decode failed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === "win32")(
  "rejects an export symlink escaping the job workspace before extraction",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "review-boundary-"));
    try {
      const workspace = path.join(root, "job");
      await mkdir(workspace);
      const outside = path.join(root, "outside.mp4");
      await writeFile(outside, "private");
      const link = path.join(workspace, "full.mp4");
      await symlink(outside, link);
      await expect(
        prepareReviewFrames({
          workspace,
          videoPath: link,
          duration: 10,
          storyboard: undefined,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow("must belong to this job workspace");
      expect(command).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
