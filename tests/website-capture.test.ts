import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/capture/openscreen", () => ({
  openScreenExportFrameRate: 60,
}));
vi.mock("../src/server/capture/native-editor", () => ({ startNativeCaptureRecording: vi.fn() }));
import { startNativeCaptureRecording } from "../src/server/capture/native-editor";
vi.mock("../src/server/rendering/video-probe", () => ({ probeVideo: vi.fn() }));
vi.mock("../src/server/runtime/process", () => ({ command: vi.fn() }));
import { probeVideo } from "../src/server/rendering/video-probe";
import { command } from "../src/server/runtime/process";
import {
  captureCursorThemes,
  type CapturePresentationInput,
} from "../src/server/capture/presentation";
import {
  startWebsiteCapture,
  readWebsiteRecordings,
} from "../src/server/jobs/subworkflows/website-capture";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function fixture(
  frame = { width: 1440, height: 900, left: 0, top: 0 },
  presentation?: CapturePresentationInput,
  title = "Example",
) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "website-capture-"));
  vi.stubEnv("KITEVA_CAPTURE_DESKTOP", "1");
  await writeFile(path.join(workspace, "raw.mp4"), "raw-recording");
  const nativeCursor = {
    version: 2,
    provider: "native",
    assets: [],
    samples: [{ timeMs: 1000, cx: 0.25, cy: 0.75, visible: true }],
  };
  await writeFile(path.join(workspace, "raw.cursor.json"), JSON.stringify(nativeCursor));
  const stop = vi.fn(async () => ({
    projectId: "native-take",
    videoPath: path.join(workspace, "raw.mp4"),
  }));
  const page = {
    evaluate: vi.fn().mockResolvedValue(frame),
    setViewport: vi.fn(),
    viewport: () => ({ width: frame.width, height: frame.height }),
    resize: vi.fn(),
    exposeFunction: vi.fn(),
    evaluateOnNewDocument: vi.fn().mockResolvedValue({ identifier: "pointer-listener" }),
    removeScriptToEvaluateOnNewDocument: vi.fn(),
    removeExposedFunction: vi.fn(),
    frames: () => [],
    title: async () => title,
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
  const native = {
    tools: [],
    recordingStartedAt: 1000,
    stopRecording: stop,
    setPointerTrack: vi.fn(async () => {}),
    call: vi.fn(async () => ({
      kind: "native_capture" as const,
      content: [],
      data: {
        ...nativeCursor,
        trimRanges: [] as Array<{ id: string; startSec: number; endSec: number }>,
      },
    })),
    export: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  vi.mocked(startNativeCaptureRecording).mockResolvedValue(native);
  const capture = await startWebsiteCapture(page, workspace, controller.signal, true, presentation);
  return {
    workspace,
    page,
    native,
    capture,
    controller,
    stop,
    cleanup: () => rm(workspace, { recursive: true, force: true }),
  };
}

it("stops for native review without selecting cuts or exporting, then re-exports the same asset", async () => {
  const f = await fixture();
  try {
    const take = await f.capture.prepare();
    expect(take).toMatchObject({ kind: "editable_capture", recordingId: f.capture.id });
    expect(f.native.export).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
    await f.capture.edit({ operation: "getFrames", arguments: { count: 2 } });
    expect(f.native.call).toHaveBeenLastCalledWith({
      operation: "getFrames",
      arguments: { count: 2 },
    });
    f.native.call.mockResolvedValue({
      kind: "native_capture",
      content: [],
      data: {
        version: 2,
        provider: "native",
        assets: [],
        samples: [{ timeMs: 1000, cx: 0.25, cy: 0.75, visible: true }],
        trimRanges: [{ id: "cut", startSec: 0.5, endSec: 0.8 }],
      },
    });
    const first = await f.capture.export();
    expect(first).toMatchObject({
      silent: true,
      fps: 60,
      duration: 2.5,
      presentation: { engine: "OpenScreen", autoZoom: false, idleGapsTrimmed: true },
    });
    expect((await f.capture.export()).assetPath).toBe(first.assetPath);
    expect(f.native.export).toHaveBeenCalledTimes(2);
    const cursor = JSON.parse(await readFile(path.join(f.workspace, first.cursorPath), "utf8"));
    expect(cursor).toMatchObject({
      nativeTrimRegions: [{ id: "cut", startMs: 500, endMs: 800 }],
      samples: [{ timeMs: 1000, cx: 0.25, cy: 0.75, visible: true }],
    });
    expect(command).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining(["-xerror", "null"]),
      expect.any(String),
      expect.any(AbortSignal),
    );
    await f.capture.close();
    expect(f.native.close).toHaveBeenCalledOnce();
  } finally {
    await f.cleanup();
  }
});
it.each(captureCursorThemes)(
  "passes %s presentation through native settings with 3D disabled",
  async (cursorTheme) => {
    const f = await fixture(undefined, { cursorTheme, framing: { shadowIntensity: 0.5 } });
    try {
      await f.capture.prepare();
      expect(startNativeCaptureRecording).toHaveBeenCalledWith(
        expect.stringContaining("Kiteva capture"),
        expect.stringContaining("edited.mp4"),
        expect.any(AbortSignal),
        expect.objectContaining({
          cursorTheme,
          cursorModel3d: false,
          cursorClickBounce: 2,
          cursorClickImpact: false,
          framing: {
            shadowIntensity: 0.5,
            padding: 24,
            borderRadius: 0,
            backgroundBlur: 1,
            aspectRatio: "16:9",
          },
        }),
        path.join(f.workspace, "capture-diagnostics"),
      );
    } finally {
      await f.capture.close();
      await f.cleanup();
    }
  },
);
it("uses the native recording project and records its clock for the model", async () => {
  const f = await fixture();
  try {
    const take = await f.capture.prepare();
    expect(take.recordingStartedAt).toBe(1000);
    expect(f.stop).toHaveBeenCalledOnce();
    expect(startNativeCaptureRecording).toHaveBeenCalledWith(
      expect.stringContaining("Kiteva capture"),
      expect.stringContaining("edited.mp4"),
      expect.any(AbortSignal),
      expect.any(Object),
      path.join(f.workspace, "capture-diagnostics"),
    );
    const result = await f.capture.export();
    const cursor = JSON.parse(await readFile(path.join(f.workspace, result.cursorPath), "utf8"));
    expect(cursor.samples).toEqual([{ timeMs: 1000, cx: 0.25, cy: 0.75, visible: true }]);
    expect(cursor).not.toHaveProperty("events");
  } finally {
    await f.capture.close();
    await f.cleanup();
  }
});
it("keeps a take active beyond the old wall-clock cap and exports when explicitly stopped", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  try {
    await vi.advanceTimersByTimeAsync(600000);
    expect(f.stop).not.toHaveBeenCalled();
    f.stop.mockResolvedValueOnce({
      projectId: "native-take",
      videoPath: path.join(f.workspace, "raw.mp4"),
    });
    vi.mocked(probeVideo).mockResolvedValue({
      format: { duration: "600" },
      streams: [
        {
          codec_type: "video",
          width: 1440,
          height: 900,
          avg_frame_rate: "60/1",
          codec_name: "vp9",
        },
      ],
    });
    await expect(f.capture.prepare()).resolves.toMatchObject({
      kind: "editable_capture",
      duration: 600,
    });
    await expect(f.capture.export()).resolves.toMatchObject({ duration: 600 });
    expect(f.stop).toHaveBeenCalledOnce();
  } finally {
    await f.capture.close();
    await f.cleanup();
  }
});
it("cancels capture and refuses further preparation", async () => {
  const f = await fixture();
  try {
    f.controller.abort();
    await expect(f.capture.prepare()).rejects.toThrow(/abort/i);
  } finally {
    await f.capture.close();
    await f.cleanup();
  }
});
it("does not publish undecodable native exports", async () => {
  const f = await fixture();
  try {
    await f.capture.prepare();
    vi.mocked(command).mockImplementation(async (_exe, args) => {
      if (args.includes("-xerror")) throw Error("decode error");
      await writeFile(args.at(-1)!, "encoded");
      return "";
    });
    await expect(f.capture.export()).rejects.toThrow("decode error");
    await expect(
      readFile(path.join(f.workspace, `assets/website-video-${f.capture.id}.webm`)),
    ).rejects.toThrow();
  } finally {
    await f.capture.close();
    await f.cleanup();
  }
});
it("rejects arbitrary paths in persisted recording inventory", async () => {
  const f = await fixture();
  try {
    await writeFile(
      path.join(f.workspace, "reference-videos.json"),
      '[{"assetPath":"../../outside.webm"}]',
    );
    await expect(readWebsiteRecordings(f.workspace)).rejects.toThrow();
  } finally {
    await f.capture.close();
    await f.cleanup();
  }
});

it("keeps an untitled app window from showing its address in the recording title bar", async () => {
  const f = await fixture(undefined, undefined, "");
  try {
    expect(f.page.evaluate).toHaveBeenLastCalledWith(expect.any(Function), "Application demo");
  } finally {
    await f.capture.close();
    await f.cleanup();
  }
});

it("matches the native window to the prepared viewport before recording without resetting emulation", async () => {
  const f = await fixture({ width: 1920, height: 1080, left: 0, top: 0 });
  try {
    expect(f.page.resize).toHaveBeenCalledWith({ contentWidth: 1920, contentHeight: 1080 });
    expect(f.page.setViewport).not.toHaveBeenCalled();
    expect(vi.mocked(f.page.resize).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startNativeCaptureRecording).mock.invocationCallOrder[0],
    );
  } finally {
    await f.capture.close();
    await f.cleanup();
  }
});
