/** Real renderer integration case. Uses temporary files, no model calls or production jobs. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { renderJob } from "../src/server/domains/video/render";
import { prepareVideoRefinement } from "../src/server/domains/video/refinement";
import { ProductionSchema } from "../src/shared/agents/schemas/video";
import type { VideoGenerationJob } from "../src/shared/domains/video";
import { command } from "../src/server/runtime/process";

const workspace = await mkdtemp(path.join(os.tmpdir(), "multiplane-reuse-proof-"));
const signal = AbortSignal.timeout(600000);
const shot = (color: string) =>
  `<!doctype html><html><link rel="stylesheet" href="/multiplane/runtime/shot.css"><link rel="stylesheet" href="shared.css"><div id="stage" style="width:320px;height:180px;background:${color}"><div id="dot" style="width:30px;height:30px;background:white"></div></div><script src="/multiplane/runtime/shot.js"></script><script>Shot.define({duration:0.2,fps:30,render(t){document.getElementById('dot').style.transform='translateX('+Math.round(t*100)+'px)'}});</script></html>`;
await writeFile(path.join(workspace, "shared.css"), "body{margin:0}");
await writeFile(path.join(workspace, "first.html"), shot("#18324a"));
await writeFile(path.join(workspace, "second.html"), shot("#5a243a"));
const production = ProductionSchema.parse({
  pipeline: "Multiplane",
  fallbackReason: null,
  sourceFile: "first.html",
  duration: 0.4,
  width: 320,
  height: 180,
  fps: 30,
  styleRenderer: ["HTML"],
  motionEngine: ["Shot"],
  audioDescription: "Silent test",
  audioFile: null,
  limitations: [],
  shots: [
    { sourceFile: "first.html", duration: 0.2 },
    { sourceFile: "second.html", duration: 0.2 },
  ],
});
const job: VideoGenerationJob = {
  id: "reuse-check",
  runId: "example",
  candidateId: "example",
  kind: "preview",
  phase: "rendering",
  model: "example",
  workspace,
  duration: 0.4,
};
async function pass(name: string, currentJob = job) {
  const workspace = currentJob.workspace;
  const messages: string[] = [];
  const start = performance.now();
  const result = await renderJob(currentJob, production, signal, (_type, message) =>
    messages.push(message),
  );
  const frames = await command(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path.join(workspace, result.video),
      "-map",
      "0:v:0",
      "-f",
      "framemd5",
      "-",
    ],
    workspace,
    signal,
  );
  const summary = {
    name,
    rendered: messages.filter((message) => message.startsWith("Rendering the Multiplane shot"))
      .length,
    reused: messages.filter((message) =>
      message.startsWith("Reusing the validated Multiplane shot"),
    ).length,
    frameHash: createHash("sha256").update(frames).digest("hex"),
    milliseconds: Math.round(performance.now() - start),
    shotHashes: await Promise.all(
      [0, 1].map(async (index) =>
        createHash("sha256")
          .update(await readFile(path.join(workspace, `renders/shots/shot-${index}.webm`)))
          .digest("hex"),
      ),
    ),
  };
  console.log(JSON.stringify(summary));
  return summary;
}
const cold = await pass("cold");
assert.equal(cold.rendered, 2);
assert.equal(cold.reused, 0);
const warm = await pass("unchanged");
assert.equal(warm.rendered, 0);
assert.equal(warm.reused, 2);
assert.equal(warm.frameHash, cold.frameHash);
const revisionWorkspace = await mkdtemp(path.join(os.tmpdir(), "multiplane-refinement-proof-"));
const revisionJob = {
  ...job,
  id: "revision-check",
  workspace: revisionWorkspace,
  refinementPrompt: "Keep the visuals unchanged",
};
await prepareVideoRefinement(
  { ...job, phase: "ready", sessionId: "fixture-session", video: "renders/preview.webm" },
  revisionJob,
  "Multiplane",
);
const inherited = await pass("fine-tune-inherited", revisionJob);
assert.equal(inherited.rendered, 0);
assert.equal(inherited.reused, 2);
assert.equal(inherited.frameHash, cold.frameHash);

await writeFile(path.join(workspace, "first.html"), shot("#245a32"));
const changed = await pass("source-changed");
assert.equal(changed.rendered, 1);
assert.equal(changed.reused, 1);
assert.equal(changed.shotHashes[1], warm.shotHashes[1]);
assert.notEqual(changed.shotHashes[0], warm.shotHashes[0]);
assert.notEqual(changed.frameHash, warm.frameHash);
const again = await pass("changed-then-unchanged");
assert.equal(again.reused, 2);
assert.equal(again.frameHash, changed.frameHash);
await writeFile(path.join(workspace, "shared.css"), "body{margin:0} #dot{border:2px solid red}");
const shared = await pass("shared-style-changed");
assert.equal(shared.rendered, 2);
assert.equal(shared.reused, 0);
assert.notEqual(shared.frameHash, changed.frameHash);
// Corruption must trigger rendering, even if a source fingerprint still matches.
const { readdir } = await import("node:fs/promises");
const cache = path.join(workspace, "renders/multiplane-cache");
for (const file of await readdir(cache))
  if (file.endsWith(".video")) await writeFile(path.join(cache, file), "broken");
const repaired = await pass("corrupt-cache");
assert.equal(repaired.rendered, 2);
assert.equal(repaired.reused, 0);
assert.equal(repaired.frameHash, shared.frameHash);
await writeFile(
  path.join(workspace, "reuse-proof.json"),
  JSON.stringify(
    { cold, warm, inherited, revisionWorkspace, changed, again, shared, repaired },
    null,
    2,
  ),
);
console.log(`Verified output: ${workspace}`);
