import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/capture/openscreen", () => ({ startOpenScreen: vi.fn() }));
import { startOpenScreen } from "../src/server/capture/openscreen";
vi.mock("../src/server/rendering/video-probe", () => ({ probeVideo: vi.fn() }));
vi.mock("../src/server/runtime/process", () => ({ command: vi.fn() }));
import { probeVideo } from "../src/server/rendering/video-probe";
import { command } from "../src/server/runtime/process";
import {
  startWebsiteCapture,
  websiteCaptureLimits,
  readWebsiteRecordings,
} from "../src/server/jobs/subworkflows/website-capture";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function fixture(frame = { width: 1440, height: 900, left: 0, top: 0 }) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "website-capture-"));
  vi.stubEnv("KITEVA_CAPTURE_DESKTOP", "1");
  const stop = vi.fn(async () => ({
    event: "done" as const,
    success: true as const,
    screenVideoPath: "/worker/recordings/take.mp4",
    durationMs: 2500,
  }));
  vi.mocked(startOpenScreen).mockResolvedValue({ stop });
  const page = {
    evaluate: vi.fn().mockResolvedValue(frame),
    title: async () => "Example",
    url: () => "https://example.com/",
  } as unknown as Page;
  vi.mocked(probeVideo).mockResolvedValue({
    format: { duration: "2.5" },
    streams: [
      { codec_type: "video", width: 1440, height: 900, avg_frame_rate: "30/1", codec_name: "vp9" },
    ],
  });
  vi.mocked(command).mockImplementation(async (_executable, args) => {
    if (!args.includes("null")) await writeFile(args.at(-1)!, "encoded-video");
    return "";
  });
  const controller = new AbortController();
  const capture = await startWebsiteCapture(page, workspace, controller.signal, true);
  return {
    workspace,
    capture,
    controller,
    stop,
    cleanup: () => rm(workspace, { recursive: true, force: true }),
  };
}

it("publishes only decoded footage and timed cursor metadata with a local production path", async () => {
  const f = await fixture();
  try {
    f.capture.cursor(40, 60, "click");
    const video = await f.capture.save();
    expect(video).toMatchObject({
      duration: 2.5,
      width: 1440,
      height: 900,
      silent: true,
      url: "https://example.com/",
    });
    expect(await readFile(path.join(f.workspace, video.assetPath), "utf8")).toBe("encoded-video");
    expect(
      JSON.parse(await readFile(path.join(f.workspace, video.cursorPath), "utf8")),
    ).toMatchObject({
      version: 1,
      events: [{ x: 40, y: 60, kind: "click", time: expect.any(Number) }],
    });
    expect(command).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining(["-xerror"]),
      expect.any(String),
      f.controller.signal,
    );
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(await readdir(path.join(f.workspace, "assets"))).toHaveLength(2);
  } finally {
    await f.cleanup();
  }
});
it.each(["invalid probe", "decode", "cancelled"])(
  "discards %s captures instead of publishing an asset",
  async (failure) => {
    const f = await fixture();
    try {
      if (failure === "invalid probe")
        vi.mocked(probeVideo).mockResolvedValue({ streams: [], format: { duration: "NaN" } });
      if (failure === "decode") vi.mocked(command).mockRejectedValueOnce(Error("Decode failed"));
      if (failure === "cancelled") f.controller.abort();
      await expect(f.capture.save()).rejects.toThrow();
      expect(await readdir(path.join(f.workspace, "assets"))).toEqual([]);
    } finally {
      await f.cleanup();
    }
  },
);
it("stops an overlong recording automatically and rejects its publication", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  try {
    await vi.advanceTimersByTimeAsync(websiteCaptureLimits.seconds * 1000);
    await expect(f.capture.save()).rejects.toThrow("120 seconds");
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(await readdir(path.join(f.workspace, "assets"))).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

it("does not accept arbitrary paths in a persisted recording inventory", async () => {
  const f = await fixture();
  try {
    expect(await readWebsiteRecordings(f.workspace)).toEqual([]);
    await f.capture.discard();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      path.join(f.workspace, "reference-videos.json"),
      JSON.stringify([{ assetPath: "../../private.webm" }]),
    );
    await expect(readWebsiteRecordings(f.workspace)).rejects.toThrow();
  } finally {
    await f.cleanup();
  }
});

it("maps viewport cursor events into native window pixels including chrome and display scaling", async () => {
  const f = await fixture({ width: 720, height: 450, left: 4, top: 64 });
  try {
    f.capture.cursor(40, 60, "click");
    const video = await f.capture.save();
    const cursor = JSON.parse(await readFile(path.join(f.workspace, video.cursorPath), "utf8"));
    expect(cursor.events[0]).toMatchObject({ x: 88, y: 248, kind: "click" });
  } finally {
    await f.cleanup();
  }
});
