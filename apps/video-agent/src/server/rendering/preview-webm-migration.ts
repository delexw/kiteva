import path from "node:path";
import { terminalPhases, type Run } from "../../shared/contracts";
import type { StyleVideo } from "../catalog/style-motion";

export type PreviewMigrationItem = {
  owner: "style-catalog" | "project";
  key: string;
  source: string;
  target: string;
  reference: string;
};

const webmName = (file: string) => file.replace(/\.mp4$/i, ".webm");

export function catalogPreviewItems(records: StyleVideo[], folder: string): PreviewMigrationItem[] {
  return records
    .filter((record) => /\.mp4$/i.test(record.video))
    .map((record) => ({
      owner: "style-catalog",
      key: record.styleId,
      source: path.join(folder, record.video),
      target: path.join(folder, webmName(record.video)),
      reference: webmName(record.video),
    }));
}
export function projectPreviewItems(runs: Run[]): PreviewMigrationItem[] {
  return runs.flatMap((run) =>
    run.jobs.flatMap((job) =>
      job.kind === "preview" &&
      job.outputType !== "page" &&
      terminalPhases.has(job.phase) &&
      job.video &&
      /\.mp4$/i.test(job.video)
        ? [
            {
              owner: "project" as const,
              key: `${run.id}/${job.id}`,
              source: path.join(job.workspace, job.video),
              target: path.join(job.workspace, webmName(job.video)),
              reference: webmName(job.video),
            },
          ]
        : [],
    ),
  );
}
export function switchCatalogReferences(records: StyleVideo[], converted: Map<string, string>) {
  return records.map((record) =>
    converted.has(record.styleId) ? { ...record, video: converted.get(record.styleId)! } : record,
  );
}
export function switchProjectReferences(run: Run, converted: Map<string, string>): Run {
  return {
    ...run,
    jobs: run.jobs.map((job) => {
      const reference = converted.get(`${run.id}/${job.id}`);
      return reference && job.kind === "preview" ? { ...job, video: reference } : job;
    }),
  } as Run;
}
