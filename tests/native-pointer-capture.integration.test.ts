import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { z } from "zod";
import { createReferenceTools } from "../src/server/requests/reference-browser-tools";
import type { ReferenceToolResult } from "../src/server/requests/reference-browser-contracts";

it.skipIf(process.env.KITEVA_TEST_LOCAL_OPENSCREEN !== "1")(
  "renders browser action positions through the native pointer track in a windowed recording",
  async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "native-pointer-"));
    const web = createServer((_req, res) => {
      res.setHeader("content-type", "text/html");
      res.end(`<!doctype html><style>
        body { background:#f2eadb; font:28px sans-serif; margin:0 }
        button { position:absolute; width:180px; height:90px; font:24px sans-serif }
        #first { left:10%; top:15% } #middle { left:43%; top:43% } #last { left:75%; top:75% }
      </style><h1>Windowed native cursor alignment</h1>
      <button id="first" onclick="this.textContent='First clicked'">First target</button>
      <button id="middle" onclick="this.textContent='Middle clicked'">Middle target</button>
      <button id="last" onclick="this.textContent='Last clicked'">Last target</button>`);
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
      await call("browser_emulate", {
        action: "viewport",
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      });
      const viewport = () =>
        call("browser_evaluate", {
          expression: "JSON.stringify({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})",
        });
      const before = await viewport();
      expect(before).toMatchObject({ kind: "browser_action" });
      const start = await call("capture_video", {
        action: "start",
        presentation: { cursorTheme: "studio-ink" },
      });
      if (start.kind !== "recording_started") throw Error(JSON.stringify(start));
      expect(await viewport()).toEqual(before);
      await call("wait_for_view", { milliseconds: 500 });
      for (const target of ["#first", "#middle", "#last"]) {
        const click = await call("browser_pointer", { action: "click", target });
        expect(click).toMatchObject({ kind: "browser_action", data: { ok: true } });
        await call("wait_for_view", { milliseconds: 1600 });
      }
      const take = await call("capture_video", { action: "stop", recordingId: start.recordingId });
      if (take.kind !== "editable_capture") throw Error(JSON.stringify(take));
      expect(take.tools.some((tool) => tool.name === "setPointerTrack")).toBe(false);
      const edit = (operation: string, args: Record<string, unknown> = {}) =>
        call("capture_video", {
          action: "edit",
          recordingId: start.recordingId,
          native: { operation, arguments: args },
        });
      await edit("getCurrentDocument");
      const track = await edit("getCursorTrack");
      expect(track).toMatchObject({ kind: "native_capture", isError: false });
      if (track.kind !== "native_capture") throw Error(JSON.stringify(track));
      const points = z
        .object({
          points: z.array(
            z.object({ cx: z.number(), cy: z.number(), kind: z.string().optional() }),
          ),
        })
        .parse(track.data).points;
      const clicks = points.filter((point) => point.kind === "click");
      expect(clicks).toHaveLength(3);
      for (const [index, expectedX] of [0.146875, 0.476875, 0.796875].entries())
        expect(clicks[index].cx).toBeCloseTo(expectedX, 2);
      expect(clicks[0].cy).toBeLessThan(clicks[1].cy);
      expect(clicks[1].cy).toBeLessThan(clicks[2].cy);
      await edit("getCurrentDocument");
      const frames = await edit("getFrames", {
        atSec: [1, 3, 5],
      });
      if (frames.kind !== "native_capture" || frames.isError) throw Error(JSON.stringify(frames));
      const out = "/tmp/kiteva-native-pointer-check";
      await mkdir(out, { recursive: true });
      await writeFile(path.join(out, "track.json"), JSON.stringify(track.data, null, 2));
      let index = 0;
      for (const part of frames.content)
        if (part.type === "image")
          await writeFile(
            path.join(out, `native-click-${index++}.png`),
            Buffer.from(part.data, "base64"),
          );
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
