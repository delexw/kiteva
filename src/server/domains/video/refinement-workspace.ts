import { isVideoRefinementSource } from "../../../shared/video-refinement-source";
import { refinementHistoryArtifact } from "./refinement-history";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VideoGenerationJob, VideoRefinementCheckpoint } from "../../../shared/domains/video";
import { inheritRendererCache } from "../../rendering/refinement";
import type { Asset } from "../../../shared/contracts";
import { prepareBriefImage } from "../../requests/brief-images";
import { readFile } from "node:fs/promises";

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
  references: Asset[] = [],
) {
  signal.throwIfAborted();
  if (!isVideoRefinementSource(source) || !job.refinementPrompt)
    throw Error(
      "Fine-tuning requires a completed or cancelled video, saved session and requested changes",
    );
  await mkdir(job.workspace, { recursive: true });
  await cp(source.workspace, job.workspace, {
    recursive: true,
    filter: (file) => {
      signal.throwIfAborted();
      return !["node_modules", "renders", ".runtime"].includes(path.basename(file));
    },
  });
  await mkdir(path.dirname(path.join(job.workspace, refinementHistoryArtifact)), {
    recursive: true,
  });
  await writeFile(
    path.join(job.workspace, refinementHistoryArtifact),
    JSON.stringify(
      {
        previousInstructions: job.refinementHistory || [],
        discardedRequestJobIds: job.discardedRefinementJobIds || [],
        latestInstruction: {
          jobId: job.id,
          prompt: job.refinementPrompt,
          assetIds: job.refinementAssetIds || [],
        },
        unresolvedReferenceIds: [
          ...new Set((job.refinementHistory || []).flatMap((entry) => entry.assetIds || [])),
        ].filter((id) => !references.some((asset) => asset.id === id)),
      },
      null,
      2,
    ),
    { signal },
  );
  const inheritedCacheDirectories = await inheritRendererCache(
    source.workspace,
    job.workspace,
    pipeline,
    signal,
  );
  if (references.length) {
    const directory = path.join(job.workspace, "refinement-images");
    await mkdir(directory, { recursive: true });
    const images = [];
    for (const asset of references) {
      signal.throwIfAborted();
      const original = await readFile(asset.path, { signal });
      const prepared = await prepareBriefImage(original);
      const originalPath = `refinement-images/${asset.name}`;
      const inspectionPath = prepared.resized ? `${originalPath}.png` : originalPath;
      await writeFile(path.join(job.workspace, originalPath), original, { signal });
      if (prepared.resized)
        await writeFile(path.join(job.workspace, inspectionPath), prepared.image, { signal });
      images.push({ originalPath, inspectionPath });
    }
    await writeFile(path.join(job.workspace, "REFINEMENT_IMAGES.json"), JSON.stringify(images), {
      signal,
    });
  }
  const files = await Promise.all(
    [
      ...new Set(["production.json", "STORYBOARD.json", ...(source.video ? [source.video] : [])]),
    ].map((file) => checkpointFile(source.workspace, file, signal)),
  );
  const checkpoint: VideoRefinementCheckpoint = {
    sourceJobId: source.id,
    sourceWorkspace: source.workspace,
    sourceSessionId: source.sessionId,
    sourcePhase: source.phase,
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
