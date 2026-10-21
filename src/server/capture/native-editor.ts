import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { openScreenExecutable } from "./openscreen";
import { systemEnvironment } from "../runtime/platform";
import { videoRenderTimeoutMs } from "../rendering/timeouts";
import { CapturePresentationSchema, type CapturePresentationInput } from "./presentation";
import type { OpenScreenZoomRegion } from "./native-project";

// Only document operations: no desktop recording, other projects, imports or arbitrary file writes.
export const nativeCaptureOperations = [
  "getCurrentDocument",
  "getCursorTrack",
  "getFrames",
  "addTrims",
  "setTrim",
  "removeTrim",
  "addSpeed",
  "setSpeed",
  "addZooms",
  "setZoom",
  "removeModifier",
  "addAnnotation",
  "setAnnotation",
  "createCheckpoint",
  "restoreCheckpoint",
] as const;
export const NativeCaptureOperationSchema = z.enum(nativeCaptureOperations);
export const NativeCaptureRequestSchema = z
  .object({
    operation: NativeCaptureOperationSchema,
    arguments: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type NativeCaptureRequest = z.input<typeof NativeCaptureRequestSchema>;
const ImageSchema = z.object({ type: z.literal("image"), data: z.string(), mimeType: z.string() });
const TextSchema = z.object({ type: z.literal("text"), text: z.string() });
export const NativeCaptureReplySchema = z.object({
  kind: z.literal("native_capture"),
  content: z.array(z.union([TextSchema, ImageSchema])),
  data: z.unknown(),
  isError: z.boolean().optional(),
});
export type NativeCaptureReply = z.infer<typeof NativeCaptureReplySchema>;
export const EditableCaptureSchema = z.object({
  kind: z.literal("editable_capture"),
  recordingId: z.string().uuid(),
  duration: z.number().positive(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      inputSchema: z.record(z.string(), z.unknown()),
    }),
  ),
});
export type EditableCapture = z.infer<typeof EditableCaptureSchema>;

