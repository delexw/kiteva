import {
  prepareProjectLayout,
  projectArtifactPath,
  renderInputRoot,
  workspacePaths,
} from "../src/server/runtime/workspace";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { VideoGenerationJob } from "../src/shared/domains/video";
import type { Production } from "../src/shared/agents/schemas/video";
vi.mock("../src/server/rendering/multiplane", async (load) => ({
  ...(await load<typeof import("../src/server/rendering/multiplane")>()),
  runMultiplane: vi.fn(),
}));
vi.mock("../src/server/rendering/multiplane/recovery-cache", () => ({
  createMultiplaneRecoveryCache: async () => undefined,
}));
vi.mock("../src/server/rendering/multiplane/cache", async (load) => ({
  ...(await load<typeof import("../src/server/rendering/multiplane/cache")>()),
  multiplaneInputFingerprint: async () => null,
}));
import { runMultiplane } from "../src/server/rendering/multiplane";
import {
  RendererDiagnosticError,
  formatMultiplaneDiagnostic,
} from "../src/server/rendering/diagnostics";
import { renderJob } from "../src/server/domains/video/render";
import { videoFailureFindings } from "../src/server/domains/video/correction-bypass";
import { correctionIdentity } from "../src/server/agents/correction-identity";

it.each([
  { bypass: false, structured: false },
  { bypass: true, structured: false },
  { bypass: true, structured: true },
])(
  "native verification continues to export only with the dual-model exception (%s)",
  async ({ bypass, structured }) => {
    vi.mocked(runMultiplane).mockReset();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "reviewed-check-"));
    try {
      if (structured) await prepareProjectLayout(workspace);
      const source = projectArtifactPath(workspace, "scene.html");
      await writeFile(path.join(workspace, source), "<p>Title</p>");
      const audioFile = `${workspacePaths(workspace).assets}/score.wav`;
      await mkdir(path.dirname(path.join(workspace, audioFile)), { recursive: true });
      await writeFile(path.join(workspace, audioFile), "local-audio-fixture");
      const production: Production = {
        audioFile,
        pipeline: "Multiplane",
        fallbackReason: null,
        sourceFile: source,
        duration: 3,
        width: 1280,
        height: 720,
        fps: 30,
        styleRenderer: ["HTML"],
        motionEngine: ["Time"],
        audioDescription: "Silent",
        limitations: [],
      };
      const job: VideoGenerationJob = {
        id: "job",
        runId: "project",
        candidateId: "direction",
        kind: "full",
        duration: 3,
        phase: "rendering",
        model: "main",
        workspace,
      };
      const error = new RendererDiagnosticError("Repeated frames differ", [
        {
          ...formatMultiplaneDiagnostic("verify", {
            code: "nondeterministic_output",
            severity: "error",
            message: "36 pixels differ",
          }),
          location: { file: "scene.html", line: null, column: null },
        },
      ]);
      if (bypass)
        job.correctionBypasses = [
          {
            issueKey: correctionIdentity(videoFailureFindings(error)[0]),
            decisions: [
              { model: "small", outcome: { status: "unresolved", reason: "Cannot fix." } },
              { model: "main", outcome: { status: "refused", reason: "No justified repair." } },
            ],
          },
        ];
      vi.mocked(runMultiplane).mockImplementation(async (command) => {
        if (command === "inspect")
          return {
            type: "result",
            ok: true,
            data: { stage: { width: 1280, height: 720 }, duration: 3, fps: 30 },
          };
        if (command === "verify") throw error;
        throw Error("Export reached; an export failure must still propagate");
      });
      const emit = vi.fn();
      await expect(renderJob(job, production, new AbortController().signal, emit)).rejects.toThrow(
        bypass ? "Export reached" : "Repeated frames differ",
      );
      expect(vi.mocked(runMultiplane).mock.calls.map(([command]) => command)).toEqual(
        bypass ? ["inspect", "verify", "render"] : ["inspect", "verify"],
      );
      if (structured) {
        expect(
          vi
            .mocked(runMultiplane)
            .mock.calls.every((call) => call[2] === renderInputRoot(workspace)),
        ).toBe(true);
        for (const call of vi.mocked(runMultiplane).mock.calls) {
          expect(call[1][2]).toBe(path.join(workspace, source));
        }
        const renderArgs = vi.mocked(runMultiplane).mock.calls[2][1];
        expect(renderArgs[renderArgs.indexOf("--audio") + 1]).toBe(path.join(workspace, audioFile));
        expect(renderArgs[renderArgs.indexOf("--job-dir") + 1]).toBe(
          path.join(workspace, workspacePaths(workspace).multiplaneJobs),
        );
      }
      if (bypass)
        expect(emit).toHaveBeenCalledWith(
          "warning",
          expect.any(String),
          expect.objectContaining({ correctionBypass: job.correctionBypasses![0] }),
        );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);

it.each([false, true])(
  "resolves every full-film shot against the workspace (structured=%s)",
  async (structured) => {
    vi.mocked(runMultiplane).mockReset();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "full-film-paths-"));
    try {
      if (structured) await prepareProjectLayout(workspace);
      const sources = ["first.html", "second.html"].map((name) =>
        projectArtifactPath(workspace, name),
      );
      for (const source of sources) await writeFile(path.join(workspace, source), "<p>Scene</p>");
      const production: Production = {
        pipeline: "Multiplane",
        fallbackReason: null,
        sourceFile: sources[0],
        shots: sources.map((sourceFile) => ({ sourceFile, duration: 3 })),
        duration: 6,
        width: 1280,
        height: 720,
        fps: 30,
        styleRenderer: ["HTML"],
        motionEngine: ["Time"],
        audioDescription: "Silent",
        limitations: [],
      };
      const job: VideoGenerationJob = {
        id: "job",
        runId: "project",
        candidateId: "direction",
        kind: "full",
        duration: 6,
        phase: "rendering",
        model: "main",
        workspace,
      };
      let rendered = 0;
      vi.mocked(runMultiplane).mockImplementation(async (command) => {
        if (command === "render" && ++rendered === 2) throw Error("Second shot export reached");
        return {
          type: "result",
          ok: true,
          data: { stage: { width: 1280, height: 720 }, duration: 3, fps: 30 },
        };
      });
      await expect(
        renderJob(job, production, new AbortController().signal, vi.fn()),
      ).rejects.toThrow("Second shot export reached");
      const calls = vi.mocked(runMultiplane).mock.calls;
      expect(calls).toHaveLength(6);
      for (const [index, source] of sources.entries()) {
        const shotCalls = calls.filter(
          (call) => call[1][2] === (structured ? path.join(workspace, source) : source),
        );
        expect(shotCalls.map(([command]) => command)).toEqual(["inspect", "verify", "render"]);
        for (const call of shotCalls) {
          expect(call[2]).toBe(renderInputRoot(workspace));
          if (call[0] === "render") {
            expect(call[1]).not.toContain("--audio");
            expect(call[1]).not.toContain("--workers");
            const output = call[1][call[1].indexOf("--out") + 1];
            expect(path.resolve(call[2], output)).toBe(
              path.join(workspace, workspacePaths(workspace).renders, "shots", `shot-${index}.mp4`),
            );
          }
          if (call[0] === "verify") expect(call[1]).not.toContain("--workers");
        }
      }
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
