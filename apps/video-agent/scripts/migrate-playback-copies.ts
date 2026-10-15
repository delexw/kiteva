import { existsSync } from "node:fs";
import { mkdir, rm, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Run } from "../src/shared/contracts";
import { dataRoot } from "../src/server/runtime/config";
import { probeVideo } from "../src/server/rendering/video-probe";
import {
  playbackCopyItems,
  unusedHeavyCopies,
} from "../src/server/rendering/playback-copy-migration";
import { backendListening, backendPort, savedRuns } from "./migration-helpers";

const args = process.argv.slice(2);
const queue = args.includes("--queue");
const removeHeavy = args.includes("--remove-unused-heavy-copies");
const api = `http://127.0.0.1:${backendPort}`;
const signal = new AbortController().signal;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sizeOf(file: string) {
  return existsSync(file) ? (await stat(file)).size : 0;
}
async function streams(file: string) {
  const probe = await probeVideo(file, signal);
  return probe.streams.map((stream) =>
    stream.codec_type === "video"
      ? `${stream.codec_name} ${stream.width}×${stream.height} ${stream.avg_frame_rate}`
      : `${stream.codec_name} ${stream.channels}ch`,
  );
}

const items = playbackCopyItems(savedRuns());
const masterBytes = (await Promise.all(items.map((item) => sizeOf(item.master)))).reduce(
  (total, bytes) => total + bytes,
  0,
);
const estimatedBytes = items.reduce((total, item) => total + item.duration * 500_000 + 2e6, 0);
const disk = await statfs(dataRoot);
const freeBytes = disk.bavail * disk.bsize;
const heavy = (
  await Promise.all(
    savedRuns()
      .flatMap((run) => run.jobs.map((job) => path.join(job.workspace, "renders", "full.webm")))
      .map(async (file) => ({ file, bytes: await sizeOf(file) })),
  )
).filter((entry) => entry.bytes);
const report: Record<string, unknown> = {
  mode: queue ? "queue" : removeHeavy ? "remove-unused-heavy-copies" : "dry-run",
  startedAt: new Date().toISOString(),
  films: items.length,
  masterBytes,
  estimatedBytes: Math.round(estimatedBytes),
  freeBytes,
  heavyCopies: heavy,
  items: [] as unknown[],
};
console.log(
  `${items.length} full films need playback copies (masters ${(masterBytes / 1e6).toFixed(0)} MB; copies about ${(estimatedBytes / 1e6).toFixed(0)} MB). Free disk ${(freeBytes / 1e9).toFixed(1)} GB. Older 2K WebM copies on disk: ${heavy.length} (${(heavy.reduce((t, e) => t + e.bytes, 0) / 1e6).toFixed(0)} MB, unused).`,
);

if (queue && items.length) {
  if (!(await backendListening())) throw Error(`Start the backend on port ${backendPort} first`);
  const backup = path.join(dataRoot, "backups", `jobs-before-playback-copies-${Date.now()}.sqlite`);
  await mkdir(path.dirname(backup), { recursive: true });
  const database = new DatabaseSync(path.join(dataRoot, "jobs.sqlite"), { readOnly: true });
  try {
    database.prepare("VACUUM INTO ?").run(backup);
  } finally {
    database.close();
  }
  report.backup = backup;
  console.log(`Backed up jobs.sqlite to ${backup}`);
  for (const item of items) {
    const response = await fetch(`${api}/api/runs/${item.runId}/playback-copies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: item.jobId }),
    });
    if (!response.ok)
      throw Error(`Queueing ${item.jobId} failed: ${response.status} ${await response.text()}`);
    const started = Date.now();
    let job: Run["jobs"][number] | undefined;
    while (true) {
      await pause(5000);
      const run = (await (await fetch(`${api}/api/runs/${item.runId}`)).json()) as Run;
      job = run.jobs.find((entry) => entry.id === item.jobId);
      if (job?.outputType === "page" || job?.playbackCopies?.status !== "making") break;
    }
    const entry: Record<string, unknown> = {
      ...item,
      seconds: Math.round((Date.now() - started) / 1000),
      status: job?.outputType !== "page" ? job?.playbackCopies?.status : "missing",
      error: job?.outputType !== "page" ? job?.playbackCopies?.error : undefined,
    };
    if (job && job.outputType !== "page") {
      const workspace = path.dirname(path.dirname(item.master));
      for (const [name, file] of [
        ["master", job.video],
        ["viewingVideo", job.viewingVideo],
        ["cardClip", job.cardClip],
      ] as const)
        if (file)
          entry[name] = {
            file,
            bytes: await sizeOf(path.join(workspace, file)),
            streams: await streams(path.join(workspace, file)),
          };
    }
    (report.items as unknown[]).push(entry);
    console.log(`${entry.status}: ${item.runId}/${item.jobId} in ${entry.seconds}s`);
  }
}
if (removeHeavy) {
  const removable = unusedHeavyCopies(savedRuns()).filter((file) => existsSync(file));
  for (const file of removable) await rm(file);
  report.removedHeavyCopies = removable;
  console.log(`Removed ${removable.length} unused 2K WebM copies`);
}
report.finishedAt = new Date().toISOString();
const folder = path.join(dataRoot, "migrations");
await mkdir(folder, { recursive: true });
const file = path.join(folder, `playback-copies-${Date.now()}.json`);
await writeFile(file, JSON.stringify(report, null, 2));
console.log(`Report: ${path.relative(process.cwd(), file)}`);
