import { createWriteStream } from "node:fs";
import { mkdir, rm, rename, writeFile, stat, readFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { Page } from "puppeteer-core";
import { command } from "../../runtime/process";
import { probeVideo } from "../../rendering/video-probe";

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
  fps: z.literal(30),
  silent: z.literal(true),
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
export type CursorEvent = { time: number; x: number; y: number; kind: "move" | "click" };

/** Owns one bounded recording of an already validated, isolated browser page. */
export async function startWebsiteCapture(page: Page, workspace: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const id = randomUUID();
  const assets = path.join(workspace, "assets");
  await mkdir(assets, { recursive: true });
  const temporary = path.join(assets, `website-video-${id}.partial.webm`);
  const finalized = path.join(assets, `website-video-${id}.ready.webm`);
  const name = `website-video-${id}.webm`;
  const cursorName = `website-video-${id}.cursor.json`;
  const url = page.url();
  const events: CursorEvent[] = [];
  // The installed Chromium supports the SDK's screencast API. The newer record()
  // API requires a newer Chrome protocol and is not supported by all bundled browsers.
  const recorder = await page.screencast({ fps: 30, format: "webm" });
  let bytes = 0;
  let failure: Error | undefined;
  let stopping: Promise<void> | undefined;
  const stop = () => (stopping ??= recorder.stop());
  const output = pipeline(recorder, createWriteStream(temporary));
  void output.catch((error: Error) => {
    failure = error;
    void stop().catch(() => {});
  });
  recorder.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > websiteCaptureLimits.bytes) {
      failure = Error("Website recording exceeded 150 MB; capture shorter takes");
      void stop().catch(() => {});
    }
  });
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
    await stop();
    await output;
  }
  return {
    id,
    cursor(x: number, y: number, kind: CursorEvent["kind"]) {
      if (!stopping && events.length < 10000)
        events.push({ time: (performance.now() - started) / 1000, x, y, kind });
    },
    async save(): Promise<WebsiteRecording> {
      try {
        await finish();
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
            { version: 1, width: stream.width, height: stream.height, events },
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
          fps: 30,
          silent: true,
        };
      } catch (error) {
        await rm(temporary, { force: true });
        await rm(finalized, { force: true });
        await rm(path.join(assets, cursorName), { force: true });
        throw error;
      }
    },
    async discard() {
      try {
        await finish();
      } finally {
        await rm(temporary, { force: true });
      }
    },
  };
}
