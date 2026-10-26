import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  narrationService,
  prepareNarrationCapability,
  currentNarrationTrack,
  readNarrationState,
} from "../src/server/audio/narration";
import { createNarrationTools } from "../src/server/agents/capabilities/narration/tools";
import { narrationCapability } from "../src/server/agents/capabilities/narration/capability";
import {
  NarrationConfigSchema,
  type NarrationToolResult,
} from "../src/server/audio/narration-types";
import { agentCapabilities } from "../src/server/agents/capabilities/registry";
import { command } from "../src/server/runtime/process";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { BriefSchema } from "../src/shared/agents/schemas/video";
const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});
async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "narration-tools-"));
  folders.push(workspace);
  const request = VideoRequestSchema.parse({
    instructions: "Explain an example",
    speech: {
      mode: "narration",
      engine: "kokoro",
      voice: "af_heart",
      source: "provided",
      text: "Example",
    },
  });
  const brief = BriefSchema.parse({
    subject: "Example",
    audience: "Teams",
    objective: "Explain",
    facts: [],
    exactCopy: [],
    previewBeat: "Example",
    assetDescriptions: [],
    constraints: [],
    suggestedDuration: 10,
    durationReason: "Example",
  });
  await writeFile(path.join(workspace, "style-context.json"), JSON.stringify({ request, brief }));
  const config = NarrationConfigSchema.parse({
    duration: 10,
    profiles: { default: request.speech },
  });
  await mkdir(path.join(workspace, "audio"));
  const source = path.join(workspace, "audio/source.wav");
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-ar",
      "48000",
      "-ac",
      "2",
      source,
    ],
    workspace,
    new AbortController().signal,
  );
  const prepare = vi.fn(async () => ({
    file: "audio/source.wav",
    durationSeconds: 1,
    source: "narration" as const,
    cues: [{ text: "Example", startSeconds: 0, endSeconds: 1 }],
  }));
  const service = narrationService(workspace, config, { prepare, run: command });
  return { workspace, config, service, prepare, request };
}
const signal = () => new AbortController().signal;
it("creates measured narration and edits timing without resynthesizing speech", async () => {
  const f = await fixture();
  const created = await f.service.create(
    {
      cues: [
        { id: "first", text: "First", startSeconds: 1 },
        { id: "second", text: "Second", startSeconds: 4 },
      ],
    },
    signal(),
  );
  expect(created.track.cues.map((cue) => [cue.startSeconds, cue.endSeconds])).toEqual([
    [1, 2],
    [4, 5],
  ]);
  expect(f.prepare).toHaveBeenCalledTimes(2);
  const edited = await f.service.edit(
    { expectedRevision: created.revision, edits: [{ id: "first", startSeconds: 2 }] },
    signal(),
  );
  expect(f.prepare).toHaveBeenCalledTimes(2);
  expect(edited.track.cues[0]).toMatchObject({ text: "First", startSeconds: 2, endSeconds: 3 });
  expect(edited.segments[1]).toEqual(created.segments[1]);
  expect(await currentNarrationTrack(f.workspace)).toEqual(edited.track);
  const probe = JSON.parse(
    await command(
      "ffprobe",
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        path.join(f.workspace, edited.track.file),
      ],
      f.workspace,
      signal(),
    ),
  );
  expect(Number(probe.format.duration)).toBeCloseTo(5, 2);
  const changed = await f.service.edit(
    { expectedRevision: edited.revision, edits: [{ id: "second", text: "New sentence" }] },
    signal(),
  );
  expect(f.prepare).toHaveBeenCalledTimes(3);
  expect(changed.segments[0]).toEqual(edited.segments[0]);
});
it("rejects stale revisions, overlap and overrun while retaining accepted narration", async () => {
  const f = await fixture();
  const created = await f.service.create(
    {
      cues: [
        { id: "first", text: "First", startSeconds: 1 },
        { id: "second", text: "Second", startSeconds: 4 },
      ],
    },
    signal(),
  );
  await expect(
    f.service.edit(
      { expectedRevision: "stale", edits: [{ id: "first", startSeconds: 2 }] },
      signal(),
    ),
  ).rejects.toThrow("revision changed");
  await expect(
    f.service.edit(
      { expectedRevision: created.revision, edits: [{ id: "first", startSeconds: 4.5 }] },
      signal(),
    ),
  ).rejects.toThrow("overlaps");
  await expect(
    f.service.edit(
      { expectedRevision: created.revision, edits: [{ id: "second", startSeconds: 9.5 }] },
      signal(),
    ),
  ).rejects.toThrow("beyond");
  expect((await readNarrationState(f.workspace))?.revision).toBe(created.revision);
  expect(f.prepare).toHaveBeenCalledTimes(2);
  await expect(
    f.service.edit(
      { expectedRevision: created.revision, edits: [{ id: "first", startSeconds: 2 }] },
      AbortSignal.abort(),
    ),
  ).rejects.toThrow();
});
it("exposes create/edit over MCP with readable and structured results, serializing stale parallel edits", async () => {
  const f = await fixture();
  const server = createNarrationTools(f.workspace, f.config, f.service);
  const client = new Client({ name: "narration-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "create_narration",
      "edit_narration",
    ]);
    const result = await client.callTool({
      name: "create_narration",
      arguments: { cues: [{ id: "first", text: "First", startSeconds: 1 }] },
    });
    expect(result.content).toEqual([expect.objectContaining({ type: "text" })]);
    const data = result.structuredContent as NarrationToolResult;
    if (data.kind !== "narration") throw Error("Expected narration");
    const changes = await Promise.all(
      [2, 3].map((startSeconds) =>
        client.callTool({
          name: "edit_narration",
          arguments: {
            expectedRevision: data.state.revision,
            edits: [{ id: "first", startSeconds }],
          },
        }),
      ),
    );
    expect(changes.filter((change) => change.isError)).toHaveLength(1);
  } finally {
    await client.close();
    await server.close();
  }
});
it("registers narration only for configured writable production turns and preserves edits on resume", async () => {
  const f = await fixture();
  expect(narrationCapability(f.workspace)).toBeUndefined();
  await prepareNarrationCapability(f.workspace, f.request, 10);
  expect(await readNarrationState(f.workspace)).toBeUndefined();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(narrationCapability(f.workspace)?.enabledTools).toEqual([
    "create_narration",
    "edit_narration",
  ]);
  expect(agentCapabilities(f.workspace, true).servers.narration).toBeUndefined();
  expect(agentCapabilities(f.workspace, false, true).servers.narration).toBeUndefined();
  expect(agentCapabilities(f.workspace).servers.narration).toBeDefined();
  const state = await f.service.create(
    { cues: [{ id: "cue-1", text: "Example", startSeconds: 0 }] },
    signal(),
  );
  const edited = await f.service.edit(
    { expectedRevision: state.revision, edits: [{ id: "cue-1", startSeconds: 2 }] },
    signal(),
  );
  await prepareNarrationCapability(f.workspace, f.request, 10);
  expect((await readNarrationState(f.workspace))?.revision).toBe(edited.revision);
  await prepareNarrationCapability(
    f.workspace,
    VideoRequestSchema.parse({ instructions: "Silent example", speech: { mode: "off" } }),
    10,
  );
  expect(narrationCapability(f.workspace)).toBeUndefined();
  expect(await currentNarrationTrack(f.workspace)).toBeUndefined();
});
it("rejects narration audio escaping the job through a symlink", async () => {
  const f = await fixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "outside-narration-"));
  folders.push(outside);
  await writeFile(path.join(outside, "voice.wav"), "outside");
  await symlink(path.join(outside, "voice.wav"), path.join(f.workspace, "audio/escape.wav"));
  const prepare = vi.fn(async () => ({
    file: "audio/escape.wav",
    durationSeconds: 1,
    source: "narration" as const,
    cues: [],
  }));
  await expect(
    narrationService(f.workspace, f.config, { prepare, run: command }).create(
      { cues: [{ id: "first", text: "First", startSeconds: 0 }] },
      signal(),
    ),
  ).rejects.toThrow("inside the job");
  await expect(readFile(path.join(f.workspace, "audio/narration.json"))).rejects.toThrow();
});

