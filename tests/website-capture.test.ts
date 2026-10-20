import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/capture/openscreen", () => ({
  openScreenExportFrameRate: 60,
  startOpenScreen: vi.fn(),
}));
import { startOpenScreen } from "../src/server/capture/openscreen";
vi.mock("../src/server/capture/native-editor", () => ({ createNativeCaptureEditor: vi.fn() }));
import { createNativeCaptureEditor } from "../src/server/capture/native-editor";
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
  const stop = vi.fn(async () => ({
    event: "done" as const,
    success: true as const,
    screenVideoPath: path.join(workspace, "raw.mp4"),
    durationMs: 2500,
  }));
  vi.mocked(startOpenScreen).mockResolvedValue({ stop });
  const page = {
    evaluate: vi.fn().mockResolvedValue(frame),
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
    call: vi.fn(async () => ({
      kind: "native_capture" as const,
      content: [],
      data: { trimRanges: [] as Array<{ id: string; startSec: number; endSec: number }> },
    })),
    export: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  vi.mocked(createNativeCaptureEditor).mockResolvedValue(native);
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
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const f = await fixture();
  try {
    clock.mockReturnValue(1000);
    f.capture.cursor(100, 150, "click", "pointer");
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
      data: { trimRanges: [{ id: "cut", startSec: 0.5, endSec: 0.8 }] },
    });
    const first = await f.capture.export();
    expect(first).toMatchObject({
      silent: true,
      fps: 60,
      duration: 2.5,
      presentation: { engine: "OpenScreen", autoZoom: true, idleGapsTrimmed: true },
    });
    expect((await f.capture.export()).assetPath).toBe(first.assetPath);
    expect(f.native.export).toHaveBeenCalledTimes(2);
    const cursor = JSON.parse(await readFile(path.join(f.workspace, first.cursorPath), "utf8"));
    expect(cursor).toMatchObject({
      timeSpace: "source-recording",
      nativeTrimRegions: [{ id: "cut", startMs: 500, endMs: 800 }],
      events: [{ time: 1, kind: "click" }],
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
    const f = await fixture(undefined, { cursorTheme, framing: { padding: 10 } });
    try {
      await f.capture.prepare();
      expect(createNativeCaptureEditor).toHaveBeenCalledWith(
        expect.stringContaining("source.mp4"),
        expect.stringContaining("edited.mp4"),
        expect.any(AbortSignal),
        expect.objectContaining({ cursorTheme, cursorModel3d: false, framing: { padding: 10 } }),
        [],
      );
    } finally {
      await f.capture.close();
      await f.cleanup();
    }
  },
);
it("keeps source pointer coordinates and passes only caller-requested native zooms", async () => {
  vi.spyOn(performance, "now").mockReturnValue(0);
  const f = await fixture(
    { width: 1500, height: 1000, left: 30, top: 80 },
    { zoomRegions: [{ startSeconds: 0, endSeconds: 2, depth: 4 }] },
  );
  try {
    f.capture.cursor(100, 150, "click", "text");
    await f.capture.prepare();
    expect(createNativeCaptureEditor).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(AbortSignal),
      expect.any(Object),
      [
        expect.objectContaining({
          id: "agent-focus-0",
          depth: 4,
          focusMode: "auto",
          startMs: 0,
          endMs: 2000,
        }),
      ],
    );
    const source = vi.mocked(createNativeCaptureEditor).mock.calls.at(-1)![0];
    const nativeCursor = JSON.parse(await readFile(`${source}.cursor.json`, "utf8"));
    expect(nativeCursor.samples[0]).toMatchObject({
      cx: 130 / 1500,
      cy: 230 / 1000,
      cursorType: "text",
    });
    const result = await f.capture.export();
    const cursor = JSON.parse(await readFile(path.join(f.workspace, result.cursorPath), "utf8"));
    expect(cursor.events[0]).toMatchObject({ x: (130 * 1440) / 1500, y: (230 * 900) / 1000 });
  } finally {
    await f.capture.close();
    await f.cleanup();
  }
});
it("rejects input zooms beyond the observed source duration", async () => {
  const f = await fixture(undefined, {
    zoomRegions: [{ startSeconds: 1, endSeconds: 4, depth: 2 }],
  });
  try {
    await expect(f.capture.prepare()).rejects.toThrow("extends beyond");
    expect(createNativeCaptureEditor).not.toHaveBeenCalled();
  } finally {
    await f.capture.close();
    await f.cleanup();
  }
});
it("stops an overlong take and rejects it instead of publishing footage", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  try {
    await vi.advanceTimersByTimeAsync(120000);
    await expect(f.capture.prepare()).rejects.toThrow("exceeded 120 seconds");
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
    await expect(f.capture.prepare()).rejects.toThrow("cancelled");
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
