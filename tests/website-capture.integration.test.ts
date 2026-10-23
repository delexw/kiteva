import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it, vi } from "vitest";
import { createReferenceTools } from "../src/server/requests/reference-browser-tools";
import { probeVideo } from "../src/server/rendering/video-probe";
import { browserExecutablePath } from "../src/server/runtime/browser";
import type { ReferenceToolResult } from "../src/server/requests/reference-browser-contracts";

it.skipIf(process.env.KITEVA_TEST_LOCAL_OPENSCREEN !== "1" || !browserExecutablePath(true))(
  "records a real local OpenScreen session when no worker URL is configured",
  async () => {
    vi.stubEnv("KITEVA_CAPTURE_DESKTOP", "");
    vi.stubEnv("KITEVA_CAPTURE_WORKER_URL", "");
    const workspace = await mkdtemp(path.join(os.tmpdir(), "capture-runtime-"));
    const web = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end(
        `<h1>Example creator</h1><output id="window-mode" style="display:block"></output><script>document.querySelector("#window-mode").textContent="Window mode: "+(matchMedia("(display-mode: standalone)").matches?"standalone":"browser");</script><label>Video title<input></label><label>Password<input type="password"></label><button onclick="document.querySelector('h1').textContent='Preview ready'">Build demo</button><div style="height:1800px;background:linear-gradient(#567,#abc)">Demo content</div>`,
      );
    });
    await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
    const address = web.address();
    if (!address || typeof address === "string") throw Error("Missing fixture address");
    const url = `http://127.0.0.1:${address.port}`;
    const controller = new AbortController();
    const tools = createReferenceTools({
      workspace,
      urls: [url],
      mode: "local",
      signal: controller.signal,
      enableVideoCapture: true,
      captureChapterId: "workflow",
    });
    const client = new Client({ name: "capture-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    async function call(name: string, args: Record<string, unknown>) {
      return (await client.callTool({ name, arguments: args }))
        .structuredContent as ReferenceToolResult;
    }
    try {
      await tools.server.connect(serverTransport);
      await client.connect(clientTransport);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("capture_video");
      const inspection = await call("inspect_page", { url });
      if (inspection.kind !== "inspection") throw Error(JSON.stringify(inspection));
      expect(inspection.page.text).toContain("Window mode: standalone");
      const start = await call("capture_video", {
        action: "start",
        presentation: {
          cursorTheme: "studio-ink",
          framing: { shadowIntensity: 0.4 },
        },
      });
      if (start.kind !== "recording_started") throw Error(JSON.stringify(start));
      await delay(2200); // Preserve this pause until an explicit native edit is requested.
      const control = (name: string) =>
        inspection.page.controls.find((item) => item.name === name)!.id;
      expect(
        await call("fill_control", { controlId: control("Password"), value: "never-enter" }),
      ).toMatchObject({ kind: "error" });
      expect(
        await call("fill_control", { controlId: control("Video title"), value: "Example video" }),
      ).toMatchObject({ kind: "inspection" });
      expect(await call("click_control", { controlId: control("Build demo") })).toMatchObject({
        kind: "inspection",
        page: { text: expect.stringContaining("Preview ready") },
      });
      await call("wait_for_view", { milliseconds: 3000 });
      const take = await call("capture_video", {
        action: "stop",
        recordingId: start.recordingId,
      });
      if (take.kind !== "editable_capture") throw Error(JSON.stringify(take));
      await expect(readFile(path.join(workspace, "reference-videos.json"))).rejects.toThrow();
      expect(take.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "getCurrentDocument",
          "getFrames",
          "addTrims",
          "addSpeed",
          "addZooms",
        ]),
      );
      expect(take.tools.some((tool) => tool.name === "addAutoZooms")).toBe(true);
      const edit = (operation: string, args: Record<string, unknown> = {}) =>
        call("capture_video", {
          action: "edit",
          recordingId: start.recordingId,
          native: { operation, arguments: args },
        });
      const document = await edit("getCurrentDocument");
      expect(document).toMatchObject({
        kind: "native_capture",
        isError: false,
        data: {
          settings: { cursor: { smoothing: 0, size: 1.5 } },
        },
      });
      const review = await edit("getFrames", { count: 3 });
      if (review.kind !== "native_capture") throw Error(JSON.stringify(review));
      expect(review.isError).toBe(false);
      expect(review.content.filter((item) => item.type === "image")).toHaveLength(3);
      const trimmed = await edit("addTrims", {
        ranges: [{ startSec: 0.2, endSec: 0.8, reason: "Remove an observed opening pause" }],
      });
      expect(trimmed).toMatchObject({
        kind: "native_capture",
        isError: false,
        data: { appliedCount: 1, refusedCount: 0 },
      });
      expect(await edit("addAutoZooms")).toMatchObject({
        kind: "native_capture",
        isError: false,
      });
      const reviewedDocument = await edit("getCurrentDocument");
      if (reviewedDocument.kind !== "native_capture") throw Error(JSON.stringify(reviewedDocument));
      expect(
        await call("capture_video", { action: "export", recordingId: start.recordingId }),
      ).toMatchObject({ kind: "error", message: expect.stringContaining("after the latest edit") });
      expect(await edit("getFrames", { count: 3 })).toMatchObject({
        kind: "native_capture",
        isError: false,
      });
      const stopped = await call("capture_video", {
        action: "export",
        recordingId: start.recordingId,
      });
      if (stopped.kind !== "video") throw Error(JSON.stringify(stopped));
      expect(stopped.recording).toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
        silent: true,
        fps: 60,
      });
      expect(
        stopped.recording.presentation!.sourceDuration - stopped.recording.duration,
      ).toBeCloseTo(0.6, 0);
      const video = path.join(workspace, stopped.recording.assetPath);
      const probe = await probeVideo(video, controller.signal);
      expect(Number(probe.format.duration)).toBeGreaterThan(0);
      expect(probe.streams.some((stream) => stream.codec_type === "audio")).toBe(false);
      expect(probe.streams.find((stream) => stream.codec_type === "video")?.avg_frame_rate).toBe(
        "60/1",
      );
      const cursor = JSON.parse(
        await readFile(path.join(workspace, stopped.recording.cursorPath), "utf8"),
      );
      expect(cursor.points).toEqual(expect.any(Array));
      expect(cursor).not.toHaveProperty("events");
      expect(cursor).not.toHaveProperty("coordinateSpace");
      expect(stopped.recording.presentation).toMatchObject({
        engine: "OpenScreen",
        autoZoom: false,
        cursorRendered: true,
        idleGapsTrimmed: true,
        settings: {
          cursorTheme: "studio-ink",
          cursorModel3d: false,
          cursorSize: 1.5,
          cursorSmoothing: 0,
          cursorClickBounce: 2,
          cursorClickImpact: false,
          framing: {
            padding: 24,
            borderRadius: 0,
            backgroundBlur: 1,
            aspectRatio: "16:9",
            shadowIntensity: 0.4,
          },
        },
      });
      const exportedDocument = await edit("getCurrentDocument");
      expect(exportedDocument).toMatchObject({
        data: { zoomRanges: (reviewedDocument.data as { zoomRanges: unknown }).zoomRanges },
      });
      const finalReview = await edit("getFrames", { count: 3 });
      if (finalReview.kind !== "native_capture") throw Error(JSON.stringify(finalReview));
      expect(finalReview.isError).toBe(false);
      expect(finalReview.content.filter((item) => item.type === "image")).toHaveLength(3);
      const inventory = JSON.parse(
        await readFile(path.join(workspace, "reference-videos.json"), "utf8"),
      );
      expect(inventory).toEqual([stopped.recording]);
      expect(cursor.nativeTrimRegions).toEqual([
        expect.objectContaining({ startMs: 200, endMs: 800 }),
      ]);
      if (process.env.KITEVA_CAPTURE_VERIFY_DIR) {
        await mkdir(process.env.KITEVA_CAPTURE_VERIFY_DIR, { recursive: true });
        await copyFile(video, path.join(process.env.KITEVA_CAPTURE_VERIFY_DIR, "capture.webm"));
        let frame = 0;
        for (const part of finalReview.content)
          if (part.type === "image") {
            await writeFile(
              path.join(process.env.KITEVA_CAPTURE_VERIFY_DIR!, `review-${frame++}.png`),
              Buffer.from(part.data, "base64"),
            );
          }
        await writeFile(
          path.join(process.env.KITEVA_CAPTURE_VERIFY_DIR, "flow.json"),
          JSON.stringify(
            {
              take: { kind: take.kind, duration: take.duration },
              trim: trimmed,
              recording: stopped.recording,
            },
            null,
            2,
          ),
        );
        await copyFile(
          path.join(workspace, stopped.recording.cursorPath),
          path.join(process.env.KITEVA_CAPTURE_VERIFY_DIR, "cursor.json"),
        );
      }
    } finally {
      vi.unstubAllEnvs();
      await client.close();
      await tools.close();
      await new Promise<void>((resolve, reject) =>
        web.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(workspace, { recursive: true, force: true });
    }
  },
  90000,
);
