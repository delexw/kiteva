import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import sharp from "sharp";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
vi.mock("../src/server/jobs/subworkflows/website-reference", () => ({
  createReferenceBrowser: vi.fn(),
}));
import { createReferenceBrowser } from "../src/server/jobs/subworkflows/website-reference";
import {
  createReferenceTools,
  readReferenceScreenshots,
} from "../src/server/requests/reference-browser-tools";

it.each([64, 3000])(
  "exposes semantic capture with a %s px image and preserves original generation assets",
  async (width) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reference-tools-"));
    const workspace = path.join(root, "brief");
    const png = await sharp({
      create: { width, height: width / 2, channels: 3, background: "#aabbcc" },
    })
      .png()
      .toBuffer();
    const inspection = {
      title: "Product",
      url: "https://example.com/",
      text: "Product interface",
      controls: [{ id: "1", name: "Existing project", role: "button", url: undefined }],
      sections: [{ heading: "Settings", selector: "#settings" }],
    };
    const session = {
      inspect: vi.fn().mockResolvedValue(inspection),
      click: vi.fn().mockResolvedValue(inspection),
      capture: vi.fn(async (file: string) => {
        await writeFile(file, png);
        return { title: inspection.title, url: inspection.url, text: inspection.text };
      }),
      fill: vi.fn().mockResolvedValue(inspection),
      wait: vi.fn(async () => {}),
      scroll: vi.fn().mockResolvedValue(inspection),
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(createReferenceBrowser).mockResolvedValue(session);
    const tools = createReferenceTools({
      workspace,
      urls: ["https://example.com/"],
      mode: "local",
      signal: new AbortController().signal,
    });
    const client = new Client({ name: "test-client", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await tools.server.connect(serverTransport);
      await client.connect(clientTransport);
      const list = await client.listTools();
      expect(list.tools.map((tool) => tool.name)).toEqual([
        "inspect_page",
        "click_control",
        "capture_screenshot",
      ]);
      expect(session.capture).not.toHaveBeenCalled();
      const state = await client.callTool({
        name: "inspect_page",
        arguments: { url: inspection.url },
      });
      expect(state.structuredContent).toMatchObject({ kind: "inspection", page: inspection });
      await client.callTool({ name: "click_control", arguments: { controlId: "1" } });
      expect(session.click).toHaveBeenCalledWith("1");
      const shot = await client.callTool({
        name: "capture_screenshot",
        arguments: { selector: "#settings" },
      });
      expect(shot.structuredContent).toMatchObject({
        kind: "screenshot",
        screenshot: { title: "Product" },
      });
      const image = CallToolResultSchema.parse(shot).content.find((part) => part.type === "image");
      if (!image || typeof image.data !== "string")
        throw Error("Missing screenshot response image");
      const responseImage = Buffer.from(image.data, "base64");
      expect(await sharp(responseImage).metadata()).toMatchObject({
        width: width === 64 ? 64 : 2560,
        height: width === 64 ? 32 : 1280,
        format: "png",
      });
      if (width === 64) expect(responseImage).toEqual(png);
      else expect(responseImage).not.toEqual(png);
      const captures = await readReferenceScreenshots(workspace);
      expect(captures).toHaveLength(1);
      expect(await readFile(path.join(workspace, "assets", captures[0].name))).toEqual(png);
      expect(await readFile(path.join(root, "references", captures[0].name))).toEqual(png);
      expect(session.capture).toHaveBeenCalledWith(expect.any(String), "#settings");
      session.capture.mockRejectedValueOnce(Error("Section not found"));
      const failure = await client.callTool({
        name: "capture_screenshot",
        arguments: { selector: "#missing" },
      });
      expect(failure).toMatchObject({
        isError: true,
        structuredContent: { kind: "error", message: "Section not found" },
      });
      expect(await readReferenceScreenshots(workspace)).toHaveLength(1);
    } finally {
      await client.close();
      await tools.close();
      await rm(root, { recursive: true, force: true });
    }
    expect(session.close).toHaveBeenCalled();
  },
);

it("keeps stop available after the interaction budget and preserves earlier recording inventory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "capture-tools-"));
  const workspace = root;
  const id = "00000000-0000-4000-8000-000000000001";
  const first = {
    assetPath: `assets/website-video-${id}.webm`,
    cursorPath: `assets/website-video-${id}.cursor.json`,
    url: "https://example.com/",
    duration: 2,
    width: 1440,
    height: 900,
    fps: 30 as const,
    silent: true as const,
  };
  const next = {
    ...first,
    assetPath: first.assetPath.replace("0001", "0002"),
    cursorPath: first.cursorPath.replace("0001", "0002"),
  };
  await writeFile(path.join(root, "reference-videos.json"), JSON.stringify([first]));
  const inspection = {
    title: "Demo",
    url: "https://example.com/",
    text: "Demo",
    controls: [],
    sections: [],
  };
  const session = {
    inspect: vi.fn().mockResolvedValue(inspection),
    click: vi.fn(),
    fill: vi.fn(),
    wait: vi.fn(async () => {}),
    scroll: vi.fn(),
    capture: vi.fn(),
    startRecording: vi.fn().mockResolvedValue(id),
    stopRecording: vi.fn().mockResolvedValue(next),
    close: vi.fn(),
  };
  vi.mocked(createReferenceBrowser).mockResolvedValue(session);
  const tools = createReferenceTools({
    workspace,
    urls: [inspection.url],
    mode: "local",
    signal: new AbortController().signal,
    enableVideoCapture: true,
  });
  const client = new Client({ name: "capture-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await tools.server.connect(serverTransport);
    await client.connect(clientTransport);
    expect(
      await client.callTool({
        name: "capture_video",
        arguments: {
          action: "start",
          presentation: { cursorSize: 2.5 },
        },
      }),
    ).toMatchObject({ structuredContent: { kind: "recording_started", recordingId: id } });
    expect(session.startRecording).toHaveBeenCalledWith(
      workspace,
      expect.objectContaining({ cursorSize: 2.5 }),
    );
    for (let index = 0; index < 80; index++)
      await client.callTool({ name: "inspect_page", arguments: {} });
    expect(await client.callTool({ name: "inspect_page", arguments: {} })).toMatchObject({
      isError: true,
    });
    expect(
      await client.callTool({
        name: "capture_video",
        arguments: { action: "stop", recordingId: id },
      }),
    ).toMatchObject({ structuredContent: { kind: "video", recording: next } });
    expect(JSON.parse(await readFile(path.join(root, "reference-videos.json"), "utf8"))).toEqual([
      first,
      next,
    ]);
  } finally {
    await client.close();
    await tools.close();
    await rm(root, { recursive: true, force: true });
  }
});
