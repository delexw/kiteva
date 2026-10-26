import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VideoGenerationJob, VideoRefinementCheckpoint } from "../../../shared/domains/video";
import { inheritRendererCache } from "../../rendering/refinement";

async function checkpointFile(
  workspace: string,
  file: string,
  signal: AbortSignal,
): Promise<VideoRefinementCheckpoint["files"][number]> {
  try {
    const root = await realpath(workspace);
    const resolved = await realpath(path.resolve(root, file));
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      return { path: file, available: false };
    const info = await stat(resolved);
    if (!info.isFile()) return { path: file, available: false };
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(resolved, { signal })) hash.update(chunk);
    return { path: file, available: true, sha256: hash.digest("hex"), bytes: info.size };
  } catch {
    signal.throwIfAborted();
    return { path: file, available: false };
  }
}

/** Fork authored inputs, inherit only renderer-owned cache, and record evidence for the resumed session. */
export async function prepareVideoRefinement(
  source: VideoGenerationJob,
  job: VideoGenerationJob,
  pipeline: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (source.phase !== "ready" || !source.sessionId || !job.refinementPrompt)
    throw Error("Fine-tuning requires a completed video, saved session and requested changes");
  await mkdir(job.workspace, { recursive: true });
  await cp(source.workspace, job.workspace, {
    recursive: true,
    filter: (file) => {
      signal.throwIfAborted();
      return !["node_modules", "renders"].includes(path.basename(file));
    },
  });
  const inheritedCacheDirectories = await inheritRendererCache(
    source.workspace,
    job.workspace,
    pipeline,
    signal,
  );
  const files = await Promise.all(
    [
      ...new Set(["production.json", "STORYBOARD.json", ...(source.video ? [source.video] : [])]),
    ].map((file) => checkpointFile(source.workspace, file, signal)),
  );
  const checkpoint: VideoRefinementCheckpoint = {
    sourceJobId: source.id,
    sourceWorkspace: source.workspace,
    sourceSessionId: source.sessionId,
    sourcePhase: "ready",
    sourceFinishedAt: source.finishedAt,
    workspace: job.workspace,
    requestedChanges: job.refinementPrompt,
    files,
    inheritedCacheDirectories,
  };
  await mkdir(path.join(job.workspace, "renders"), { recursive: true });
  await writeFile(
    path.join(job.workspace, "renders/refinement-checkpoint.json"),
    JSON.stringify(checkpoint, null, 2),
    { signal },
  );
  return checkpoint;
}