/** A native MCP connection scoped to one take. OpenScreen owns every edit and its time mapping. */
export async function createNativeCaptureEditor(
  source: string,
  output: string,
  signal: AbortSignal,
  presentation: CapturePresentationInput,
  zooms: OpenScreenZoomRegion[],
) {
  const cursorSmoothing = CapturePresentationSchema.shape.cursorSmoothing.parse(
    presentation.cursorSmoothing,
  );
  const client = new Client({ name: "kiteva-capture", version: "1" });
  const transport = new StdioClientTransport({
    command: await openScreenExecutable(),
    args: ["mcp"],
    env: Object.fromEntries(
      Object.entries(systemEnvironment()).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    stderr: "pipe",
  });
  const close = () => client.close();
  const abort = () => {
    void close().catch(() => {});
  };
  const invoke = async (name: string, args: Record<string, unknown>) => {
    signal.throwIfAborted();
    const result = await client.callTool({ name, arguments: args }, undefined, {
      signal,
      timeout: videoRenderTimeoutMs,
    });
    const content = z.array(z.union([TextSchema, ImageSchema])).parse(result.content);
    const text = content.find((item) => item.type === "text")?.text;
    let data: unknown = result.structuredContent;
    if (data === undefined && text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { kind: "native_capture" as const, content, data, isError: result.isError === true };
  };
  try {
    await client.connect(transport);
    transport.stderr?.on("data", () => {});
    signal.addEventListener("abort", abort, { once: true });
    signal.throwIfAborted();
    const tools = (await client.listTools()).tools;
    const supported = tools.filter((tool) =>
      nativeCaptureOperations.some((name) => name === tool.name),
    );
    for (const name of [
      "createProject",
      "setEditorSettings",
      "exportVideo",
      ...nativeCaptureOperations,
    ])
      if (!tools.some((tool) => tool.name === name))
        throw Error(`OpenScreen is missing native tool ${name}; update OpenScreen`);
    const created = await invoke("createProject", {
      videoPath: source,
      title: "Kiteva demonstration take",
    });
    if (created.isError)
      throw Error(`OpenScreen createProject failed: ${JSON.stringify(created.data)}`);
    const { projectId } = z.object({ projectId: z.string().min(1) }).parse(created.data);
    const appearance = await invoke("setEditorSettings", {
      ...presentation.framing,
      ...(presentation.framing?.aspectRatio === "native" ? { aspectRatio: "auto" } : {}),
      autoFocusAll: false,
      formatFollowCursor: false,
      cursor: {
        theme: presentation.cursorTheme,
        model3d: false,
        asArrow: ["text"],
        size: presentation.cursorSize,
        smoothing: cursorSmoothing,
        motionBlur: presentation.cursorMotionBlur,
        clickBounce: presentation.cursorClickBounce,
        clickImpact: presentation.cursorClickImpact,
      },
      projectId,
    });
    if (appearance.isError)
      throw Error(`OpenScreen presentation failed: ${JSON.stringify(appearance.data)}`);
    // New projects can inherit click-planned zooms. Start wide so the agent owns every focus decision.
    {
      const document = await invoke("getCurrentDocument", { projectId });
      if (document.isError) throw Error("Cannot read initial OpenScreen zooms");
      const snapshot = z
        .object({
          zoomRanges: z.array(
            z.object({ id: z.string(), startSec: z.number(), endSec: z.number() }),
          ),
        })
        .parse(document.data);
      for (const existing of snapshot.zoomRanges) {
        const removed = await invoke("removeModifier", { projectId, id: existing.id });
        if (removed.isError)
          throw Error(`OpenScreen focus replacement failed: ${JSON.stringify(removed.data)}`);
      }
    }
    if (zooms.length) {
      const result = await invoke("addZooms", {
        projectId,
        regions: zooms.map((zoom) => ({
          startSec: zoom.startMs / 1000,
          endSec: zoom.endMs / 1000,
          depth: zoom.depth,
          focus: zoom.focus,
          focusMode: zoom.focusMode,
        })),
      });
      const outcome = z
        .object({
          refusedCount: z.number(),
          applied: z.array(z.object({ index: z.number().int().nonnegative(), zoomId: z.string() })),
        })
        .safeParse(result.data);
      if (result.isError || !outcome.success || outcome.data.refusedCount > 0)
        throw Error(`OpenScreen requested zoom failed: ${JSON.stringify(result.data)}`);
      // addZooms defaults depth even with customScale; setZoom accepts the scale without that default.
      for (const added of outcome.data.applied) {
        const customScale = zooms[added.index]?.customScale;
        if (customScale === undefined) continue;
        const resized = await invoke("setZoom", { projectId, zoomId: added.zoomId, customScale });
        if (resized.isError)
          throw Error(`OpenScreen requested zoom scale failed: ${JSON.stringify(resized.data)}`);
      }
    }
    const descriptions = supported.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema: {
        ...inputSchema,
        properties: Object.fromEntries(
          Object.entries(inputSchema.properties ?? {}).filter(
            ([key]) => !["projectId", "path"].includes(key),
          ),
        ),
      },
    }));
    return {
      tools: descriptions,
      async call(request: NativeCaptureRequest): Promise<NativeCaptureReply> {
        const input = NativeCaptureRequestSchema.parse(request);
        // These fields would escape the take or read arbitrary files. Never forward them.
        for (const key of ["projectId", "path", "videoPath", "outputPath"])
          if (key in input.arguments)
            throw Error(`Native capture arguments cannot override ${key}`);
        return invoke(input.operation, { ...input.arguments, projectId });
      },
      async export() {
        // Export the reviewed native document without filling deliberately wide sections with zooms.
        const result = await invoke("exportVideo", {
          projectId,
          path: output,
          fps: 60,
          quality: "source",
        });
        if (result.isError) throw Error(`OpenScreen export failed: ${JSON.stringify(result.data)}`);
      },
      async close() {
        signal.removeEventListener("abort", abort);
        await close();
      },
    };
  } catch (error) {
    signal.removeEventListener("abort", abort);
    await close().catch(() => {});
    throw error;
  }
}
