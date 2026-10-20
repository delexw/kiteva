import { mkdir, rm, rename, writeFile, stat, readFile, copyFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { Page } from "puppeteer-core";
import { command } from "../../runtime/process";
import { startOpenScreen, openScreenExportFrameRate } from "../../capture/openscreen";
import { probeVideo } from "../../rendering/video-probe";
import type { OpenScreenTrimRegion, OpenScreenZoomRegion } from "../../capture/native-project";
import {
  createNativeCaptureEditor,
  type NativeCaptureRequest,
  type EditableCapture,
} from "../../capture/native-editor";
import {
  CapturePresentationSchema,
  AppliedCapturePresentationSchema,
  captureCursorAppearance,
  type CapturePresentationInput,
} from "../../capture/presentation";

export const websiteCaptureLimits = { seconds: 120, bytes: 150_000_000, recordings: 6 };
export const WebsiteRecordingSchema = z.object({
  assetPath: z.string().regex(/^assets\/website-video-[0-9a-f-]{36}\.webm$/),
  cursorPath: z.string().regex(/^assets\/website-video-[0-9a-f-]{36}\.cursor\.json$/),
  url: z.string().url(),
  duration: z
    .number()
    .positive()
    .max(websiteCaptureLimits.seconds + 2),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  // Preserve previously saved 30 fps recordings while new captures use 60 fps.
  fps: z.union([z.literal(30), z.literal(openScreenExportFrameRate)]),
  silent: z.literal(true),
  presentation: z
    .object({
      engine: z.literal("OpenScreen"),
      cursorRendered: z.literal(true),
      autoZoom: z.literal(true),
      idleGapsTrimmed: z.boolean(),
      sourceDuration: z.number().positive(),
      settings: AppliedCapturePresentationSchema.optional(),
    })
    .optional(),
});
export type WebsiteRecording = z.infer<typeof WebsiteRecordingSchema>;
export async function readWebsiteRecordings(workspace: string) {
  const raw = await readFile(path.join(workspace, "reference-videos.json"), "utf8").catch(
    (error) => {
      if (error.code === "ENOENT") return "[]";
      throw error;
    },
  );
  return z.array(WebsiteRecordingSchema).parse(JSON.parse(raw));
}
export interface CursorEvent {
  time: number;
  x: number;
  y: number;
  kind: "move" | "click";
  cursorType?: "arrow" | "pointer" | "text";
}

/** Owns one bounded recording of an already validated, isolated browser page. */
export async function startWebsiteCapture(
  page: Page,
  workspace: string,
  signal: AbortSignal,
  desktop = false,
  presentation?: CapturePresentationInput,
) {
  signal.throwIfAborted();
  const settings = {
    ...CapturePresentationSchema.parse(presentation ?? {}),
    ...captureCursorAppearance,
  };
  const id = randomUUID();
  const assets = path.join(workspace, "assets");
  await mkdir(assets, { recursive: true });
  const temporary = path.join(assets, `website-video-${id}.partial.webm`);
  const finalized = path.join(assets, `website-video-${id}.ready.webm`);
  const name = `website-video-${id}.webm`;
  const cursorName = `website-video-${id}.cursor.json`;
  const url = page.url();
  const events: CursorEvent[] = [];
  const editDirectory = path.join(assets, `.website-edit-${id}`);
  let editor: Awaited<ReturnType<typeof createNativeCaptureEditor>> | undefined;
  let preparedStream: { width: number; height: number } | undefined;
  let nativeZooms: OpenScreenZoomRegion[] = [];
  let sourceDuration = 0;
  let trims: OpenScreenTrimRegion[] = [];
  if (!desktop)
    throw Error(
      "OpenScreen needs a dedicated desktop browser; headless browser recording is not supported",
    );
  const originalTitle = await page.title();
  const frame = z
    .object({
      width: z.number().positive(),
      height: z.number().positive(),
      left: z.number().nonnegative(),
      top: z.number().nonnegative(),
    })
    .parse(
      await page.evaluate(() => {
        const left = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
        return {
          width: window.outerWidth,
          height: window.outerHeight,
          left,
          top: Math.max(0, window.outerHeight - window.innerHeight - left),
        };
      }),
    );
  const title = `Kiteva capture ${id}`;
  await page.evaluate((value) => {
    document.title = value;
  }, title);
  let recorder: Awaited<ReturnType<typeof startOpenScreen>>;
  try {
    recorder = await startOpenScreen(title, signal);
  } finally {
    await page
      .evaluate((value) => {
        document.title = value;
      }, originalTitle.trim() || "Application demo")
      .catch(() => {});
  }
  let failure: Error | undefined;
  let stopping: ReturnType<typeof recorder.stop> | undefined;
  const stop = () => (stopping ??= recorder.stop());
  const started = performance.now();
  const abort = () => {
    failure = Error("Website recording cancelled");
    void stop().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(() => {
    failure = Error("Website recording exceeded 120 seconds; capture shorter takes");
    void stop().catch(() => {});
  }, websiteCaptureLimits.seconds * 1000);
  timer.unref();
  async function finish() {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    const result = await stop();
    if (failure) throw failure;
    await mkdir(editDirectory, { recursive: true });
    const source = path.join(editDirectory, "source.mp4");
    await copyFile(result.screenVideoPath, source);
    const sourceStream = (await probeVideo(source, signal)).streams.find(
      (stream) => stream.codec_type === "video",
    );
    if (!sourceStream) throw Error("Website source recording has no video stream");
    sourceDuration = result.durationMs / 1000;
    if (settings.zoomRegions.some((region) => region.endSeconds > sourceDuration))
      throw Error(
        "A requested zoom extends beyond the recording; capture a longer take or correct its timing",
      );
    const samples = events.map((event) => ({
      timeMs: event.time * 1000,
      cx: (event.x + frame.left) / frame.width,
      cy: (event.y + frame.top) / frame.height,
      visible: true,
      cursorType: event.cursorType ?? "arrow",
      interactionType: event.kind,
    }));
    const lastSample = samples.at(-1);
    if (lastSample)
      samples.push({ ...lastSample, timeMs: result.durationMs, interactionType: "move" });
    await writeFile(
      `${source}.cursor.json`,
      JSON.stringify({ version: 2, provider: "none", assets: [], samples }),
    );
    const requestedZooms = settings.zoomRegions.map((region, index) => ({
      id: `agent-focus-${index}`,
      startMs: Math.round(region.startSeconds * 1000),
      endMs: Math.round(region.endSeconds * 1000),
      depth: region.depth,
      focus: { cx: region.focusX, cy: region.focusY },
      focusMode: region.focusMode,
      source: "manual" as const,
    }));
    nativeZooms = requestedZooms;
    return sourceStream;
  }
  async function convertExport() {
    const output = path.join(editDirectory, "edited.mp4");
    await command(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-i",
        output,
        "-an",
        "-r",
        String(openScreenExportFrameRate),
        "-c:v",
        "libvpx-vp9",
        "-deadline",
        "realtime",
        temporary,
      ],
      assets,
      signal,
    );
  }
  async function finalize(sourceStream: {
    width: number;
    height: number;
  }): Promise<WebsiteRecording> {
    signal.throwIfAborted();
    if (failure) throw failure;
    if ((await stat(temporary)).size > websiteCaptureLimits.bytes)
      throw Error("Recording too large");
    // FFmpeg's streaming WebM omits seek indexes and duration. Finalize the
    // container before exposing it as a seekable composition input.
    await command(
      "ffmpeg",
      ["-v", "error", "-y", "-i", temporary, "-c", "copy", finalized],
      assets,
      signal,
    );
    const probe = await probeVideo(finalized, signal);
    const stream = probe.streams.find((item) => item.codec_type === "video");
    const duration = Number(probe.format.duration);
    if (
      !stream ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > websiteCaptureLimits.seconds + 2
    )
      throw Error("Website recording has no valid video stream or duration");
    await command(
      "ffmpeg",
      ["-v", "error", "-xerror", "-i", finalized, "-f", "null", "-"],
      assets,
      signal,
    );
    await writeFile(
      path.join(assets, cursorName),
      JSON.stringify(
        {
          version: 1,
          coordinateSpace: "source-window-before-zoom",
          rendered: true,
          timeSpace: "source-recording",
          nativeTrimRegions: trims,
          width: sourceStream.width,
          height: sourceStream.height,
          events: events.map((event) => ({
            ...event,
            x: ((event.x + frame.left) * sourceStream.width) / frame.width,
            y: ((event.y + frame.top) * sourceStream.height) / frame.height,
          })),
        },
        null,
        2,
      ),
    );
    await rename(finalized, path.join(assets, name));
    await rm(temporary, { force: true });
    return {
      assetPath: `assets/${name}`,
      cursorPath: `assets/${cursorName}`,
      url,
      duration,
      width: stream.width,
      height: stream.height,
      fps: openScreenExportFrameRate,
      silent: true,
      presentation: {
        engine: "OpenScreen",
        cursorRendered: true,
        autoZoom: true,
        idleGapsTrimmed: trims.length > 0,
        sourceDuration,
        settings,
      },
    };
  }
  return {
    id,
    cursor(
      x: number,
      y: number,
      kind: CursorEvent["kind"],
      cursorType: NonNullable<CursorEvent["cursorType"]> = "arrow",
    ) {
      if (!stopping && events.length < 10000)
        events.push({ time: (performance.now() - started) / 1000, x, y, kind, cursorType });
    },
    async prepare(): Promise<EditableCapture> {
      try {
        preparedStream = await finish();
        editor = await createNativeCaptureEditor(
          path.join(editDirectory, "source.mp4"),
          path.join(editDirectory, "edited.mp4"),
          signal,
          settings,
          nativeZooms,
        );
        return {
          kind: "editable_capture",
          recordingId: id,
          duration: sourceDuration,
          tools: editor.tools,
        };
      } catch (error) {
        await rm(editDirectory, { recursive: true, force: true });
        throw error;
      }
    },
    async edit(request: NativeCaptureRequest) {
      if (!editor) throw Error("Stop the take for review before editing");
      return editor.call(request);
    },
    async export(): Promise<WebsiteRecording> {
      if (!editor || !preparedStream) throw Error("Stop the take for review before exporting");
      const document = await editor.call({ operation: "getCurrentDocument" });
      if (document.isError) throw Error("Cannot read the native capture document before export");
      // Keep provenance source-anchored; all edit timing calculations remain OpenScreen's responsibility.
      const snapshot = z
        .object({
          trimRanges: z.array(
            z.object({ id: z.string(), startSec: z.number(), endSec: z.number() }),
          ),
        })
        .parse(document.data);
      trims = snapshot.trimRanges.map((range) => ({
        id: range.id,
        startMs: range.startSec * 1000,
        endMs: range.endSec * 1000,
      }));
      await editor.export();
      await convertExport();
      return finalize(preparedStream);
    },
    async close() {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      await editor?.close();
      try {
        await stop();
      } finally {
        // Native projects keep referencing the take for later review; retain their source.
        if (!editor) await rm(editDirectory, { recursive: true, force: true });
        await rm(temporary, { force: true });
        await rm(finalized, { force: true });
      }
    },
  };
}
