import {
  browserCapabilities,
  referenceToolRegistry,
  BrowserCapabilityRequestSchema,
  type BrowserCapabilityRequest,
} from "./tool-registry";
import { captureChapterDirectory, CaptureChapterSchema } from "../../../../shared/capture-chapters";
import { readWebsiteRecordings } from "../../../jobs/subworkflows/website-capture";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, writeFile, copyFile, realpath, stat } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ReferenceScreenshotSchema } from "../../../../shared/contracts";
import { prepareBriefImage } from "../../../requests/brief-images";
import { createReferenceBrowser } from "../../../jobs/subworkflows/website-reference";
import { type ReferenceToolResult } from "./types";
import { WorkQueue } from "../../../jobs/queue";
import { validateChapterTiming } from "../../../capture/chapter-timing";

export const referenceManifest = "reference-screenshots.json";
export async function readReferenceScreenshots(workspace: string) {
  const raw = await readFile(path.join(workspace, referenceManifest), "utf8").catch((error) => {
    if (error.code === "ENOENT") return "[]";
    throw error;
  });
  return z.array(ReferenceScreenshotSchema).parse(JSON.parse(raw));
}

export function createReferenceTools(options: {
  workspace: string;
  urls: string[];
  mode: "local" | "hosted";
  signal: AbortSignal;
  enableVideoCapture?: boolean;
  captureChapterId?: string;
  captureChapterDurationSeconds?: number;
}) {
  const server = new McpServer({ name: "reference-browser", version: "1.0.0" });
  const queue = new WorkQueue(1);
  const chapterId =
    options.captureChapterId === undefined
      ? undefined
      : CaptureChapterSchema.shape.id.parse(options.captureChapterId);
  const reviews = new Map<string, { document: boolean; frames: number }>();
  let chapterExported = false;
  let session: ReturnType<typeof createReferenceBrowser> | undefined;
  const browser = () =>
    (session ??= createReferenceBrowser(
      options.urls,
      options.signal,
      options.mode,
      options.enableVideoCapture,
    ));
  async function run(action: () => Promise<{ result: ReferenceToolResult; image?: Buffer }>) {
    return queue.run(async () => {
      try {
        options.signal.throwIfAborted();
        const { result, image } = await action();
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result) },
            ...(result.kind === "native_capture" ? result.content : []),
            ...(image
              ? [{ type: "image" as const, data: image.toString("base64"), mimeType: "image/png" }]
              : []),
          ],
          structuredContent: result,
          ...(result.kind === "native_capture" && result.isError ? { isError: true } : {}),
        };
      } catch (error) {
        const result: ReferenceToolResult = {
          kind: "error",
          message: error instanceof Error ? error.message : "Reference browsing failed",
        };
        return {
          isError: true,
          content: [{ type: "text" as const, text: result.message }],
          structuredContent: result,
        };
      }
    });
  }
  const handlers = new Map<string, (args: unknown) => ReturnType<typeof run>>();
  function setHandler<Name extends keyof typeof referenceToolRegistry>(
    name: Name,
    handler: (
      args: z.output<(typeof referenceToolRegistry)[Name]["schema"]>,
    ) => ReturnType<typeof run>,
  ) {
    const definition = referenceToolRegistry[name];
    handlers.set(name, (args) =>
      handler(
        definition.schema.parse(args) as z.output<(typeof referenceToolRegistry)[Name]["schema"]>,
      ),
    );
  }
  setHandler("inspect_page", ({ url }) =>
    run(async () => ({
      result: { kind: "inspection", page: await (await browser()).inspect(url) },
    })),
  );
  setHandler("click_control", ({ controlId }) =>
    run(async () => ({
      result: { kind: "inspection", page: await (await browser()).click(controlId) },
    })),
  );
  setHandler("capture_screenshot", ({ selector }) =>
    run(async () => {
      const captures = await readReferenceScreenshots(options.workspace);
      const name = `website-reference-${randomUUID()}.png`;
      const assets = path.join(options.workspace, "assets");
      const references = path.join(path.dirname(options.workspace), "references");
      await mkdir(assets, { recursive: true });
      await mkdir(references, { recursive: true });
      const assetPath = path.join(assets, name);
      const screenshot = { name, ...(await (await browser()).capture(assetPath, selector)) };
      await copyFile(assetPath, path.join(references, name));
      await writeFile(
        path.join(options.workspace, referenceManifest),
        JSON.stringify([...captures, screenshot], null, 2),
      );
      const original = await readFile(assetPath);
      const inspection = await prepareBriefImage(original).catch(() => ({ image: original }));
      return {
        result: { kind: "screenshot", screenshot, assetPath: `assets/${name}` },
        image: inspection.image,
      };
    }),
  );
  setHandler("scroll_page", ({ deltaY }) =>
    run(async () => ({
      result: { kind: "inspection", page: await (await browser()).scroll(deltaY) },
    })),
  );
  setHandler("capture_video", ({ action, recordingId, presentation, native }) =>
    run(async () => {
      if (action === "start") {
        if (native || recordingId) throw Error("Start accepts presentation only");
        if (chapterId && chapterExported)
          throw Error(
            "This chapter already has an exported take. Return its result; code starts the next chapter.",
          );
        const id = await (await browser()).startRecording(options.workspace, presentation);
        reviews.set(id, { document: false, frames: 0 });
        return {
          result: {
            kind: "recording_started",
            recordingId: id,
          },
        };
      }
      if (!recordingId) throw Error("Use the recording ID returned by start");
      if (presentation) throw Error("Presentation must be selected at recording start");
      if (action !== "edit" && native) throw Error("Native operations require action edit");
      if (action === "stop")
        return { result: await (await browser()).prepareRecording(recordingId) };
      if (action === "edit") {
        if (!native) throw Error("Edit requires a native operation and its arguments");
        if (chapterId && ["addTrims", "setTrim"].includes(native.operation))
          throw Error(
            "Chapter capture cannot cut footage. Use native speed regions on slow portions instead.",
          );
        const review = reviews.get(recordingId);
        if (chapterId && !review) throw Error("Use the recording started in this chapter call");
        if (
          chapterId &&
          !["getCurrentDocument", "getCursorTrack", "createCheckpoint"].includes(
            native.operation,
          ) &&
          !review?.document
        )
          throw Error("Read getCurrentDocument before editing or reviewing native frames");
        if (
          review &&
          !["getCurrentDocument", "getCursorTrack", "getFrames", "createCheckpoint"].includes(
            native.operation,
          )
        )
          review.frames = 0;
        const result = await (await browser()).editRecording(recordingId, native);
        if (!result.isError && review) {
          if (native.operation === "getCurrentDocument") review.document = true;
          if (
            native.operation === "getFrames" &&
            result.content.some((item) => item.type === "image")
          )
            review.frames++;
        }
        return { result: { ...result, operation: native.operation } };
      }
      const review = reviews.get(recordingId);
      if (chapterId && (!review?.document || !review.frames))
        throw Error(
          "Before export, read getCurrentDocument and review getFrames after the latest edit",
        );
      const recording = await (await browser()).exportRecording(recordingId);
      if (chapterId) {
        if (recording.presentation?.idleGapsTrimmed)
          throw Error("Chapter capture contains cuts. Remove all trims before export.");
        if (options.captureChapterDurationSeconds !== undefined)
          validateChapterTiming(
            recording.duration,
            options.captureChapterDurationSeconds,
            false,
            chapterId,
          );
      }
      const recordings = await readWebsiteRecordings(options.workspace);
      await writeFile(
        path.join(options.workspace, "reference-videos.json"),
        JSON.stringify(
          [...recordings.filter((saved) => saved.assetPath !== recording.assetPath), recording],
          null,
          2,
        ),
      );
      if (chapterId) {
        const directory = path.join(options.workspace, captureChapterDirectory);
        await mkdir(directory, { recursive: true });
        await writeFile(
          path.join(directory, `${chapterId}.json`),
          JSON.stringify(
            {
              chapterId,
              recording,
              documentReviewed: true,
              frameReviews: review!.frames,
            },
            null,
            2,
          ),
        );
        chapterExported = true;
      }
      return { result: { kind: "video", recording } };
    }),
  );
  setHandler("upload_files", ({ controlId, files }) =>
    run(async () => {
      const root = await realpath(options.workspace);
      const paths = await Promise.all(
        files.map(async (file) => {
          const resolved = await realpath(path.resolve(root, file));
          if (!resolved.startsWith(root + path.sep))
            throw Error("Upload files must stay inside the job workspace");
          const info = await stat(resolved);
          if (!info.isFile() || info.size > 10 * 1024 * 1024)
            throw Error("Upload requires regular files no larger than 10 MiB each");
          return resolved;
        }),
      );
      return {
        result: { kind: "inspection", page: await (await browser()).upload(controlId, paths) },
      };
    }),
  );
  setHandler("fill_control", ({ controlId, value }) =>
    run(async () => ({
      result: { kind: "inspection", page: await (await browser()).fill(controlId, value) },
    })),
  );
  setHandler("wait_for_view", ({ milliseconds }) =>
    run(async () => {
      await (await browser()).wait(milliseconds);
      return { result: { kind: "waiting", milliseconds } };
    }),
  );
  for (const operation of Object.keys(
    browserCapabilities,
  ) as (keyof typeof browserCapabilities)[]) {
    setHandler(operation, (args: Record<string, unknown>) =>
      run(async () => {
        const request = BrowserCapabilityRequestSchema.parse({
          ...args,
          operation,
        }) as BrowserCapabilityRequest;
        const result = await (await browser()).perform(request, options.workspace);
        return { result };
      }),
    );
  }
  for (const [name, definition] of Object.entries(referenceToolRegistry)) {
    if (!options.enableVideoCapture && !definition.readOnly) continue;
    const handler = handlers.get(name);
    if (!handler) throw Error(`Missing reference tool handler: ${name}`);
    server.registerTool(
      name,
      {
        description:
          typeof definition.description === "function"
            ? definition.description(Boolean(options.enableVideoCapture))
            : definition.description,
        inputSchema: definition.schema,
      },
      handler,
    );
  }
  return {
    server,
    async close() {
      if (session) await (await session).close();
      await server.close();
    },
  };
}
