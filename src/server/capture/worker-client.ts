import {
  EditableCaptureSchema,
  NativeCaptureReplySchema,
  NativeCaptureRequestSchema,
} from "./native-editor";
import { videoRenderTimeoutMs } from "../rendering/timeouts";
import { mkdir, rename, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { z } from "zod";
import type { createLocalReferenceBrowser } from "../jobs/subworkflows/website-reference";
import { WebsiteRecordingSchema, websiteCaptureLimits } from "../jobs/subworkflows/website-capture";
import { WorkerAssetNameSchema, type CaptureAction } from "./worker-contract";
import { CapturePresentationSchema } from "./presentation";

const InspectionSchema = z.object({
  title: z.string(),
  text: z.string(),
  url: z.string().url(),
  controls: z.array(
    z
      .object({ id: z.string(), name: z.string(), role: z.string(), url: z.string().optional() })
      .transform((control) => ({ ...control, url: control.url })),
  ),
  sections: z.array(z.object({ heading: z.string(), selector: z.string() })),
});
const ScreenshotSchema = z.object({
  name: WorkerAssetNameSchema,
  title: z.string(),
  text: z.string(),
  url: z.string().url(),
});

export async function createRemoteReferenceBrowser(
  urls: string[],
  signal: AbortSignal,
  mode: "local" | "hosted",
): Promise<Awaited<ReturnType<typeof createLocalReferenceBrowser>>> {
  const base = new URL(process.env.KITEVA_CAPTURE_WORKER_URL ?? "");
  if (
    base.protocol !== "https:" &&
    !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))
  )
    throw Error("The capture worker requires HTTPS or a loopback tunnel");
  if (base.username || base.password || base.pathname !== "/" || base.search || base.hash)
    throw Error("Use the capture worker origin without embedded credentials or a path");
  const token = process.env.KITEVA_CAPTURE_WORKER_TOKEN;
  if (!token || token.length < 32) throw Error("Configure the capture worker authentication token");
  const headers = { authorization: `Bearer ${token}` };
  async function request(
    route: string,
    method: string,
    body?: unknown,
    requestSignal = signal,
    timeout = 180000,
  ) {
    const response = await fetch(new URL(route, base), {
      method,
      headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.any([requestSignal, AbortSignal.timeout(timeout)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(`OpenScreen desktop worker request failed (${response.status})`);
    }
    return response;
  }
  const { id } = z
    .object({ id: z.string().uuid() })
    .parse(await (await request("/sessions", "POST", { urls, mode })).json());
  const route = `/sessions/${id}`;
  let closing: Promise<void> | undefined;
  function close(): Promise<void> {
    return (closing ??= request(route, "DELETE", undefined, AbortSignal.timeout(10000))
      .then(async (response) => {
        await response.body?.cancel();
        signal.removeEventListener("abort", abort);
      })
      .catch((error) => {
        closing = undefined;
        throw error;
      }));
  }
  const abort = () => {
    void close().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) {
    await close();
    signal.throwIfAborted();
  }
  const action = async (body: CaptureAction) =>
    (
      await request(
        `${route}/actions`,
        "POST",
        body,
        signal,
        ["prepare", "edit", "export"].includes(body.action)
          ? videoRenderTimeoutMs + 180000
          : 180000,
      )
    ).json();
  async function download(name: string, destination: string, maximum: number) {
    WorkerAssetNameSchema.parse(name);
    const response = await request(`${route}/assets/${name}`, "GET");
    if (!response.body) throw Error("Capture worker returned no asset data");
    let bytes = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > maximum ? Error("Capture worker asset exceeded its size limit") : null,
          chunk,
        );
      },
    });
    const temporary = `${destination}.partial`;
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await pipeline(
        Readable.from(
          (async function* () {
            const reader = response.body!.getReader();
            try {
              while (true) {
                const chunk = await reader.read();
                if (chunk.done) return;
                yield chunk.value;
              }
            } finally {
              await reader.cancel().catch(() => {});
              reader.releaseLock();
            }
          })(),
        ),
        limit,
        createWriteStream(temporary),
        {
          signal,
        },
      );
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
  async function downloadRecording(recording: z.infer<typeof WebsiteRecordingSchema>) {
    if (!workspace) throw Error("Start an OpenScreen recording first");
    const video = path.join(workspace, recording.assetPath);
    const cursor = path.join(workspace, recording.cursorPath);
    try {
      await download(path.basename(recording.assetPath), video, websiteCaptureLimits.bytes);
      await download(path.basename(recording.cursorPath), cursor, 2_000_000);
    } catch (error) {
      await rm(video, { force: true });
      await rm(cursor, { force: true });
      throw error;
    }
    return recording;
  }
  let workspace: string | undefined;
  return {
    inspect: async (url) => InspectionSchema.parse(await action({ action: "inspect", url })),
    click: async (controlId) =>
      InspectionSchema.parse(await action({ action: "click", controlId })),
    fill: async (controlId, value) =>
      InspectionSchema.parse(await action({ action: "fill", controlId, value })),
    scroll: async (deltaY) => InspectionSchema.parse(await action({ action: "scroll", deltaY })),
    async wait(milliseconds) {
      await action({ action: "wait", milliseconds });
    },
    async capture(destination, selector) {
      const result = ScreenshotSchema.parse(await action({ action: "capture", selector }));
      await download(result.name, destination, 30_000_000);
      return { title: result.title, text: result.text, url: result.url };
    },
    async startRecording(destination, presentation) {
      workspace = destination;
      return z.object({ id: z.string().uuid() }).parse(
        await action({
          action: "start",
          presentation: presentation && CapturePresentationSchema.parse(presentation),
        }),
      ).id;
    },
    async prepareRecording(recordingId) {
      return EditableCaptureSchema.parse(await action({ action: "prepare", recordingId }));
    },
    async editRecording(recordingId, request) {
      return NativeCaptureReplySchema.parse(
        await action({
          action: "edit",
          recordingId,
          request: NativeCaptureRequestSchema.parse(request),
        }),
      );
    },
    async exportRecording(recordingId) {
      return downloadRecording(
        WebsiteRecordingSchema.parse(await action({ action: "export", recordingId })),
      );
    },
    close,
  };
}
