import sharp from "sharp";
import { command } from "../src/server/runtime/process";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile, mkdir, copyFile } from "node:fs/promises";
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
        `<h1>Example creator</h1><label>Video title<input></label><label>Password<input type="password"></label><button onclick="document.querySelector('h1').textContent='Preview ready'">Build demo</button><div style="height:1800px;background:linear-gradient(#567,#abc)">Demo content</div>`,
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
      const start = await call("capture_video", {
        action: "start",
        presentation: {
          cursorSize: 2.4,
          cursorClickBounce: 2.5,
          framing: { padding: 20, borderRadius: 16, shadowIntensity: 0.4, aspectRatio: "native" },
          zoomRegions: [{ startSeconds: 2, endSeconds: 6, depth: 3 }],
        },
      });
      if (start.kind !== "recording_started") throw Error(JSON.stringify(start));
      await delay(2200); // Simulate model/tool-call latency: it must not survive in the exported demo.
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
      await call("wait_for_view", { milliseconds: 1200 });
      const stopped = await call("capture_video", {
        action: "stop",
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
      ).toBeGreaterThan(1);
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
      expect(cursor.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "click", cursorType: "pointer" }),
          expect.objectContaining({ kind: "click", cursorType: "text" }),
        ]),
      );
      expect(
        cursor.events.filter((event: { kind: string }) => event.kind === "click"),
      ).toHaveLength(2);
      expect(
        cursor.events.filter((event: { kind: string }) => event.kind === "move").length,
      ).toBeGreaterThan(12);
      expect(stopped.recording.presentation).toMatchObject({
        engine: "OpenScreen",
        autoZoom: true,
        cursorRendered: true,
        idleGapsTrimmed: true,
        settings: {
          cursorTheme: "prism-glow",
          cursorSize: 2.4,
          cursorClickBounce: 2.5,
          zoomRegions: [{ focusMode: "auto", focusX: 0.5, focusY: 0.5 }],
        },
      });
      async function whiteHeaderBottom(time: number) {
        const image = path.join(workspace, `frame-${time}.png`);
        await command(
          "ffmpeg",
          ["-v", "error", "-y", "-ss", String(time), "-i", video, "-frames:v", "1", image],
          workspace,
          controller.signal,
        );
        const { data, info } = await sharp(image)
          .resize({ width: 320 })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        let bottom = 0;
        for (let y = 0; y < info.height; y++) {
          let white = 0;
          for (let x = 5; x < info.width - 5; x++) {
            const offset = (y * info.width + x) * info.channels;
            if (data[offset] > 230 && data[offset + 1] > 230 && data[offset + 2] > 230) white++;
          }
          if (white / (info.width - 10) > 0.8) bottom = y;
        }
        return bottom;
      }
      // Check actual rendered pixels: the header grows during native zoom and returns wide at the end.
      expect(await whiteHeaderBottom(0.9)).toBeGreaterThan(
        (await whiteHeaderBottom(stopped.recording.duration - 0.1)) * 1.1,
      );
      const wideHeader = await whiteHeaderBottom(stopped.recording.duration - 0.1);
      for (const click of cursor.events.filter(
        (event: { kind: string }) => event.kind === "click",
      )) {
        expect(await whiteHeaderBottom(click.time - 0.1)).toBeGreaterThan(wideHeader * 1.1);
      }
      if (process.env.KITEVA_CAPTURE_VERIFY_DIR) {
        await mkdir(process.env.KITEVA_CAPTURE_VERIFY_DIR, { recursive: true });
        await copyFile(video, path.join(process.env.KITEVA_CAPTURE_VERIFY_DIR, "capture.webm"));
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
