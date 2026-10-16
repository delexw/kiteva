import { beforeEach, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProductionSchema } from "../src/shared/agents/schemas/video";
import { VideoRequestSchema } from "../src/shared/domains/video";
import {
  multiplaneVersion,
  rendererPipelineProblem,
  videoRendererOf,
} from "../src/shared/video-renderers";
vi.mock("../src/server/runtime/process", () => ({ command: vi.fn(), isolatedCommand: vi.fn() }));
vi.mock("../src/server/rendering/webm-video", async (load) => ({
  ...(await load<typeof import("../src/server/rendering/webm-video")>()),
  transcodePreviewToWebm: vi.fn(async () => ({ similarity: 0.99, bytes: 10 })),
}));
import { command, isolatedCommand } from "../src/server/runtime/process";
import { transcodePreviewToWebm } from "../src/server/rendering/webm-video";
import {
  multiplaneProgress,
  multiplaneRenderArgs,
  multiplaneResult,
  multiplaneShotProblems,
  multiplaneDiagnostics,
  multiplaneFailure,
  runMultiplane,
} from "../src/server/rendering/multiplane";
import { renderJob } from "../src/server/domains/video/render";
import { renderContract } from "../src/server/domains/video/prompts";

const result = (command: string, ok: boolean, data: Record<string, unknown> = {}, extra = {}) =>
  JSON.stringify({
    schema: "multiplane/1",
    type: "result",
    command,
    ok,
    code: ok ? null : "lint_failed",
    data,
    ...extra,
  });
const production = (pipeline: "Multiplane" | "HyperFrames") =>
  ProductionSchema.parse({
    pipeline,
    fallbackReason: null,
    styleRenderer: ["SVG"],
    motionEngine: ["GSAP"],
    sourceFile: pipeline === "Multiplane" ? "shot.html" : "index.html",
    duration: 3,
    width: 1280,
    height: 720,
    fps: 30,
    audioDescription: "Silent",
    limitations: [],
  });
const job = (workspace: string, kind: "preview" | "full" = "preview") => ({
  id: "job",
  runId: "project",
  candidateId: "candidate",
  kind,
  phase: "rendering" as const,
  model: "example",
  workspace,
  duration: 3,
});
const ffprobe = (codec: string) =>
  JSON.stringify({
    streams: [
      { codec_type: "video", codec_name: codec, width: 1280, height: 720, avg_frame_rate: "30/1" },
    ],
    format: { duration: "3" },
  });
beforeEach(() => vi.clearAllMocks());

const lintFinding = (file: string, severity = "error") =>
  JSON.stringify({
    type: "finding",
    code: "unseeded_random",
    severity,
    message: "Unseeded randomness is nondeterministic.",
    hint: "Use a fixed seed.",
    location: { file, line: 10, column: 5757 },
    details: { snippet: "Math.random()" },
  });

it("forwards structured lint errors and warnings across output chunks and retains the full report", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "multiplane-diagnostics-"));
  const output = [
    lintFinding("vendor/gsap.min.js"),
    lintFinding("shot.html", "warning"),
    "non-json output",
    result("inspect", false, {}, { message: "Shot lint checks failed." }),
  ].join("\n");
  vi.mocked(isolatedCommand).mockImplementation(
    async (_exe, _args, _cwd, _signal, _output, _timeout, stdout) => {
      stdout?.(output.slice(0, 35));
      stdout?.(output.slice(35));
      throw Error("exited 1");
    },
  );
  const error = await runMultiplane("inspect", [], workspace, new AbortController().signal).catch(
    (error: Error) => error,
  );
  expect(error).toBeInstanceOf(Error);
  const message = (error as Error).message;
  expect(message).toContain("Shot lint checks failed.");
  expect(message).toContain('"column":5757');
  expect(message).toContain('"severity":"warning"');
  expect(message).toContain('"source":"bundled dependency"');
  expect(message).toContain('"source":"authored source"');
  expect(message).toContain("Use a fixed seed.");
  const report = message.match(/Complete diagnostic report: (.+)/)?.[1];
  expect(report).toBeTruthy();
  expect(await readFile(path.join(workspace, report!), "utf8")).toBe(output);
});

