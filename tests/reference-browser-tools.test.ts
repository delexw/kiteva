import { mkdtemp, readFile, rm, writeFile, symlink, realpath, truncate } from "node:fs/promises";
import os from "node:os";
import sharp from "sharp";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { browserCapabilities } from "../src/server/agents/capabilities/reference-browser/tool-registry";
import { captureCursorThemes } from "../src/server/capture/presentation";
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
} from "../src/server/agents/capabilities/reference-browser/tools";

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
      perform: vi.fn(async () => ({
        kind: "browser_action" as const,
        operation: "browser_diagnostics" as const,
        data: [],
      })),
      inspect: vi.fn().mockResolvedValue(inspection),
      click: vi.fn().mockResolvedValue(inspection),
      capture: vi.fn(async (file: string) => {
        await writeFile(file, png);
        return { title: inspection.title, url: inspection.url, text: inspection.text };
      }),
      upload: vi.fn().mockResolvedValue(inspection),
      fill: vi.fn().mockResolvedValue(inspection),
      wait: vi.fn(async () => {}),
      scroll: vi.fn().mockResolvedValue(inspection),
      startRecording: vi.fn(),
      prepareRecording: vi.fn(),
      editRecording: vi.fn(),
      exportRecording: vi.fn(),
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
        "scroll_page",
        ...Object.entries(browserCapabilities)
          .filter(([, definition]) => definition.readOnly)
          .map(([name]) => name),
      ]);
      const diagnostic = await client.callTool({
        name: "browser_diagnostics",
        arguments: { action: "console" },
      });
      expect(diagnostic).toMatchObject({
        structuredContent: { kind: "browser_action", operation: "browser_diagnostics" },
      });
      expect(session.perform).toHaveBeenCalledWith(
        { operation: "browser_diagnostics", action: "console" },
        workspace,
      );
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
      for (let index = 0; index < 12; index++)
        expect(await client.callTool({ name: "capture_screenshot", arguments: {} })).toMatchObject({
          structuredContent: { kind: "screenshot" },
        });
      expect(await readReferenceScreenshots(workspace)).toHaveLength(13);
    } finally {
      await client.close();
      await tools.close();
      await rm(root, { recursive: true, force: true });
    }
    expect(session.close).toHaveBeenCalled();
  },
);

