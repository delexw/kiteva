import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProductionSchema } from "../src/shared/agents/schemas/video";
import { renderJob } from "../src/server/rendering/render";
import { probeVideo } from "../src/server/rendering/video-probe";

const shot = (width: number, height: number, fps: number) => `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Multiplane trial check</title>
<link rel="stylesheet" href="/multiplane/runtime/shot.css">
<style>
  #stage { width: ${width}px; height: ${height}px; background: #16130f; }
  #box { position: absolute; left: 0; top: ${height / 2 - 50}px; width: 100px; height: 100px; background: #e58a3e; }
</style>
<div id="stage"><div id="box"></div></div>
<script src="/multiplane/runtime/shot.js"></script>
<script>
const box = document.querySelector('#box');
Shot.define({
  duration: 3,
  fps: ${fps},
  render(t) {
    const k = Shot.ease.inOutCubic(Shot.ease.prog(t, 0.2, 2.6));
    box.style.transform = \`translateX(\${Shot.ease.lerp(0, ${width - 100}, k)}px)\`;
  },
});
</script></html>
`;
for (const [kind, width, height, fps] of [
  ["preview", 1280, 720, 30],
  ["full", 1920, 1080, 60],
] as const) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), `multiplane-trial-${kind}-`));
  await writeFile(path.join(workspace, "shot.html"), shot(width, height, fps));
  const production = ProductionSchema.parse({
    pipeline: "Multiplane",
    fallbackReason: null,
    styleRenderer: ["HTML/CSS"],
    motionEngine: ["Shot.ease"],
    sourceFile: "shot.html",
    duration: 3,
    width,
    height,
    fps,
    audioDescription: "Silent",
    audioFile: null,
    limitations: [],
  });
  const started = Date.now();
  const output = await renderJob(
    {
      id: kind,
      runId: "multiplane-trial",
      candidateId: kind,
      kind,
      phase: "rendering",
      model: "local",
      workspace,
      duration: 3,
    },
    production,
    new AbortController().signal,
    (type, message) => type !== "render_progress" && console.log(`${kind}: ${message}`),
  );
  const probe = await probeVideo(path.join(workspace, output.video), new AbortController().signal);
  const video = probe.streams.find((stream) => stream.codec_type === "video")!;
  console.log(
    `${kind}: ${output.video} ${video.codec_name} ${video.width}×${video.height} ${video.avg_frame_rate} ${probe.format.duration}s, audio ${probe.streams.some((s) => s.codec_type === "audio")}, ${Date.now() - started} ms, ${workspace}`,
  );
}
