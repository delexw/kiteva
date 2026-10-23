import { beforeEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  callTool: vi.fn(),
  listTools: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    callTool = native.callTool;
    listTools = native.listTools;
    connect = native.connect;
    close = native.close;
  },
}));
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({ StdioClientTransport: class {} }));
vi.mock("../src/server/capture/openscreen", () => ({
  openScreenExecutable: async () => "/native/openscreen",
}));
import {
  createNativeCaptureEditor,
  startNativeCaptureRecording,
  nativeCaptureOperations,
  NativeCaptureRequestSchema,
} from "../src/server/capture/native-editor";

const reply = (data: unknown, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  isError,
});
beforeEach(() => {
  vi.clearAllMocks();
  native.close.mockResolvedValue(undefined);
  native.listTools.mockResolvedValue({
    tools: [
      "createProject",
      "startRecording",
      "stopRecording",
      "setEditorSettings",
      "exportVideo",
      "setPointerTrack",
      ...nativeCaptureOperations,
    ].map((name) => ({
      name,
      description: `Native ${name}`,
      inputSchema: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          path: { type: "string" },
          count: { type: "integer", minimum: 1, maximum: 12 },
        },
      },
    })),
  });
  native.callTool.mockImplementation(async ({ name }) =>
    name === "createProject"
      ? reply({ projectId: "take-project" })
      : name === "getCurrentDocument"
        ? reply({ zoomRanges: [] })
        : reply({ applied: true }),
  );
});
const editor = () =>
  createNativeCaptureEditor("/take/source.mp4", "/take/export.mp4", new AbortController().signal, {
    cursorTheme: "studio-ink",
    framing: { shadowIntensity: 0.5 },
  });

it("uses live schemas and binds review/edit/export to the take without selecting cuts", async () => {
  const take = await editor();
  try {
    expect(take.tools.find((tool) => tool.name === "getFrames")?.inputSchema.properties).toEqual({
      count: { type: "integer", minimum: 1, maximum: 12 },
    });
    expect(native.callTool).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "addTrims" }),
      expect.anything(),
      expect.anything(),
    );
    const ranges = [{ startSec: 2, endSec: 4 }];
    await take.call({ operation: "addTrims", arguments: { ranges } });
    expect(native.callTool).toHaveBeenLastCalledWith(
      { name: "addTrims", arguments: { projectId: "take-project", ranges } },
      undefined,
      expect.any(Object),
    );
    native.callTool.mockResolvedValueOnce({
      content: [{ type: "image", data: "Zg==", mimeType: "image/png" }],
    });
    expect(await take.call({ operation: "getFrames", arguments: { count: 1 } })).toMatchObject({
      kind: "native_capture",
      content: [{ type: "image", data: "Zg==", mimeType: "image/png" }],
    });
    await take.export();
    expect(native.callTool.mock.calls.some(([request]) => request.name === "addAutoZooms")).toBe(
      false,
    );
    expect(native.callTool).toHaveBeenLastCalledWith(
      {
        name: "exportVideo",
        arguments: {
          projectId: "take-project",
          path: "/take/export.mp4",
          fps: 60,
          quality: "source",
        },
      },
      undefined,
      expect.any(Object),
    );
  } finally {
    await take.close();
  }
  expect(native.close).toHaveBeenCalledOnce();
});
it("rejects other projects, file paths and unavailable operations before forwarding", async () => {
  const take = await editor();
  try {
    for (const key of ["projectId", "path", "videoPath", "outputPath"])
      await expect(
        take.call({ operation: "getFrames", arguments: { [key]: "outside" } }),
      ).rejects.toThrow("cannot override");
    await expect(take.call(JSON.parse('{"operation":"listProjects"}'))).rejects.toThrow();
    expect(take.tools.some((tool) => tool.name === "addAutoZooms")).toBe(true);
  } finally {
    await take.close();
  }
});
it("preserves native partial outcomes and errors without running a planner on export", async () => {
  const take = await editor();
  try {
    native.callTool.mockResolvedValueOnce(
      reply({ appliedCount: 1, refusedCount: 1, cutTransitions: ["in"] }),
    );
    expect(
      await take.call({
        operation: "addTrims",
        arguments: { ranges: [{ startSec: 1, endSec: 2 }] },
      }),
    ).toMatchObject({ data: { refusedCount: 1, cutTransitions: ["in"] } });
    native.callTool.mockResolvedValueOnce(reply({ message: "Invalid region" }, true));
    expect(await take.call({ operation: "addSpeed", arguments: {} })).toMatchObject({
      isError: true,
      data: { message: "Invalid region" },
    });
    await take.export();
    expect(native.callTool.mock.calls.at(-1)?.[0].name).toBe("exportVideo");
  } finally {
    await take.close();
  }
});
it("closes the native connection when setup fails", async () => {
  native.callTool.mockResolvedValueOnce(reply({ message: "Import failed" }, true));
  await expect(editor()).rejects.toThrow("createProject failed");
  expect(native.close).toHaveBeenCalledOnce();
});