it("continues browsing, editing and taking recordings beyond former budgets while preserving inventory", async () => {
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
    perform: vi.fn(async () => ({
      kind: "browser_action" as const,
      operation: "browser_diagnostics" as const,
      data: [],
    })),
    inspect: vi.fn().mockResolvedValue(inspection),
    click: vi.fn(),
    upload: vi.fn().mockResolvedValue(inspection),
    fill: vi.fn(),
    wait: vi.fn(async () => {}),
    scroll: vi.fn(),
    capture: vi.fn(),
    startRecording: vi.fn().mockResolvedValue(id),
    prepareRecording: vi
      .fn()
      .mockResolvedValue({ kind: "editable_capture", recordingId: id, duration: 2, tools: [] }),
    editRecording: vi.fn().mockResolvedValue({
      kind: "native_capture",
      content: [
        { type: "text", text: "native review" },
        { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
      ],
      data: { reviewed: true },
    }),
    exportRecording: vi.fn().mockResolvedValue(next),
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
    const published = (await client.listTools()).tools;
    for (const [name, definition] of Object.entries(browserCapabilities)) {
      expect(published.find((tool) => tool.name === name)).toMatchObject({
        description: definition.description,
        inputSchema: { type: "object" },
      });
    }
    const pointerResult = await client.callTool({
      name: "browser_pointer",
      arguments: { action: "click", x: 10, y: 20 },
    });
    expect(pointerResult.isError).not.toBe(true);
    expect(session.perform).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "browser_pointer",
        action: "click",
        x: 10,
        y: 20,
        button: "left",
        clickCount: 1,
      }),
      workspace,
    );
    const sample = path.join(workspace, "sample.png");
    await writeFile(sample, "sample image");
    const uploaded = await client.callTool({
      name: "upload_files",
      arguments: { controlId: "1", files: ["sample.png"] },
    });
    expect(uploaded).toMatchObject({ structuredContent: { kind: "inspection", page: inspection } });
    expect(session.upload).toHaveBeenCalledWith("1", [await realpath(sample)]);
    expect(session.click).not.toHaveBeenCalled();
    const outside = `${root}-outside.png`;
    await writeFile(outside, "outside");
    await symlink(outside, path.join(workspace, "escape.png"));
    for (const files of [[outside], ["escape.png"], []]) {
      expect(
        await client.callTool({ name: "upload_files", arguments: { controlId: "1", files } }),
      ).toMatchObject({ isError: true });
    }
    await rm(outside);
    await truncate(sample, 10 * 1024 * 1024 + 1);
    expect(
      await client.callTool({
        name: "upload_files",
        arguments: { controlId: "1", files: ["sample.png"] },
      }),
    ).toMatchObject({ isError: true });
    expect(session.upload).toHaveBeenCalledTimes(1);
    const scroll = (await client.listTools()).tools.find((tool) => tool.name === "scroll_page")!;
    const videoTool = (await client.listTools()).tools.find(
      (tool) => tool.name === "capture_video",
    )!;
    expect(videoTool.inputSchema.properties?.presentation).toMatchObject({
      properties: {
        cursorTheme: { enum: [...captureCursorThemes] },
      },
    });
    expect(videoTool.inputSchema.properties?.action).toMatchObject({
      enum: ["start", "stop", "edit", "export"],
    });
    expect(videoTool.inputSchema.properties?.trimRegions).toBeUndefined();
    expect(videoTool.inputSchema.properties?.presentation).not.toHaveProperty(
      "properties.cursorSmoothing",
    );
    expect(videoTool.inputSchema.properties?.presentation).not.toHaveProperty(
      "properties.cursorSize",
    );
    expect(videoTool.description).toContain("Stop returns an editable take");

    expect(scroll.description).toContain("-1800 to +1800 pixels per call");
    expect(scroll.description).toContain("multiple calls");
    expect(scroll.inputSchema.properties?.deltaY).toMatchObject({
      minimum: -1800,
      maximum: 1800,
      description: expect.stringContaining("Negative scrolls up; positive scrolls down"),
    });
    const startsBeforeInvalidSize = vi.mocked(session.startRecording).mock.calls.length;
    expect(
      await client.callTool({
        name: "capture_video",
        arguments: { action: "start", presentation: { cursorSize: 2.5 } },
      }),
    ).toMatchObject({ isError: true });
    expect(session.startRecording).toHaveBeenCalledTimes(startsBeforeInvalidSize);
    expect(
      await client.callTool({
        name: "capture_video",
        arguments: {
          action: "start",
          presentation: { cursorTheme: "pixel-candy" },
        },
      }),
    ).toMatchObject({ structuredContent: { kind: "recording_started", recordingId: id } });
    expect(session.startRecording).toHaveBeenCalledWith(
      workspace,
      expect.objectContaining({ cursorTheme: "pixel-candy" }),
    );
    for (let index = 0; index < 100; index++)
      await client.callTool({ name: "inspect_page", arguments: {} });
    expect(await client.callTool({ name: "inspect_page", arguments: {} })).toMatchObject({
      structuredContent: { kind: "inspection" },
    });
    expect(
      await client.callTool({
        name: "capture_video",
        arguments: { action: "stop", recordingId: id },
      }),
    ).toMatchObject({ structuredContent: { kind: "editable_capture" } });
    expect(session.prepareRecording).toHaveBeenCalledWith(id);
    expect(session.exportRecording).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(path.join(root, "reference-videos.json"), "utf8"))).toEqual([
      first,
    ]);
    const review = await client.callTool({
      name: "capture_video",
      arguments: {
        action: "edit",
        recordingId: id,
        native: { operation: "getFrames", arguments: { count: 6 } },
      },
    });
    expect(review).toMatchObject({
      content: expect.arrayContaining([{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }]),
      structuredContent: { kind: "native_capture", data: { reviewed: true } },
    });
    expect(session.editRecording).toHaveBeenCalledWith(id, {
      operation: "getFrames",
      arguments: { count: 6 },
    });
    for (let index = 0; index < 100; index++)
      expect(
        await client.callTool({
          name: "capture_video",
          arguments: {
            action: "edit",
            recordingId: id,
            native: { operation: "getCurrentDocument", arguments: {} },
          },
        }),
      ).toMatchObject({ structuredContent: { kind: "native_capture" } });
    for (let index = 0; index < 8; index++) {
      expect(
        await client.callTool({ name: "capture_video", arguments: { action: "start" } }),
      ).toMatchObject({ structuredContent: { kind: "recording_started" } });
      await client.callTool({
        name: "capture_video",
        arguments: { action: "stop", recordingId: id },
      });
    }

    await client.callTool({
      name: "capture_video",
      arguments: { action: "export", recordingId: id },
    });
    // A repair and re-export replace this take's inventory entry rather than duplicating it.
    await client.callTool({
      name: "capture_video",
      arguments: { action: "export", recordingId: id },
    });
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

