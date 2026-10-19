import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/capture/openscreen", () => ({
  openScreenExportFrameRate: 60,
  startOpenScreen: vi.fn(),
  exportOpenScreen: vi.fn(async (_project: string, output: string) => {
    await writeFile(output, "native-export");
  }),
}));
import { exportOpenScreen, startOpenScreen } from "../src/server/capture/openscreen";
vi.mock("../src/server/rendering/video-probe", () => ({ probeVideo: vi.fn() }));
vi.mock("../src/server/runtime/process", () => ({ command: vi.fn() }));
import { probeVideo } from "../src/server/rendering/video-probe";
import { command } from "../src/server/runtime/process";
import type { CapturePresentationInput } from "../src/server/capture/presentation";
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
async function fixture(
  frame = { width: 1440, height: 900, left: 0, top: 0 },
  presentation?: CapturePresentationInput,
) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "website-capture-"));
  vi.stubEnv("KITEVA_CAPTURE_DESKTOP", "1");
  await writeFile(path.join(workspace, "raw.mp4"), "raw-recording");
  const stop = vi.fn(async () => ({
    event: "done" as const,
    success: true as const,
    screenVideoPath: path.join(workspace, "raw.mp4"),
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
  const capture = await startWebsiteCapture(page, workspace, controller.signal, true, presentation);
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
    vi.mocked(exportOpenScreen).mockImplementationOnce(async (project, output) => {
      const nativeProject = JSON.parse(await readFile(project, "utf8"));
      expect(nativeProject.schemaVersion).toBe(8);
      expect(nativeProject.legacyEditor).toMatchObject({
        cursorTheme: "prism-glow",
        cursorSize: 2.2,
        cursorSmoothing: 0.67,
        cursorMotionBlur: 0.2,
        cursorClickBounce: 2.5,
        cursorModel3d: true,
        cursorClickImpact: false,
        cursorAlwaysArrow: false,
        cursorAsArrow: ["text"],
      });
      expect(nativeProject.legacyEditor).not.toHaveProperty("padding");
      expect(nativeProject.legacyEditor).not.toHaveProperty("aspectRatio");
      const telemetry = JSON.parse(
        await readFile(`${nativeProject.assets[0].originalPath}.cursor.json`, "utf8"),
      );
      expect(telemetry.samples).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ cursorType: "pointer", interactionType: "click" }),
        ]),
      );
      await writeFile(output, "native-export");
    });
    f.capture.activity(true);
    f.capture.cursor(40, 60, "click", "pointer");
    f.capture.activity(false);
    const video = await f.capture.save();
    expect(video).toMatchObject({
      duration: 2.5,
      fps: 60,
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
    expect(exportOpenScreen).toHaveBeenCalledWith(
      expect.stringContaining("capture.openscreen"),
      expect.stringContaining("edited.mp4"),
      f.controller.signal,
    );
    expect(video.presentation).toMatchObject({
      cursorRendered: true,
      autoZoom: true,
      idleGapsTrimmed: true,
    });
    await writeFile(
      path.join(f.workspace, "reference-videos.json"),
      JSON.stringify([{ ...video, fps: 30 }]),
    );
    expect((await readWebsiteRecordings(f.workspace))[0].fps).toBe(30);
    await writeFile(
      path.join(f.workspace, "reference-videos.json"),
      JSON.stringify([
        {
          ...video,
          presentation: {
            ...video.presentation,
            settings: {
              ...video.presentation?.settings,
              cursorTheme: "glass-lens",
              cursorModel3d: false,
            },
          },
        },
      ]),
    );
    expect((await readWebsiteRecordings(f.workspace))[0].presentation?.settings).toMatchObject({
      cursorTheme: "glass-lens",
      cursorModel3d: false,
    });
    expect(await readdir(path.join(f.workspace, "assets"))).toHaveLength(2);
  } finally {
    await f.cleanup();
  }
});
it.each(["auto", "manual"] as const)(
  "exports %s custom focus and saves its provenance",
  async (focusMode) => {
    const presentation = {
      framing: {
        padding: 40,
        borderRadius: 24,
        shadowIntensity: 0.6,
        aspectRatio: "16:9" as const,
      },
      cursorSize: 1.8,
      cursorSmoothing: 0.4,
      cursorMotionBlur: 0,
      cursorClickBounce: 0.5,
      zoomRegions: [
        {
          startSeconds: 0.5,
          endSeconds: 1.8,
          depth: 3,
          focusX: 0.4,
          focusY: 0.6,
          ...(focusMode === "manual" ? { focusMode } : {}),
        },
      ],
    };
    const f = await fixture(undefined, presentation);
    try {
      vi.mocked(exportOpenScreen).mockImplementationOnce(async (project, output) => {
        const nativeProject = JSON.parse(await readFile(project, "utf8"));
        const editor = { ...nativeProject.legacyEditor, zoomRegions: nativeProject.zoomRanges };
        expect(editor).toMatchObject({
          padding: 40,
          borderRadius: 24,
          shadowIntensity: 0.6,
          aspectRatio: "16:9",
          cursorTheme: "prism-glow",
          cursorAlwaysArrow: false,
          cursorModel3d: true,
          cursorSize: 1.8,
          cursorSmoothing: 0.4,
          cursorMotionBlur: 0,
          cursorClickBounce: 0.5,
          zoomRegions: [
            {
              id: "agent-focus-0",
              startMs: 500,
              endMs: 1800,
              depth: 3,
              focus: { cx: 0.4, cy: 0.6 },
              focusMode,
              source: "manual",
            },
          ],
        });
        await writeFile(output, "native-export");
      });
      expect((await f.capture.save()).presentation).toMatchObject({
        autoZoom: true,
        settings: presentation,
      });
    } finally {
      await f.cleanup();
    }
  },
);

it("rejects manual zooms beyond the actual recorded duration", async () => {
  const f = await fixture(undefined, {
    zoomRegions: [{ startSeconds: 1, endSeconds: 10, depth: 2, focusX: 0.5, focusY: 0.5 }],
  });
  try {
    await expect(f.capture.save()).rejects.toThrow("extends beyond");
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
    f.capture.activity(true);
    f.capture.cursor(40, 60, "click");
    f.capture.activity(false);
    const video = await f.capture.save();
    const cursor = JSON.parse(await readFile(path.join(f.workspace, video.cursorPath), "utf8"));
    expect(cursor.events[0]).toMatchObject({ x: 88, y: 248, kind: "click" });
  } finally {
    await f.cleanup();
  }
});

it("keeps cursor coordinates in source-window space when framing changes output dimensions", async () => {
  const f = await fixture(undefined, { framing: { padding: 40, aspectRatio: "16:9" } });
  try {
    vi.mocked(probeVideo).mockResolvedValueOnce({
      format: { duration: "2.5" },
      streams: [
        {
          codec_type: "video",
          width: 1000,
          height: 625,
          avg_frame_rate: "60/1",
          codec_name: "h264",
        },
      ],
    });
    f.capture.cursor(144, 90, "click");
    const video = await f.capture.save();
    expect(video.width).toBe(1440);
    const cursor = JSON.parse(await readFile(path.join(f.workspace, video.cursorPath), "utf8"));
    expect(cursor).toMatchObject({ width: 1000, height: 625, events: [{ x: 100, y: 62.5 }] });
  } finally {
    await f.cleanup();
  }
});
