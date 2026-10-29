import { workspacePaths, workspaceFolders, legacyWorkspaceFolders } from "../../runtime/workspace";
import { mkdir, rm, rename, writeFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { Page } from "puppeteer-core";
import { command } from "../../runtime/process";
import { openScreenExportFrameRate } from "../../capture/openscreen";
import { probeVideo } from "../../rendering/video-probe";
import type { OpenScreenTrimRegion } from "../../capture/native-project";
import { collectBrowserPointerTrack } from "../../capture/browser-pointer-track";
import {
  startNativeCaptureRecording,
  type NativeCaptureRequest,
  type EditableCapture,
} from "../../capture/native-editor";
import {
  CapturePresentationSchema,
  AppliedCapturePresentationSchema,
  resolveCapturePresentation,
  type CapturePresentationInput,
} from "../../capture/presentation";

const recordingAssetDirectories = [workspaceFolders.assets, legacyWorkspaceFolders.assets]
  .map((directory) => z.util.escapeRegex(directory))
  .join("|");
const recordingAssetPrefix = `^(?:${recordingAssetDirectories})/website-video-[0-9a-f-]{36}`;

export const WebsiteRecordingSchema = z.object({
  assetPath: z.string().regex(new RegExp(`${recordingAssetPrefix}\\.webm$`)),
  cursorPath: z.string().regex(new RegExp(`${recordingAssetPrefix}\\.cursor\\.json$`)),
  url: z.string().url(),
  duration: z.number().finite().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  // Preserve previously saved 30 fps recordings while new captures use 60 fps.
  fps: z.union([z.literal(30), z.literal(openScreenExportFrameRate)]),
  silent: z.literal(true),
  presentation: z
    .object({
      engine: z.literal("OpenScreen"),
      cursorRendered: z.literal(true),
      autoZoom: z.boolean(),
      idleGapsTrimmed: z.boolean(),
      sourceDuration: z.number().positive(),
      settings: AppliedCapturePresentationSchema.optional(),
    })
    .optional(),
});
export type WebsiteRecording = z.infer<typeof WebsiteRecordingSchema>;
export const ChapterCaptureExportSchema = z.object({
  chapterId: z.string().min(1),
  recording: WebsiteRecordingSchema,
  documentReviewed: z.literal(true),
  frameReviews: z.number().int().positive(),
});
export async function readWebsiteRecordings(workspace: string) {
  const raw = await readFile(path.join(workspace, "reference-videos.json"), "utf8").catch(
    (error) => {
      if (error.code === "ENOENT") return "[]";
      throw error;
    },
  );
  return z.array(WebsiteRecordingSchema).parse(JSON.parse(raw));
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
  const settings = resolveCapturePresentation(CapturePresentationSchema.parse(presentation ?? {}));
  const id = randomUUID();
  const assets = path.join(workspace, workspacePaths(workspace).assets);
  await mkdir(assets, { recursive: true });
  const temporary = path.join(assets, `website-video-${id}.partial.webm`);
  const finalized = path.join(assets, `website-video-${id}.ready.webm`);
  const name = `website-video-${id}.webm`;
  const cursorName = `website-video-${id}.cursor.json`;
  const url = page.url();
  let nativeCursorData: Record<string, unknown> | undefined;
  const editDirectory = path.join(assets, `.website-edit-${id}`);
  let editor: Awaited<ReturnType<typeof startNativeCaptureRecording>> | undefined;
  let preparedStream: { width: number; height: number } | undefined;
  let sourceDuration = 0;
  let trims: OpenScreenTrimRegion[] = [];
  if (!desktop)
    throw Error(
      "OpenScreen needs a dedicated desktop browser; headless browser recording is not supported",
    );
  const originalTitle = await page.title();
  const viewport = page.viewport();
  if (viewport) await page.resize({ contentWidth: viewport.width, contentHeight: viewport.height });
  const pointerTrack = await collectBrowserPointerTrack(page);
  const title = `Kiteva capture ${id}`;
  await page.evaluate((value) => {
    document.title = value;
  }, title);
  try {
    await mkdir(editDirectory, { recursive: true });
    editor = await startNativeCaptureRecording(
      title,
      path.join(editDirectory, "edited.mp4"),
      signal,
      settings,
      path.join(workspace, workspacePaths(workspace).captureDiagnostics),
    );
    pointerTrack.start(editor.recordingStartedAt!);
  } catch (error) {
    await pointerTrack.stop();
    throw error;
  } finally {
    await page
      .evaluate((value) => {
        document.title = value;
      }, originalTitle.trim() || "Application demo")
      .catch(() => {});
  }
  let stopping: ReturnType<typeof editor.stopRecording> | undefined;
  let pointerTrackStopped = false;
  const stop = () =>
    (stopping ??= (async () => {
      const result = await editor!.stopRecording();
      const events = await pointerTrack.stop();
      pointerTrackStopped = true;
      await editor!.setPointerTrack(events);
      return result;
    })());
  async function finish() {
    signal.throwIfAborted();
    const result = await stop();
    const probe = await probeVideo(result.videoPath, signal);
    const sourceStream = probe.streams.find((stream) => stream.codec_type === "video");
    if (!sourceStream) throw Error("Website source recording has no video stream");
    sourceDuration = Number(probe.format.duration);
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
  async function finalize(): Promise<WebsiteRecording> {
    signal.throwIfAborted();
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
    if (!stream || !Number.isFinite(duration) || duration <= 0)
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
          ...nativeCursorData,
          nativeTrimRegions: trims,
        },
        null,
        2,
      ),
    );
    await rename(finalized, path.join(assets, name));
    await rm(temporary, { force: true });
    return {
      assetPath: `${workspacePaths(workspace).assets}/${name}`,
      cursorPath: `${workspacePaths(workspace).assets}/${cursorName}`,
      url,
      duration,
      width: stream.width,
      height: stream.height,
      fps: openScreenExportFrameRate,
      silent: true,
      presentation: {
        engine: "OpenScreen",
        cursorRendered: true,
        autoZoom: false,
        idleGapsTrimmed: trims.length > 0,
        sourceDuration,
        settings,
      },
    };
  }
  return {
    id,
    async prepare(): Promise<EditableCapture> {
      try {
        preparedStream = await finish();

        return {
          kind: "editable_capture",
          recordingId: id,
          duration: sourceDuration,
          tools: editor!.tools,
          recordingStartedAt: editor!.recordingStartedAt,
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
      const track = await editor.call({ operation: "getCursorTrack" });
      if (track.isError) throw Error("Cannot read native cursor track before export");
      nativeCursorData = z.record(z.string(), z.unknown()).parse(track.data);
      await editor.export();
      await convertExport();
      return finalize();
    },
    async close() {
      if (!pointerTrackStopped) await pointerTrack.stop().catch(() => {});
      await editor?.close();
      await rm(temporary, { force: true });
      await rm(finalized, { force: true });
    },
  };
}
