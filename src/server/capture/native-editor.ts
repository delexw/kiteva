import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { openScreenExecutable } from "./openscreen";
import { systemEnvironment } from "../runtime/platform";
import { videoRenderTimeoutMs } from "../rendering/timeouts";
import { resolveCapturePresentation, type CapturePresentationInput } from "./presentation";
import type { NativePointerEvent } from "./browser-pointer-track";

export const nativeCapturePolicy = "openscreen-window-event-cursor-v4";

// Native take operations; project identity and recording lifecycle remain bound by the adapter.
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
  "addAutoZooms",
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
  operation: NativeCaptureOperationSchema.optional(),
  content: z.array(z.union([TextSchema, ImageSchema])),
  data: z.unknown(),
  isError: z.boolean().optional(),
});
export type NativeCaptureReply = z.infer<typeof NativeCaptureReplySchema>;
export const EditableCaptureSchema = z.object({
  kind: z.literal("editable_capture"),
  recordingId: z.string().uuid(),
  duration: z.number().positive(),
  recordingStartedAt: z.number().optional(),
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
async function openNativeCapture(
  source: string | { window: string },
  output: string,
  signal: AbortSignal,
  presentation: CapturePresentationInput,
) {
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
        try {
          data = JSON.parse(text.split("\n", 1)[0]);
        } catch {
          data = text;
        }
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
      ...(typeof source === "string" ? ["createProject"] : ["startRecording", "stopRecording"]),
      "setEditorSettings",
      "exportVideo",
      "setPointerTrack",
      ...nativeCaptureOperations,
    ])
      if (!tools.some((tool) => tool.name === name))
        throw Error(`OpenScreen is missing native tool ${name}; update OpenScreen`);
    let projectId: string | undefined;
    let recordingStartedAt: number | undefined;
    let recording = false;
    let stopped: { projectId: string; videoPath: string } | undefined;
    const applyPresentation = async () => {
      const settings = resolveCapturePresentation(presentation);
      const appearance = await invoke("setEditorSettings", {
        ...settings.framing,
        cursor: {
          theme: settings.cursorTheme,
          model3d: false,
          asArrow: ["text"],
          size: settings.cursorSize,
          smoothing: settings.cursorSmoothing,
          motionBlur: presentation.cursorMotionBlur,
          clickBounce: settings.cursorClickBounce,
          clickImpact: settings.cursorClickImpact,
        },
        projectId,
      });
      if (appearance.isError)
        throw Error(`OpenScreen presentation failed: ${JSON.stringify(appearance.data)}`);
    };
    if (typeof source === "string") {
      const created = await invoke("createProject", {
        videoPath: source,
        title: "Kiteva demonstration take",
      });
      if (created.isError)
        throw Error(`OpenScreen createProject failed: ${JSON.stringify(created.data)}`);
      projectId = z.object({ projectId: z.string().min(1) }).parse(created.data).projectId;
      await applyPresentation();
    } else {
      const started = await invoke("startRecording", {
        window: source.window,
        cursor: "editable-overlay",
        systemAudio: false,
        microphone: false,
        camera: false,
      });
      if (started.isError)
        throw Error(`OpenScreen startRecording failed: ${JSON.stringify(started.data)}`);
      recording = true;
      const metadata = z.object({ startedAt: z.number() }).parse(started.data);
      recordingStartedAt = metadata.startedAt;
    }
    const descriptions = supported.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema: {
        ...inputSchema,
        required: inputSchema.required?.filter((key) => !["projectId", "path"].includes(key)),
        properties: Object.fromEntries(
          Object.entries(inputSchema.properties ?? {}).filter(
            ([key]) => !["projectId", "path"].includes(key),
          ),
        ),
      },
    }));
    return {
      tools: descriptions,
      recordingStartedAt,
      async setPointerTrack(events: NativePointerEvent[]) {
        if (!projectId || recording) throw Error("Stop the native recording before editing");
        if (events.length === 0) return;
        const result = await invoke("setPointerTrack", { projectId, events });
        if (result.isError)
          throw Error(`OpenScreen pointer track failed: ${JSON.stringify(result.data)}`);
      },
      async stopRecording() {
        if (stopped) return stopped;
        if (!recording) throw Error("This native session has no active recording");
        const result = await invoke("stopRecording", { title: "Kiteva demonstration take" });
        if (result.isError)
          throw Error(`OpenScreen stopRecording failed: ${JSON.stringify(result.data)}`);
        stopped = z
          .object({ projectId: z.string().min(1), videoPath: z.string().min(1) })
          .parse(result.data);
        recording = false;
        projectId = stopped.projectId;
        await applyPresentation();
        return stopped;
      },
      async call(request: NativeCaptureRequest): Promise<NativeCaptureReply> {
        if (!projectId) throw Error("Stop the native recording before editing");
        const input = NativeCaptureRequestSchema.parse(request);
        // These fields would escape the take or read arbitrary files. Never forward them.
        for (const key of ["projectId", "path", "videoPath", "outputPath"])
          if (key in input.arguments)
            throw Error(`Native capture arguments cannot override ${key}`);
        return invoke(input.operation, { ...input.arguments, projectId });
      },
      async export() {
        if (!projectId) throw Error("Stop the native recording before exporting");
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
        try {
          if (recording && !signal.aborted)
            await invoke("stopRecording", { title: "Interrupted Kiteva take" });
        } finally {
          recording = false;
          await close();
        }
      },
    };
  } catch (error) {
    signal.removeEventListener("abort", abort);
    await close().catch(() => {});
    throw error;
  }
}

/** Imports an existing take for native review; used by saved recordings. */
export async function createNativeCaptureEditor(
  source: string,
  output: string,
  signal: AbortSignal,
  presentation: CapturePresentationInput,
) {
  const editor = await openNativeCapture(source, output, signal, presentation);
  return { tools: editor.tools, call: editor.call, export: editor.export, close: editor.close };
}

/** Records and edits on the same native MCP connection, for native review and export. */
export function startNativeCaptureRecording(
  window: string,
  output: string,
  signal: AbortSignal,
  presentation: CapturePresentationInput,
) {
  return openNativeCapture({ window }, output, signal, presentation);
}