it("bounds repair messages without losing the saved findings and ignores malformed events", () => {
  const output = [
    "{",
    JSON.stringify({ type: "finding", code: 3 }),
    lintFinding("vendor/gsap.min.js"),
  ].join("\n");
  const findings = multiplaneDiagnostics(output);
  expect(findings).toHaveLength(1);
  const error = multiplaneFailure(
    "inspect",
    { type: "result", ok: false },
    Array(1000).fill(findings[0]),
    "report.jsonl",
  );
  expect(error.message.length).toBeLessThan(25000);
  expect(error.message).toContain("additional findings omitted");
  expect(error.message).toContain("report.jsonl");
});

it("retains warning reports for successful commands without failing the command", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "multiplane-warning-"));
  vi.mocked(isolatedCommand).mockImplementation(
    async (_exe, _args, _cwd, _signal, _output, _timeout, stdout) => {
      stdout?.(`${lintFinding("shot.html", "warning")}\n${result("inspect", true)}`);
      return "";
    },
  );
  expect((await runMultiplane("inspect", [], workspace, new AbortController().signal)).ok).toBe(
    true,
  );
});

it("keeps HyperFrames the default and lets a project choose the Multiplane trial", () => {
  expect(videoRendererOf(VideoRequestSchema.parse({ instructions: "A visual demo" }))).toBe(
    "hyperframes",
  );
  const trial = VideoRequestSchema.parse({ instructions: "A visual demo", renderer: "multiplane" });
  expect(videoRendererOf(trial)).toBe("multiplane");
  expect(
    VideoRequestSchema.safeParse({ instructions: "A visual demo", renderer: "blender" }).success,
  ).toBe(false);
  expect(rendererPipelineProblem("multiplane", "Multiplane")).toBeUndefined();
  expect(rendererPipelineProblem("multiplane", "HyperFrames")).toContain("shot.html");
  expect(rendererPipelineProblem("hyperframes", "Multiplane")).toContain("trial");
  expect(rendererPipelineProblem("hyperframes", "Remotion")).toBeUndefined();
});

it("builds Multiplane commands for silent WebM previews and MP4 films with one audio track", () => {
  const preview = multiplaneRenderArgs({
    shot: "shot.html",
    output: "renders/preview.webm",
    fps: 60,
    kind: "preview",
    audioFile: "music.wav",
  });
  expect(preview.slice(1, 3)).toEqual(["render", "shot.html"]);
  expect(preview).toEqual(expect.arrayContaining(["--json", "--no-hosted", "--overwrite"]));
  const value = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
  expect([
    value(preview, "--format"),
    value(preview, "--quality"),
    value(preview, "--fps"),
  ]).toEqual(["webm", "fast", "60"]);
  expect(preview).not.toContain("--audio");
  expect(preview).not.toContain("--draft");
  const full = multiplaneRenderArgs({
    shot: "shot.html",
    output: "renders/full.mp4",
    fps: 30,
    kind: "full",
    audioFile: "assets/mix.wav",
  });
  expect([value(full, "--format"), value(full, "--quality"), value(full, "--audio")]).toEqual([
    "mp4",
    "standard",
    "assets/mix.wav",
  ]);
  expect(
    multiplaneRenderArgs({
      shot: "shot.html",
      output: "renders/full.mp4",
      fps: 30,
      kind: "full",
      audioFile: null,
    }),
  ).not.toContain("--audio");
});

