import { type Production } from "../src/shared/agents/schemas/video";
import { beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
vi.mock("../src/server/runtime/process", () => ({ isolatedCommand: vi.fn(), command: vi.fn() }));
import { isolatedCommand } from "../src/server/runtime/process";
import { renderJob } from "../src/server/domains/video/render";
import { VideoQaError, VideoQaReportError } from "../src/server/domains/video/qa";
import type { VideoGenerationJob } from "../src/shared/domains/video";
const pass = { ok: true, findings: [] };
const report = {
  ok: false,
  browserSkipped: false,
  lint: pass,
  runtime: pass,
  motion: pass,
  contrast: pass,
  layout: {
    ok: false,
    findings: [
      {
        severity: "error",
        code: "content_overlap",
        selector: "#label",
        time: 1.5,
        text: "A label",
      },
    ],
  },
  snapshots: { files: ["snapshots/frame.png"] },
};
beforeEach(() => vi.clearAllMocks());
it("retains structured failing stdout independently of stderr and a failed process exit", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "video-qa-"));
  try {
    await writeFile(path.join(workspace, "index.html"), '<div data-composition-id="video"></div>');
    const production: Production = {
      pipeline: "HyperFrames",
      fallbackReason: null,
      styleRenderer: ["SVG"],
      motionEngine: ["GSAP"],
      sourceFile: "index.html",
      duration: 3,
      width: 1280,
      height: 720,
      audioDescription: "Silent",
      limitations: [],
    };
    const job: VideoGenerationJob = {
      id: "job",
      runId: "project",
      candidateId: "direction",
      kind: "preview",
      duration: 3,
      phase: "validating",
      model: "main",
      workspace,
    };
    vi.mocked(isolatedCommand).mockImplementationOnce(
      async (_exe, args, _cwd, _signal, onOutput, _timeout, onStdout) => {
        expect(args).toContain("--json");
        expect(args).toContain("--snapshots");
        onOutput?.("Browser initialization log on stderr");
        onStdout?.(JSON.stringify(report));
        throw Error("Exited 1: truncated generic error");
      },
    );
    const error = await renderJob(job, production, new AbortController().signal, vi.fn()).catch(
      (error) => error,
    );
    expect(error).toBeInstanceOf(VideoQaError);
    expect(error.findings[0]).toMatchObject({
      focus: "layout",
      cheapEligible: true,
      evidence: {
        diagnostics: [
          { renderer: "hyperframes", stage: "layout", details: { selector: "#label", time: 1.5 } },
        ],
      },
    });
    expect(
      JSON.parse(await readFile(path.join(workspace, "renders/qa-report.json"), "utf8")),
    ).toEqual(report);
    expect(isolatedCommand).toHaveBeenCalledTimes(1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
it("does not accept incomplete QA or hide a process failure behind a passing report", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "video-qa-incomplete-"));
  try {
    await writeFile(path.join(workspace, "index.html"), '<div data-composition-id="video"></div>');
    const production: Production = {
      pipeline: "HyperFrames",
      fallbackReason: null,
      styleRenderer: ["SVG"],
      motionEngine: ["GSAP"],
      sourceFile: "index.html",
      duration: 3,
      width: 1280,
      height: 720,
      audioDescription: "Silent",
      limitations: [],
    };
    const job: VideoGenerationJob = {
      id: "job",
      runId: "project",
      candidateId: "direction",
      kind: "preview",
      duration: 3,
      phase: "validating",
      model: "main",
      workspace,
    };
    vi.mocked(isolatedCommand).mockImplementationOnce(
      async (_exe, _args, _cwd, _signal, _output, _timeout, onStdout) => {
        onStdout?.(JSON.stringify({ ...report, ok: true, layout: pass, browserSkipped: true }));
        return "";
      },
    );
    await expect(
      renderJob(job, production, new AbortController().signal, vi.fn()),
    ).rejects.toBeInstanceOf(VideoQaError);
    vi.mocked(isolatedCommand).mockImplementationOnce(
      async (_exe, _args, _cwd, _signal, _output, _timeout, onStdout) => {
        onStdout?.(JSON.stringify({ ...report, ok: true, layout: pass }));
        throw Error("Unexpected process failure");
      },
    );
    await expect(renderJob(job, production, new AbortController().signal, vi.fn())).rejects.toThrow(
      "Unexpected process failure",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it.each(["broken JSON", JSON.stringify({ ok: true })])(
  "saves actionable QA diagnostics without treating an unreadable report as a video defect: %s",
  async (stdout) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "video-qa-report-"));
    try {
      await writeFile(
        path.join(workspace, "index.html"),
        '<div data-composition-id="video"></div>',
      );
      const production: Production = {
        pipeline: "HyperFrames",
        fallbackReason: null,
        styleRenderer: ["SVG"],
        motionEngine: ["GSAP"],
        sourceFile: "index.html",
        duration: 3,
        width: 1280,
        height: 720,
        audioDescription: "Silent",
        limitations: [],
      };
      const job: VideoGenerationJob = {
        id: "job",
        runId: "project",
        candidateId: "direction",
        kind: "preview",
        duration: 3,
        phase: "validating",
        model: "main",
        workspace,
      };
      vi.mocked(isolatedCommand).mockImplementationOnce(
        async (_exe, _args, _cwd, _signal, _output, _timeout, onStdout) => {
          onStdout?.(stdout);
          return stdout;
        },
      );
      const error = await renderJob(job, production, new AbortController().signal, vi.fn()).catch(
        (error) => error,
      );
      expect(error).toBeInstanceOf(VideoQaReportError);
      expect(error).not.toBeInstanceOf(VideoQaError);
      const diagnostics = JSON.parse(
        await readFile(path.join(workspace, "renders/qa-report-error.json"), "utf8"),
      );
      expect(diagnostics.issue).toContain(
        stdout === "broken JSON" ? "not valid JSON" : "required report schema",
      );
      expect(diagnostics.expectedFix).toContain("Do not modify the video");
      expect(diagnostics.evidence.schemaIssues.length).toBeGreaterThan(0);
      expect(await readFile(path.join(workspace, "renders/qa-stdout.txt"), "utf8")).toBe(stdout);
      expect(isolatedCommand).toHaveBeenCalledTimes(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
