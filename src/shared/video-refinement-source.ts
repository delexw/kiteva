import type { GenerationJob } from "./contracts";
import type { VideoGenerationJob } from "./domains/video";

/** Stopped work can be continued when its builder session was saved. */
export function isVideoRefinementSource(
  job: GenerationJob,
): job is VideoGenerationJob & { phase: "ready" | "cancelled"; sessionId: string } {
  return (
    job.kind === "full" &&
    job.outputType !== "page" &&
    (job.phase === "ready" || job.phase === "cancelled") &&
    Boolean(job.sessionId)
  );
}
