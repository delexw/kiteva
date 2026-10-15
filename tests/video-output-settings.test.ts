import { ProductionSchema } from "../src/shared/agents/schemas/video";
import { expect, it, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { projectSettingsDraft } from "../src/client/lib/project-settings";
import { dimensions } from "../src/shared/contracts";
vi.mock("../src/server/runtime/process", () => ({ command: vi.fn(), isolatedCommand: vi.fn() }));
import { command, isolatedCommand } from "../src/server/runtime/process";
import { renderJob } from "../src/server/domains/video/render";

it("accepts 1080p and QHD at 30/60 fps, restores them and rejects unsupported rates", () => {
  for (const resolution of ["1080p", "1440p"] as const) {
    for (const frameRate of [30, 60] as const) {
      const request = VideoRequestSchema.parse({
        instructions: "A visual demo",
        resolution,
        frameRate,
      });
      expect(projectSettingsDraft(request)).toMatchObject({ resolution, frameRate });
    }
  }
  expect(
    projectSettingsDraft(VideoRequestSchema.parse({ instructions: "Legacy demo" })),
  ).toMatchObject({ resolution: "1080p", frameRate: 30 });
  expect(VideoRequestSchema.safeParse({ instructions: "Demo", frameRate: 59 }).success).toBe(false);
  expect(dimensions("16:9", 1440)).toEqual({ width: 2560, height: 1440 });
  expect(dimensions("9:16", 1440)).toEqual({ width: 1440, height: 2560 });
});

it.each(["HyperFrames", "Remotion"] as const)(
  "renders and validates 60 fps through %s",
  async (pipeline) => {
    vi.clearAllMocks();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "video-fps-"));
    const production = ProductionSchema.parse({
      pipeline,
      fallbackReason: pipeline === "Remotion" ? "Verified capability limit" : null,
      styleRenderer: ["SVG"],
      motionEngine: ["GSAP"],
      sourceFile: pipeline === "HyperFrames" ? "index.html" : "index.tsx",
      duration: 3,
      width: 2560,
      height: 1440,
      fps: 60,
      audioDescription: "Silent",
      limitations: [],
    });
    const job = {
      id: "job",
      runId: "project",
      candidateId: "candidate",
      kind: "full" as const,
      phase: "rendering" as const,
      model: "example",
      workspace,
      duration: 3,
    };
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
    vi.mocked(command).mockImplementation(async (exe) =>
      exe === "ffprobe"
        ? JSON.stringify({
            streams: [
              {
                codec_type: "video",
                codec_name: "h264",
                width: 2560,
                height: 1440,
                avg_frame_rate: "60/1",
              },
            ],
            format: { duration: "3" },
          })
        : "",
    );
    try {
      await writeFile(
        path.join(workspace, "index.html"),
        '<div data-composition-id="video"></div>',
      );
      await renderJob(job, production, new AbortController().signal, () => {});
      const renderArgs = vi
        .mocked(isolatedCommand)
        .mock.calls.find((call) => call[1].includes("render"))![1];
      expect(renderArgs[renderArgs.indexOf("--fps") + 1]).toBe("60");
      if (pipeline === "Remotion") expect(renderArgs).toContain("0-179");
      expect(await readFile(path.join(workspace, "VALIDATION.md"), "utf8")).toContain(
        "2560×1440, 60 fps",
      );
      vi.mocked(command).mockImplementation(async (exe) =>
        exe === "ffprobe"
          ? JSON.stringify({
              streams: [
                {
                  codec_type: "video",
                  codec_name: "h264",
                  width: 2560,
                  height: 1440,
                  avg_frame_rate: "30/1",
                },
              ],
              format: { duration: "3" },
            })
          : "",
      );
      await expect(
        renderJob(job, production, new AbortController().signal, () => {}),
      ).rejects.toThrow("frame rate");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