it("requires document and image review after each edit before exporting a chapter take", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "chapter-review-tools-"));
  const recordingId = "11111111-1111-4111-8111-111111111111";
  const recording = {
    assetPath: `assets/website-video-${recordingId}.webm`,
    cursorPath: `assets/website-video-${recordingId}.cursor.json`,
    url: "https://example.com",
    duration: 5,
    width: 1280,
    height: 720,
    fps: 60 as const,
    silent: true as const,
  };
  let images = false;
  const inspection = {
    title: "Example",
    url: "https://example.com",
    text: "Example",
    controls: [],
    sections: [],
  };
  const browser = {
    perform: vi.fn(),
    inspect: vi.fn().mockResolvedValue(inspection),
    click: vi.fn(),
    capture: vi.fn(),
    upload: vi.fn(),
    fill: vi.fn(),
    wait: vi.fn(),
    scroll: vi.fn(),
    startRecording: vi.fn().mockResolvedValue(recordingId),
    prepareRecording: vi
      .fn()
      .mockResolvedValue({ kind: "editable_capture", recordingId, duration: 5, tools: [] }),
    editRecording: vi.fn(async (_id, request) => ({
      kind: "native_capture" as const,
      data: {},
      isError: false,
      content:
        request.operation === "getFrames" && images
          ? [{ type: "image" as const, mimeType: "image/png", data: "aW1hZ2U=" }]
          : [{ type: "text" as const, text: "{}" }],
    })),
    exportRecording: vi.fn().mockResolvedValue(recording),
    close: vi.fn(),
  };
  vi.mocked(createReferenceBrowser).mockResolvedValue(browser);
  const tools = createReferenceTools({
    workspace,
    urls: ["https://example.com"],
    mode: "local",
    signal: new AbortController().signal,
    enableVideoCapture: true,
    captureChapterId: "create",
    captureChapterDurationSeconds: 5,
  });
  const client = new Client({ name: "chapter-review", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await tools.server.connect(b);
    await client.connect(a);
    const call = (
      action: string,
      native?: { operation: string; arguments: Record<string, unknown> },
    ) =>
      client.callTool({
        name: "capture_video",
        arguments: {
          action,
          ...(action === "start" ? {} : { recordingId }),
          ...(native ? { native } : {}),
        },
      });
    const edit = (operation: string) => call("edit", { operation, arguments: {} });
    await call("start");
    await call("stop");
    expect((await call("export")).isError).toBe(true);
    expect((await edit("getFrames")).isError).toBe(true);
    await edit("getCurrentDocument");
    expect((await edit("addTrims")).isError).toBe(true);
    expect((await edit("setTrim")).isError).toBe(true);
    await edit("getFrames");
    expect((await call("export")).isError).toBe(true);
    images = true;
    await edit("getFrames");
    expect(await edit("setZoom")).toMatchObject({ structuredContent: { operation: "setZoom" } });
    expect((await call("export")).isError).toBe(true);
    expect(browser.exportRecording).not.toHaveBeenCalled();
    await edit("getFrames");
    recording.duration = 6;
    expect((await call("export")).isError).toBe(true);
    await expect(readFile(path.join(workspace, "capture-chapters/create.json"))).rejects.toThrow();
    recording.duration = 5;
    expect((await call("export")).isError).not.toBe(true);
    expect(browser.exportRecording).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(await readFile(path.join(workspace, "capture-chapters/create.json"), "utf8")),
    ).toMatchObject({ chapterId: "create", documentReviewed: true, frameReviews: 1, recording });
    expect((await call("start")).isError).toBe(true);
  } finally {
    await client.close();
    await tools.close();
    await rm(workspace, { recursive: true, force: true });
  }
});
