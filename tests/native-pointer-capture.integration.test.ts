import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { createReferenceTools } from "../src/server/requests/reference-browser-tools";
import type { ReferenceToolResult } from "../src/server/requests/reference-browser-contracts";

it.skipIf(process.env.KITEVA_TEST_LOCAL_OPENSCREEN !== "1")(
  "renders the native cursor from actual browser action receipts",
  async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "native-pointer-"));
    const web = createServer((_req, res) => {
      res.setHeader("content-type", "text/html");
      res.end(
        '<body style="background:#f2eadb;font:36px sans-serif;padding:100px"><h1>Native cursor test</h1><button id="next" style="font:36px sans-serif;padding:32px" onclick="this.textContent=\'Clicked\'">Click here</button></body>',
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
      captureChapterId: "native-pointer",
    });
    const client = new Client({ name: "native-pointer-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = (
        await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 })
      ).structuredContent as ReferenceToolResult;
      return result;
    };
    try {
      await tools.server.connect(b);
      await client.connect(a);
      expect((await call("inspect_page", { url })).kind).toBe("inspection");
      expect(
        await call("browser_emulate", { action: "viewport", width: 1440, height: 900 }),
      ).toMatchObject({
        kind: "error",
        message: expect.stringContaining("viewport emulation is unavailable"),
      });
      const start = await call("capture_video", {
        action: "start",
        presentation: { cursorTheme: "studio-ink" },
      });
      if (start.kind !== "recording_started") throw Error(JSON.stringify(start));
      const origin = await call("browser_pointer", { action: "move", x: 50, y: 50 });
      await call("wait_for_view", { milliseconds: 700 });
      const click = await call("browser_pointer", { action: "click", target: "#next" });
      if (click.kind !== "browser_action") throw Error(JSON.stringify(click));
      const clickEvent = (
        click.data as { pointer: { at: number; x: number; y: number; click: boolean } }
      ).pointer;
      expect(clickEvent.click).toBe(true);
      await call("wait_for_view", { milliseconds: 1200 });
      if (origin.kind !== "browser_action") throw Error(JSON.stringify(origin));
      const originEvent = (origin.data as { pointer: typeof clickEvent }).pointer;
      const take = await call("capture_video", { action: "stop", recordingId: start.recordingId });
      if (take.kind !== "editable_capture") throw Error(JSON.stringify(take));
      expect(take.tools.some((tool) => tool.name === "setPointerTrack")).toBe(true);
      const edit = (operation: string, args: Record<string, unknown> = {}) =>
        call("capture_video", {
          action: "edit",
          recordingId: start.recordingId,
          native: { operation, arguments: args },
        });
      await edit("getCurrentDocument");
      expect(await edit("setPointerTrack", { events: [originEvent, clickEvent] })).toMatchObject({
        kind: "native_capture",
        isError: false,
      });
      const track = await edit("getCursorTrack");
      expect(track).toMatchObject({ kind: "native_capture", isError: false });
      if (track.kind !== "native_capture") throw Error(JSON.stringify(track));
      expect(
        (track.data as { points: Array<{ kind?: string; visible?: boolean }> }).points.some(
          (point) => point.kind === "click" && point.visible !== false,
        ),
      ).toBe(true);
      await edit("getCurrentDocument");
      const frames = await edit("getFrames", {
        atSec: [(clickEvent.at - take.recordingStartedAt!) / 1000],
      });
      if (frames.kind !== "native_capture" || frames.isError) throw Error(JSON.stringify(frames));
      const out = "/tmp/kiteva-native-pointer-check";
      await mkdir(out, { recursive: true });
      for (const part of frames.content)
        if (part.type === "image")
          await writeFile(path.join(out, "native-click.png"), Buffer.from(part.data, "base64"));
      const exported = await call("capture_video", {
        action: "export",
        recordingId: start.recordingId,
      });
      if (exported.kind !== "video") throw Error(JSON.stringify(exported));
      await copyFile(
        path.join(workspace, exported.recording.assetPath),
        path.join(out, "native-cursor.webm"),
      );
    } finally {
      await client.close();
      await tools.close();
      await new Promise<void>((resolve) => web.close(() => resolve()));
      await rm(workspace, { recursive: true, force: true });
    }
  },
  120000,
);
