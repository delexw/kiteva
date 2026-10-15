import { existsSync } from "node:fs";
import { mkdir, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { readStyleVideos, writeStyleVideos } from "../src/server/catalog/style-motion";
import { stylePreviewVideoFolder } from "../src/server/catalog/style-preview-assets";
import { Store } from "../src/server/jobs/store";
import { dataRoot } from "../src/server/runtime/config";
import { transcodePreviewToWebm, verifyPreviewWebm } from "../src/server/rendering/webm-video";
import {
  catalogPreviewItems,
  projectPreviewItems,
  switchCatalogReferences,
  switchProjectReferences,
  type PreviewMigrationItem,
} from "../src/server/rendering/preview-webm-migration";
import { backendListening, backendPort, inBatches, savedRuns } from "./migration-helpers";

const args = process.argv.slice(2);
const convert = args.includes("--convert");
const switchReferences = args.includes("--switch");
const concurrency = Number(args[args.indexOf("--concurrency") + 1]) || 3;
const signal = new AbortController().signal;

const items: PreviewMigrationItem[] = [
  ...catalogPreviewItems(await readStyleVideos(), stylePreviewVideoFolder),
  ...projectPreviewItems(savedRuns()),
];
const missing = items.filter((item) => !existsSync(item.source));
const present = items.filter((item) => existsSync(item.source));
const sourceBytes = (
  await Promise.all(present.map(async (item) => (await stat(item.source)).size))
).reduce((total, bytes) => total + bytes, 0);
const disk = await statfs(dataRoot);
const freeBytes = disk.bavail * disk.bsize;
const report: Record<string, unknown> = {
  mode: switchReferences ? "switch" : convert ? "convert" : "dry-run",
  startedAt: new Date().toISOString(),
  catalogItems: present.filter((item) => item.owner === "style-catalog").length,
  projectItems: present.filter((item) => item.owner === "project").length,
  missingSources: missing.map((item) => item.key),
  sourceBytes,
  freeBytes,
  items: [] as unknown[],
};
console.log(
  `${present.length} preview MP4s (${(sourceBytes / 1e6).toFixed(1)} MB): ${report.catalogItems} style catalog, ${report.projectItems} project. Free disk ${(freeBytes / 1e9).toFixed(1)} GB.`,
);
if (missing.length)
  console.log(
    `Skipping ${missing.length} with no source file: ${missing.map((item) => item.key).join(", ")}`,
  );
if (convert && freeBytes < sourceBytes * 4)
  throw Error("Not enough free disk for a safe conversion");

const results = await inBatches(present, concurrency, async (item) => {
  const entry: Record<string, unknown> = { ...item };
  if (existsSync(item.target)) {
    const check = await verifyPreviewWebm(item.source, item.target, signal);
    entry.similarity = check.similarity;
    entry.status = check.problems.length ? "existing WebM fails checks" : "verified";
    entry.problems = check.problems;
    if (!check.problems.length || !convert) return entry;
  } else entry.status = "not converted";
  if (!convert) return entry;
  try {
    const converted = await transcodePreviewToWebm(item.source, item.target, signal);
    Object.assign(entry, converted, { status: "verified", problems: [] });
  } catch (error) {
    Object.assign(entry, { status: "failed", problems: [(error as Error).message] });
  }
  console.log(`${entry.status}: ${item.key}`);
  return entry;
});
report.items = results;
const verified = results.filter((entry) => entry.status === "verified") as Array<
  PreviewMigrationItem & { status: string }
>;
if (switchReferences) {
  const catalog = new Map(
    verified
      .filter((item) => item.owner === "style-catalog")
      .map((item) => [item.key, item.reference]),
  );
  await writeStyleVideos(switchCatalogReferences(await readStyleVideos(), catalog));
  report.catalogSwitched = catalog.size;
  const projects = new Map(
    verified.filter((item) => item.owner === "project").map((item) => [item.key, item.reference]),
  );
  if (projects.size && (await backendListening())) {
    report.projectSwitched = 0;
    report.projectSwitchSkipped = `The backend on port ${backendPort} is running; stop it and run --switch again.`;
  } else if (projects.size) {
    const store = new Store();
    let switched = 0;
    try {
      for (const run of savedRuns()) {
        const next = switchProjectReferences(run, projects);
        if (JSON.stringify(next) === JSON.stringify(run)) continue;
        store.save(next);
        switched += next.jobs.filter((job, index) => job.video !== run.jobs[index].video).length;
      }
    } finally {
      store.close();
    }
    report.projectSwitched = switched;
  }
}
report.finishedAt = new Date().toISOString();
report.verified = verified.length;
report.failed = results.filter((entry) => entry.status === "failed").length;
const folder = path.join(dataRoot, "migrations");
await mkdir(folder, { recursive: true });
const file = path.join(folder, `preview-webm-${Date.now()}.json`);
await writeFile(file, JSON.stringify(report, null, 2));
console.log(
  `Verified ${report.verified}, failed ${report.failed}${switchReferences ? `, switched catalog ${report.catalogSwitched}, projects ${report.projectSwitched ?? 0}` : ""}. Report: ${path.relative(process.cwd(), file)}`,
);
if (report.projectSwitchSkipped) console.log(report.projectSwitchSkipped);