it("reads the final result line and frame progress from Multiplane's JSON events", () => {
  const stdout = [
    '{"type":"start","command":"render"}',
    '{"type":"progress","phase":"capture","done":30,"total":90}',
    "not json",
    result("render", true, { frames: 90 }),
    "",
  ].join("\n");
  expect(multiplaneResult(stdout)).toMatchObject({ ok: true, data: { frames: 90 } });
  expect(multiplaneResult("nothing here")).toBeUndefined();
  expect(multiplaneProgress('{"type":"progress","phase":"capture","done":30,"total":90}')).toBe(
    "capture: 30/90 frames",
  );
  expect(multiplaneProgress('{"type":"warning"}')).toBeUndefined();
  const expected = { width: 1280, height: 720, duration: 3, fps: 30 };
  expect(
    multiplaneShotProblems({ stage: { width: 1280, height: 720 }, duration: 3, fps: 30 }, expected),
  ).toEqual([]);
  expect(
    multiplaneShotProblems(
      { stage: { width: 1920, height: 1080 }, duration: 4, fps: 60 },
      expected,
    ),
  ).toHaveLength(3);
});

it("tells the agent the Multiplane shot contract with the exact output settings", () => {
  const contract = renderContract("multiplane", {
    width: 1440,
    height: 2560,
    duration: 12,
    fps: 60,
    kind: "full",
  });
  for (const text of [
    "shot.html",
    "width 1440px",
    "height 2560px",
    "duration: 12",
    "fps: 60",
    "audioFile",
    "pipeline to Multiplane",
  ])
    expect(contract).toContain(text);
  expect(
    renderContract("multiplane", {
      width: 1280,
      height: 720,
      duration: 3,
      fps: 30,
      kind: "preview",
    }),
  ).toContain("silent");
  const hyperframes = renderContract("hyperframes", {
    width: 1280,
    height: 720,
    duration: 3,
    fps: 30,
    kind: "preview",
  });
  expect(hyperframes).toContain("HyperFrames contract: standalone index.html");
  expect(hyperframes).toContain("durationInFrames=90");
  expect(hyperframes).not.toContain("Multiplane");
});

it("pins Multiplane in the app package and shares the app's single Three.js", async () => {
  const root = path.join(import.meta.dirname, "..");
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  expect(manifest.dependencies.multiplane).toBe(multiplaneVersion);
  expect(manifest.overrides.multiplane.three).toBe("$three");
  expect(lock.packages["node_modules/multiplane"].version).toBe(multiplaneVersion);
  expect(lock.packages["node_modules/multiplane"].integrity).toMatch(/^sha512-/);
  const threeCopies = Object.keys(lock.packages).filter((key) =>
    /(^|\/)node_modules\/three$/.test(key),
  );
  expect(threeCopies).toEqual(["node_modules/three"]);
  expect(existsSync(path.join(root, "renderers"))).toBe(false);
});

it("checks, verifies and renders a Multiplane preview straight to WebM inside the sandbox", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "multiplane-render-"));
  vi.mocked(isolatedCommand).mockImplementation(
    async (_exe, args, _cwd, _signal, _output, _timeout, stdout, env) => {
      expect(env).toMatchObject({ MULTIPLANE_HOSTED: "0" });
      if (args[1] === "inspect")
        stdout?.(
          result("inspect", true, { stage: { width: 1280, height: 720 }, duration: 3, fps: 30 }),
        );
      else if (args[1] === "verify") stdout?.(result("verify", true));
      else {
        stdout?.('{"type":"progress","phase":"capture","done":90,"total":90}\n');
        stdout?.(result("render", true, { frames: 90 }));
      }
      return "";
    },
  );
  vi.mocked(command).mockImplementation(async (exe) => (exe === "ffprobe" ? ffprobe("vp9") : ""));
  const events: string[] = [];
  const output = await renderJob(
    job(workspace),
    production("Multiplane"),
    new AbortController().signal,
    (_type, message) => events.push(message),
  );
  expect(output.video).toBe("renders/preview.webm");
  expect(vi.mocked(isolatedCommand).mock.calls.map((call) => call[1][1])).toEqual([
    "inspect",
    "verify",
    "render",
  ]);
  const renderArgs = vi.mocked(isolatedCommand).mock.calls[2][1];
  expect(renderArgs[renderArgs.indexOf("--out") + 1]).toBe("renders/preview.webm");
  expect(transcodePreviewToWebm).not.toHaveBeenCalled();
  expect(events).toContain("capture: 90/90 frames");
  expect(await readFile(path.join(workspace, "VALIDATION.md"), "utf8")).toContain(
    "multiplane render shot.html",
  );
});

