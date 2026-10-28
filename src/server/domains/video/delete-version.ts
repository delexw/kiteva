import path from "node:path";
import { rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dataRoot } from "../../runtime/config";
import { CodedError } from "../../../shared/errors";
import { terminalPhases, type Run } from "../../../shared/contracts";
import { preserveJobVersions } from "../../../shared/job-versions";

/** Remove one version while retaining audit events and monotonic version allocation. */
export async function deleteVideoVersion(input: {
  run: Run;
  jobId: string;
  signal: AbortSignal;
  persist: (next: Run) => void;
}) {
  const { run, jobId, signal } = input;
  const job = run.jobs.find(
    (entry) => entry.id === jobId && entry.kind === "full" && entry.outputType !== "page",
  );
  if (!job) throw new CodedError("INVALID_REQUEST", "Video version not found");
  if (!terminalPhases.has(job.phase))
    throw new CodedError("PROJECT_ACTIVE", "Stop this version before deleting it", 409);
  const root = path.resolve(dataRoot, "runs");
  const workspace = path.resolve(root, run.id, job.id);
  const relative = path.relative(root, workspace);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    workspace !== path.resolve(job.workspace)
  )
    throw new CodedError("INVALID_REQUEST", "Version workspace is outside its project");
  const next = structuredClone(run);
  preserveJobVersions(next);
  const version = next.jobs.find((entry) => entry.id === jobId)!.version!;
  next.deletedVersions = [
    ...(next.deletedVersions || []),
    { id: jobId, candidateId: job.candidateId, version, deletedAt: new Date().toISOString() },
  ];
  next.discardedRefinementJobIds = [...new Set([...(next.discardedRefinementJobIds || []), jobId])];
  next.jobs = next.jobs.filter((entry) => entry.id !== jobId);
  next.inputWaits = next.inputWaits?.filter((wait) => wait.jobId !== jobId);
  next.assetQuestions = next.assetQuestions?.filter((question) => question.jobId !== jobId);
  const trash = path.join(path.dirname(workspace), `.deleted-${jobId}-${randomUUID()}`);
  signal.throwIfAborted();
  let moved = false,
    committed = false;
  try {
    try {
      await rename(workspace, trash);
      moved = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    signal.throwIfAborted();
    input.persist(next);
    committed = true;
  } finally {
    if (moved && !committed) await rename(trash, workspace);
  }
  if (moved) await rm(trash, { recursive: true, force: true });
  return next;
}