it("preserves narration schemas and structured validation failures through registerTool", async () => {
  const f = await fixture();
  const server = createNarrationTools(f.workspace, f.config, f.service);
  const client = new Client({ name: "narration-contract-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);
    await client.connect(a);
    const { z } = await import("zod");
    const { CreateNarrationSchema, EditNarrationSchema } =
      await import("../src/server/audio/narration-types");
    const published = (await client.listTools()).tools;
    expect(published[0].inputSchema).toEqual(z.toJSONSchema(CreateNarrationSchema));
    expect(published[1].inputSchema).toEqual(z.toJSONSchema(EditNarrationSchema));
    for (const name of ["create_narration", "edit_narration"]) {
      const result = await client.callTool({ name, arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        kind: "error",
        message: expect.any(String),
      });
      expect(result.content).toEqual([{ type: "text", text: expect.any(String) }]);
    }
    expect(f.prepare).not.toHaveBeenCalled();
    const next = await client.callTool({
      name: "create_narration",
      arguments: { cues: [{ id: "first", text: "After failure", startSeconds: 0 }] },
    });
    expect(next.isError).not.toBe(true);
    expect(next.structuredContent).toMatchObject({ kind: "narration", action: "created" });
  } finally {
    await client.close();
    await server.close();
  }
});

it("cancels an active narration tool and releases its shared operation queue", async () => {
  const f = await fixture();
  let entered: (signal: AbortSignal) => void;
  const started = new Promise<AbortSignal>((resolve) => {
    entered = resolve;
  });
  const create = vi.spyOn(f.service, "create").mockImplementationOnce(async (_input, signal) => {
    entered(signal);
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Error("Cancelled narration")), { once: true });
    });
  });
  const server = createNarrationTools(f.workspace, f.config, f.service);
  const client = new Client({ name: "narration-cancel-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const controller = new AbortController();
  try {
    await server.connect(b);
    await client.connect(a);
    const input = { cues: [{ id: "first", text: "Example", startSeconds: 0 }] };
    const pending = client.callTool({ name: "create_narration", arguments: input }, undefined, {
      signal: controller.signal,
    });
    const signal = await started;
    const cancelled = new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    controller.abort();
    await expect(pending).rejects.toThrow();
    await cancelled;
    create.mockRestore();
    const next = await client.callTool({ name: "create_narration", arguments: input });
    expect(next.isError).not.toBe(true);
    expect(next.structuredContent).toMatchObject({ kind: "narration", action: "created" });
  } finally {
    controller.abort();
    create.mockRestore();
    await client.close();
    await server.close();
  }
});