it("refuses a Multiplane shot whose stage or timing differs from the project settings", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "multiplane-mismatch-"));
  vi.mocked(isolatedCommand).mockImplementation(
    async (_exe, _args, _cwd, _signal, _output, _timeout, stdout) => {
      stdout?.(
        result("inspect", true, { stage: { width: 1920, height: 1080 }, duration: 3, fps: 30 }),
      );
      return "";
    },
  );
  await expect(
    renderJob(job(workspace), production("Multiplane"), new AbortController().signal, () => {}),
  ).rejects.toThrow("1280×720");
  expect(vi.mocked(isolatedCommand)).toHaveBeenCalledTimes(1);
});

it("reports Multiplane's own failure code and stops when the job is cancelled", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "multiplane-fail-"));
  vi.mocked(isolatedCommand).mockImplementation(
    async (_exe, _args, _cwd, _signal, _output, _timeout, stdout) => {
      stdout?.(result("inspect", false, {}, { message: "Shot uses Date.now", hint: "Use t" }));
      throw Error("exited 1");
    },
  );
  await expect(
    renderJob(job(workspace), production("Multiplane"), new AbortController().signal, () => {}),
  ).rejects.toThrow("lint_failed");
  const controller = new AbortController();
  vi.mocked(isolatedCommand).mockImplementation(async () => {
    controller.abort();
    throw Error("Cancelled");
  });
  await expect(
    renderJob(job(workspace), production("Multiplane"), controller.signal, () => {}),
  ).rejects.toThrow();
  expect(vi.mocked(isolatedCommand)).toHaveBeenCalledTimes(2);
});

it("turns a HyperFrames preview into a verified WebM and keeps full films as MP4", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "hyperframes-preview-"));
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(workspace, "index.html"), '<div data-composition-id="video"></div>');
  const pass = { ok: true, findings: [] };
  vi.mocked(isolatedCommand).mockImplementation(
    async (_exe, args, _cwd, _signal, _output, _timeout, stdout) => {
      if (args.includes("check"))
        stdout?.(
          JSON.stringify({
            ok: true,
            browserSkipped: false,
            lint: pass,
            runtime: pass,
            motion: pass,
            contrast: pass,
            layout: pass,
            snapshots: { files: [] },
          }),
        );
      return "";
    },
  );
  vi.mocked(command).mockImplementation(async (exe) => (exe === "ffprobe" ? ffprobe("h264") : ""));
  const preview = await renderJob(
    job(workspace),
    production("HyperFrames"),
    new AbortController().signal,
    () => {},
  );
  expect(preview.video).toBe("renders/preview.webm");
  const hfArgs = vi
    .mocked(isolatedCommand)
    .mock.calls.find((call) => call[1].includes("render"))![1];
  expect(hfArgs[hfArgs.indexOf("--output") + 1]).toBe(
    path.join(workspace, "renders/preview.render.mp4"),
  );
  expect(transcodePreviewToWebm).toHaveBeenCalledWith(
    path.join(workspace, "renders/preview.render.mp4"),
    path.join(workspace, "renders/preview.webm"),
    expect.anything(),
  );
  vi.clearAllMocks();
  const full = await renderJob(
    job(workspace, "full"),
    production("HyperFrames"),
    new AbortController().signal,
    () => {},
  );
  expect(full.video).toBe("renders/full.mp4");
  expect(transcodePreviewToWebm).not.toHaveBeenCalled();
});
