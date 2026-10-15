import type { GenerationJob } from "../../shared/contracts";

type PreviewPlayer = Pick<HTMLVideoElement, "currentTime" | "play">;
export function replayPreviewVideos(
  jobs: GenerationJob[],
  players: ReadonlyMap<string, PreviewPlayer>,
) {
  for (const job of jobs) {
    if (job.kind !== "preview" || job.outputType === "page") continue;
    const player = players.get(job.id);
    if (!player) continue;
    player.currentTime = 0;
    void player.play().catch(() => {});
  }
}