it("preserves native camera settings and forwards the model's zoom edits unchanged", async () => {
  const take = await editor();
  try {
    const setup = native.callTool.mock.calls.map(([request]) => request);
    expect(setup.map((request) => request.name)).toEqual(["createProject", "setEditorSettings"]);
    expect(setup[1].arguments).not.toHaveProperty("autoFocusAll");
    expect(setup[1].arguments).not.toHaveProperty("formatFollowCursor");
    expect(setup[1].arguments.cursor).toMatchObject({
      size: 1.5,
      smoothing: 0,
      clickBounce: 2,
      clickImpact: false,
    });
    expect(setup[1].arguments).toMatchObject({
      padding: 24,
      borderRadius: 0,
      backgroundBlur: 1,
      aspectRatio: "16:9",
      shadowIntensity: 0.5,
    });
    const regions = [
      {
        startSec: 4,
        endSec: 6,
        customScale: 1.1,
        focusMode: "manual",
        focus: { cx: 0.3, cy: 0.4 },
      },
    ];
    await take.call({ operation: "addZooms", arguments: { regions } });
    expect(native.callTool.mock.calls.at(-1)?.[0]).toEqual({
      name: "addZooms",
      arguments: { projectId: "take-project", regions },
    });
    await take.call({ operation: "addAutoZooms" });
    expect(native.callTool.mock.calls.at(-1)?.[0]).toEqual({
      name: "addAutoZooms",
      arguments: { projectId: "take-project" },
    });
    const count = native.callTool.mock.calls.length;
    await take.export();
    expect(native.callTool.mock.calls.slice(count).map(([r]) => r.name)).toEqual(["exportVideo"]);
  } finally {
    await take.close();
  }
});

it("uses native recording and pointer-track tools on the same connection without modifying event coordinates", async () => {
  native.callTool.mockImplementation(async ({ name }) => {
    if (name === "startRecording")
      return {
        content: [
          {
            type: "text",
            text: '{"recording":true,"startedAt":1000}\nRecording. Drive the app now.',
          },
        ],
      };
    if (name === "stopRecording")
      return reply({
        projectId: "native-take",
        videoPath: "/native/source.mp4",
        durationSec: 2,
        recordingStartedAt: 1000,
      });
    return reply({ applied: true });
  });
  const take = await startNativeCaptureRecording(
    "Isolated app",
    "/take/export.mp4",
    new AbortController().signal,
    {},
  );
  try {
    expect(take.recordingStartedAt).toBe(1000);
    await expect(take.call({ operation: "getCurrentDocument" })).rejects.toThrow(
      "Stop the native recording",
    );
    await take.stopRecording();
    const events = [{ at: 1200, x: 0.25, y: 0.4, click: true }];
    await take.setPointerTrack(events);
    expect(native.callTool).toHaveBeenLastCalledWith(
      { name: "setPointerTrack", arguments: { projectId: "native-take", events } },
      undefined,
      expect.any(Object),
    );
    expect(take.tools.some((tool) => tool.name === "setPointerTrack")).toBe(false);
    expect(
      NativeCaptureRequestSchema.safeParse({
        operation: "setPointerTrack",
        arguments: { events: [] },
      }).success,
    ).toBe(false);
    expect(native.callTool.mock.calls.some(([request]) => request.name === "createProject")).toBe(
      false,
    );
  } finally {
    await take.close();
  }
});
