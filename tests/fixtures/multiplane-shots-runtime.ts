import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { renderJob } from "../../src/server/domains/video/render";
import { command } from "../../src/server/runtime/process";
import type { Production } from "../../src/shared/agents/schemas/video";

const workspace = await mkdtemp(path.join(os.tmpdir(), "multiplane-shots-runtime-"));
const signal = new AbortController().signal;
try {
  const shots: NonNullable<Production["shots"]> = [];
  for (const [index, colour] of ["#ff0000", "#0000ff"].entries()) {
    const folder = path.join(workspace, `scene-${index}`);
    await mkdir(folder);
    await sharp({ create: { width: 64, height: 64, channels: 3, background: colour } })
      .png()
      .toFile(path.join(folder, "frame.png"));
    await writeFile(
      path.join(folder, "shot.html"),
      `<!doctype html><html><meta charset="utf-8">
      <link rel="stylesheet" href="/multiplane/runtime/shot.css">
      <style>#stage {width:64px;height:64px}</style><div id="stage"><canvas width="64" height="64"></canvas></div>
      <script src="/multiplane/runtime/shot.js"></script><script>
      const image = new Image(); const context = document.querySelector('canvas').getContext('2d');
      Shot.define({duration:1,fps:30,post:{motionBlur:1,grain:0},setup(){return new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src='frame.png';});},render(t){context.drawImage(image,0,0);}});
      </script></html>`,
    );
    shots.push({ sourceFile: `scene-${index}/shot.html`, duration: 1 });
  }
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=2",
      "score.wav",
    ],
    workspace,
    signal,
  );
  for (const kind of ["full", "preview"] as const) {
    const production: Production = {
      pipeline: "Multiplane",
      fallbackReason: null,
      styleRenderer: ["Canvas"],
      motionEngine: ["Shot"],
      sourceFile: shots[0]!.sourceFile,
      shots,
      duration: 2,
      width: 64,
      height: 64,
      fps: 30,
      audioDescription: "Test tone",
      audioFile: "score.wav",
      limitations: [],
    };
    const result = await renderJob(
      {
        id: "example-job",
        runId: "example-run",
        candidateId: "example-direction",
        kind,
        phase: "rendering",
        model: "example",
        workspace,
        duration: 2,
      },
      production,
      signal,
      () => {},
    );
    const validation = JSON.parse(
      await readFile(path.join(workspace, "renders/validation.json"), "utf8"),
    );
    assert.equal(
      validation.probe.streams.some(
        (stream: { codec_type: string }) => stream.codec_type === "audio",
      ),
      kind === "full",
    );
    for (const [time, expected] of [
      [0.5, [255, 0, 0]],
      [1.5, [0, 0, 255]],
    ] as const) {
      const png = path.join(workspace, "sample.png");
      await command(
        "ffmpeg",
        ["-y", "-v", "error", "-ss", String(time), "-i", result.video, "-frames:v", "1", png],
        workspace,
        signal,
      );
      const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const [channel, value] of expected.entries())
        assert(Math.abs(data[channel]! - value) < 12);
    }
    console.log(
      JSON.stringify({
        kind,
        independentShots: 2,
        duration: 2,
        fps: 30,
        sceneOrder: "passed",
        audio: kind === "full" ? "continuous" : "silent",
        fullDecode: "passed",
      }),
    );
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}
