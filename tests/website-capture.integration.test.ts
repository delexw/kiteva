import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { createReferenceTools } from "../src/server/requests/reference-browser-tools";
import { probeVideo } from "../src/server/rendering/video-probe";
import { browserExecutablePath } from "../src/server/runtime/browser";
import type { ReferenceToolResult } from "../src/server/requests/reference-browser-contracts";

it.skipIf(!browserExecutablePath())(
  "records a real headless session through the agent tools and rejects secret fields",
  async () => {
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
      const control = (name: string) =>
        inspection.page.controls.find((item) => item.name === name)!.id;
      const start = await call("capture_video", { action: "start" });
      if (start.kind !== "recording_started") throw Error(JSON.stringify(start));
      expect(
        await call("fill_control", { controlId: control("Password"), value: "never-enter" }),
      ).toMatchObject({ kind: "error" });
      expect(
        await call("fill_control", { controlId: control("Video title"), value: "Example video" }),
      ).toMatchObject({ kind: "inspection" });
      const clicked = await call("click_control", { controlId: control("Build demo") });
      expect(clicked).toMatchObject({
        kind: "inspection",
        page: { text: expect.stringContaining("Preview ready") },
      });
      await call("wait_for_view", { milliseconds: 300 });
      const stopped = await call("capture_video", {
        action: "stop",
        recordingId: start.recordingId,
      });
      if (stopped.kind !== "video") throw Error(JSON.stringify(stopped));
      expect(stopped.recording).toMatchObject({ width: 1440, height: 900, silent: true });
      const probe = await probeVideo(
        path.join(workspace, stopped.recording.assetPath),
        controller.signal,
      );
      expect(Number(probe.format.duration)).toBeGreaterThan(0);
      expect(probe.streams.some((stream) => stream.codec_type === "audio")).toBe(false);
      const cursor = JSON.parse(
        await readFile(path.join(workspace, stopped.recording.cursorPath), "utf8"),
      );
      expect(cursor.events.map((event: { kind: string }) => event.kind)).toEqual(["move", "click"]);
      expect(
        JSON.parse(await readFile(path.join(workspace, "reference-videos.json"), "utf8")),
      ).toEqual([stopped.recording]);
      expect(
        await call("capture_video", { action: "stop", recordingId: start.recordingId }),
      ).toMatchObject({ kind: "error" });
    } finally {
      await client.close();
      await tools.close();
      await new Promise<void>((resolve, reject) =>
        web.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(workspace, { recursive: true, force: true });
    }
  },
  30000,
);
