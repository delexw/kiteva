import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { deferred } from "./fixtures/deferred";
import { prepareProjectLayout, workspaceFolders } from "../src/server/runtime/workspace";
import type { VideoGenerationJob } from "../src/shared/domains/video";
import type { Production } from "../src/shared/agents/schemas/video";
vi.mock("../src/server/rendering/multiplane", async (load) => ({
  ...(await load<typeof import("../src/server/rendering/multiplane")>()),
  runMultiplane: vi.fn(),
}));
vi.mock("../src/server/rendering/multiplane/cache", async (load) => ({
  ...(await load<typeof import("../src/server/rendering/multiplane/cache")>()),
  multiplaneInputFingerprint: async () => undefined,
}));
vi.mock("../src/server/rendering/multiplane/recovery-cache", () => ({
  createMultiplaneRecoveryCache: vi.fn(),
}));
vi.mock("../src/server/rendering/multiplane/shots", async (load) => ({
  ...(await load<typeof import("../src/server/rendering/multiplane/shots")>()),
  assembleMultiplaneShots: vi.fn(),
}));
import { runMultiplane } from "../src/server/rendering/multiplane";
import { createMultiplaneRecoveryCache } from "../src/server/rendering/multiplane/recovery-cache";
import { assembleMultiplaneShots } from "../src/server/rendering/multiplane/shots";
import { renderMultiplane } from "../src/server/domains/video/multiplane-render";

it("combines restored and sequential fresh shots, aggregates progress and assembles in manifest order", async () => {
  vi.clearAllMocks();
  const workspace = await mkdtemp(path.join(os.tmpdir(), "native-worker-film-"));
  try {
    await prepareProjectLayout(workspace);
    const sources = [0, 1, 2].map((index) => `${workspaceFolders.shots}/scene-${index}.html`);
    for (const file of sources) await writeFile(path.join(workspace, file), "<p>Local fixture</p>");
    const production: Production = {
      pipeline: "Multiplane",
      fallbackReason: null,
      sourceFile: sources[0],
      shots: sources.map((sourceFile, index) => ({ sourceFile, duration: index + 1 })),
      duration: 6,
      width: 320,
      height: 180,
      styleRenderer: ["HTML"],
      motionEngine: ["Time"],
      audioDescription: "Silent",
      limitations: [],
    };
    const job: VideoGenerationJob = {
      id: "job",
      runId: "project",
      candidateId: "direction",
      kind: "preview",
      phase: "rendering",
      model: "fixture",
      duration: 6,
      workspace,
    };
    const store = vi.fn(async () => {});
    vi.mocked(createMultiplaneRecoveryCache).mockResolvedValue({
      restore: vi.fn(async (source) => source === sources[0]),
      store,
    });
    const gates = [deferred(), deferred()];
    const started: string[] = [],
      finished: string[] = [];
    vi.mocked(runMultiplane).mockImplementation(
      async (_command, args, _workspace, signal, progress) => {
        const source = path.basename(args[2]);
        started.push(source);
        progress?.("capture: 1/60 frames");
        await gates[source === "scene-1.html" ? 0 : 1].promise;
        signal.throwIfAborted();
        finished.push(source);
        return { type: "result", ok: true };
      },
    );
    const emit = vi.fn();
    const running = renderMultiplane(
      job,
      production,
      path.join(workspace, workspaceFolders.renders, "preview.webm"),
      30,
      new AbortController().signal,
      emit,
    );
    await vi.waitFor(() => expect(started).toEqual(["scene-1.html"]));
    expect(finished).toEqual([]);
    gates[0].resolve();
    await vi.waitFor(() => expect(started).toEqual(["scene-1.html", "scene-2.html"]));
    expect(finished).toEqual(["scene-1.html"]);
    gates[1].resolve();
    await running;
    expect(createMultiplaneRecoveryCache).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledTimes(2);
    expect(assembleMultiplaneShots).toHaveBeenCalledWith(
      expect.objectContaining({ parts: ["shot-0.webm", "shot-1.webm", "shot-2.webm"] }),
    );
    const samples = emit.mock.calls
      .filter(([type]) => type === "render_progress")
      .map(([, , data]) => data as { completedFrames: number; totalFrames: number });
    expect(samples.length).toBeGreaterThan(3);
    expect(samples.map((sample) => sample.completedFrames)).toEqual(
      samples.map((sample) => sample.completedFrames).sort((a, b) => a - b),
    );
    expect(samples.at(-1)).toMatchObject({ completedFrames: 180, totalFrames: 180 });
    for (const [, args] of vi.mocked(runMultiplane).mock.calls)
      expect(args).not.toContain("--workers");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
