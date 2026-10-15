import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProductionSchema } from "../src/shared/agents/schemas/video";
import { makePlaybackCopies, renderJob } from "../src/server/rendering/render";
import { probeVideo } from "../src/server/rendering/video-probe";

const [width, height, fps, duration] = [1920, 1080, 60, 6];
const workspace = await mkdtemp(path.join(os.tmpdir(), "playback-copies-check-"));
await mkdir(path.join(workspace, "assets"));
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  `aevalsrc='between(t,1,2)*0.5*sin(2*PI*440*t)|between(t,1,2)*0.5*sin(2*PI*660*t)':s=48000:d=${duration}`,
  "-c:a",
  "pcm_s16le",
  path.join(workspace, "assets", "mix.wav"),
]);
await writeFile(
  path.join(workspace, "shot.html"),
  `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Playback copies check</title>
<link rel="stylesheet" href="/multiplane/runtime/shot.css">
<style>
  #stage { width: ${width}px; height: ${height}px; background: #16130f; }
  #box { position: absolute; left: 0; top: ${height / 2 - 50}px; width: 100px; height: 100px; background: #e58a3e; }
</style>
<div id="stage"><div id="box"></div></div>
<script src="/multiplane/runtime/shot.js"></script>
<script>
const stage = document.querySelector('#stage');
const box = document.querySelector('#box');
Shot.define({
  duration: ${duration},
  fps: ${fps},
  render(t) {
    stage.style.background = t >= 1 && t < 2 ? '#f4efe6' : '#16130f';
    box.style.transform = \`translateX(\${Shot.ease.lerp(0, ${width - 100}, t / ${duration})}px)\`;
  },
});
</script></html>
`,
);
const production = ProductionSchema.parse({
  pipeline: "Multiplane",
  fallbackReason: null,
  styleRenderer: ["HTML/CSS"],
  motionEngine: ["Shot.ease"],
  sourceFile: "shot.html",
  duration,
  width,
  height,
  fps,
  audioDescription: "Stereo test tone from 1 s to 2 s",
  audioFile: "assets/mix.wav",
  limitations: [],
});
const job = {
  id: "full",
  runId: "viewing-copy-check",
  candidateId: "full",
  kind: "full" as const,
  phase: "rendering" as const,
  model: "local",
  workspace,
  duration,
};
const signal = new AbortController().signal;
const log = (type: string, message: string) =>
  type !== "render_progress" || /WebM/.test(message) ? console.log(`${type}: ${message}`) : 0;
Object.assign(job, await renderJob(job, production, signal, log));
Object.assign(job, await makePlaybackCopies(job, signal, log));
const copies = job as { video?: string; viewingVideo?: string; cardClip?: string };
if (!copies.viewingVideo || !copies.cardClip) throw Error("Playback copies were not made");
const toneStart = (file: string) =>
  Number(
    /silence_end: ([0-9.]+)/.exec(
      spawnSync(
        "ffmpeg",
        ["-v", "info", "-i", file, "-af", "silencedetect=n=-40dB:d=0.3", "-f", "null", "-"],
        { encoding: "utf8" },
      ).stderr,
    )?.[1],
  );
for (const file of [copies.video!, copies.viewingVideo, copies.cardClip]) {
  const absolute = path.join(workspace, file);
  const probe = await probeVideo(absolute, signal);
  const streams = probe.streams.map((stream) =>
    stream.codec_type === "video"
      ? `${stream.codec_name} ${stream.width}×${stream.height} ${stream.avg_frame_rate}`
      : `${stream.codec_name} ${stream.channels}ch`,
  );
  console.log(
    `${file}: ${streams.join(", ")}, ${Number(probe.format.duration).toFixed(3)} s, ${probe.streams.some((stream) => stream.codec_type === "audio") ? `tone starts at ${toneStart(absolute).toFixed(3)} s` : "silent"}`,
  );
}
console.log(`Workspace: ${workspace}`);
