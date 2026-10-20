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
  nativeCaptureOperations,
} from "../src/server/capture/native-editor";

const reply = (data: unknown, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  isError,
});
beforeEach(() => {
  vi.clearAllMocks();
  native.close.mockResolvedValue(undefined);
  native.listTools.mockResolvedValue({
    tools: ["createProject", "setEditorSettings", "exportVideo", ...nativeCaptureOperations].map(
      (name) => ({
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
      }),
    ),
  });
  native.callTool.mockImplementation(async ({ name }) =>
    name === "createProject" ? reply({ projectId: "take-project" }) : reply({ applied: true }),
  );
});
const editor = () =>
  createNativeCaptureEditor(
    "/take/source.mp4",
    "/take/export.mp4",
    new AbortController().signal,
    { cursorTheme: "studio-ink", framing: { padding: 5 } },
    [],
  );

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
    expect(native.callTool.mock.calls.slice(-2).map(([request]) => request.name)).toEqual([
      "addAutoZooms",
      "exportVideo",
    ]);
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
  } finally {
    await take.close();
  }
});
it("preserves native partial outcomes and errors, and never exports after a native zoom failure", async () => {
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
    native.callTool.mockResolvedValueOnce(reply({ message: "Cannot read clicks" }, true));
    await expect(take.export()).rejects.toThrow("auto zoom failed");
    expect(native.callTool.mock.calls.at(-1)?.[0].name).toBe("addAutoZooms");
  } finally {
    await take.close();
  }
});
it("closes the native connection when setup fails", async () => {
  native.callTool.mockResolvedValueOnce(reply({ message: "Import failed" }, true));
  await expect(editor()).rejects.toThrow("createProject failed");
  expect(native.close).toHaveBeenCalledOnce();
});

it("applies caller-requested zooms before auto zoom and reports partial native refusals", async () => {
  native.callTool.mockImplementation(async ({ name }) => {
    if (name === "createProject") return reply({ projectId: "take-project" });
    if (name === "getCurrentDocument")
      return reply({ zoomRanges: [{ id: "old-focus", startSec: 1, endSec: 3 }] });
    if (name === "addZooms") return reply({ appliedCount: 0, refusedCount: 1 });
    return reply({ applied: true });
  });
  await expect(
    createNativeCaptureEditor(
      "/take/source.mp4",
      "/take/export.mp4",
      new AbortController().signal,
      {},
      [
        {
          id: "field",
          startMs: 1500,
          endMs: 2500,
          depth: 3,
          customScale: 1.1,
          focus: { cx: 0.5, cy: 0.6 },
          focusMode: "manual",
          source: "manual",
        },
      ],
    ),
  ).rejects.toThrow("requested zoom failed");
  expect(native.callTool).toHaveBeenCalledWith(
    { name: "removeModifier", arguments: { projectId: "take-project", id: "old-focus" } },
    undefined,
    expect.any(Object),
  );
  expect(native.callTool).toHaveBeenLastCalledWith(
    {
      name: "addZooms",
      arguments: {
        projectId: "take-project",
        regions: [
          {
            startSec: 1.5,
            endSec: 2.5,
            depth: 3,
            focus: { cx: 0.5, cy: 0.6 },
            focusMode: "manual",
          },
        ],
      },
    },
    undefined,
    expect.any(Object),
  );
  expect(native.close).toHaveBeenCalledOnce();
});

it("passes an explicitly requested scale using native zoom operations without conflicting defaults", async () => {
  native.callTool.mockImplementation(async ({ name, arguments: args }) => {
    if (name === "createProject") return reply({ projectId: "take-project" });
    if (name === "getCurrentDocument") return reply({ zoomRanges: [] });
    if (name === "addZooms") {
      if (args.regions.some((region: Record<string, unknown>) => "customScale" in region))
        return reply({ error: "Pass depth or customScale, not both" }, true);
      return reply({
        appliedCount: 1,
        refusedCount: 0,
        applied: [{ index: 0, zoomId: "field-zoom" }],
      });
    }
    return reply({ applied: true });
  });
  const take = await createNativeCaptureEditor(
    "/take/source.mp4",
    "/take/export.mp4",
    new AbortController().signal,
    {},
    [
      {
        id: "field",
        startMs: 1500,
        endMs: 2500,
        depth: 3,
        customScale: 1.1,
        focus: { cx: 0.5, cy: 0.6 },
        focusMode: "manual",
        source: "manual",
      },
    ],
  );
  try {
    expect(native.callTool).toHaveBeenCalledWith(
      {
        name: "addZooms",
        arguments: {
          projectId: "take-project",
          regions: [
            {
              startSec: 1.5,
              endSec: 2.5,
              depth: 3,
              focus: { cx: 0.5, cy: 0.6 },
              focusMode: "manual",
            },
          ],
        },
      },
      undefined,
      expect.any(Object),
    );
    expect(native.callTool).toHaveBeenLastCalledWith(
      {
        name: "setZoom",
        arguments: { projectId: "take-project", zoomId: "field-zoom", customScale: 1.1 },
      },
      undefined,
      expect.any(Object),
    );
  } finally {
    await take.close();
  }
});
