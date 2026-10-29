import { workspaceFolders } from "../../shared/workspace";
import path from "node:path";
import type { Run } from "../../shared/contracts";
import { playbackCopyProfile } from "./playback-copies";

export type PlaybackCopyItem = { runId: string; jobId: string; master: string; duration: number };

export function playbackCopyItems(runs: Run[]): PlaybackCopyItem[] {
  return runs.flatMap((run) =>
    run.jobs.flatMap((job) =>
      job.outputType !== "page" &&
      job.kind === "full" &&
      job.phase === "ready" &&
      job.video &&
      !(
        job.playbackCopies?.profile === playbackCopyProfile &&
        ["ready", "making"].includes(job.playbackCopies.status)
      )
        ? [
            {
              runId: run.id,
              jobId: job.id,
              master: path.join(job.workspace, job.video),
              duration: job.duration,
            },
          ]
        : [],
    ),
  );
}
export function unusedHeavyCopies(runs: Run[]) {
  return runs.flatMap((run) =>
    run.jobs.flatMap((job) =>
      job.outputType !== "page" &&
      job.kind === "full" &&
      job.playbackCopies?.profile === playbackCopyProfile &&
      job.playbackCopies.status === "ready" &&
      job.viewingVideo !== `${workspaceFolders.renders}/full.webm`
        ? [path.join(job.workspace, workspaceFolders.renders, "full.webm")]
        : [],
    ),
  );
}
