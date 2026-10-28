import { jobVersions } from "../../shared/job-versions";
import { terminalPhases, type GenerationJob } from "../../shared/contracts";

/** Display state of one full revision; interrupted jobs read as failed so they stay retryable. */
export type RevisionState = "ready" | "active" | "failed" | "cancelled";

export type FullRevision = {
  job: GenerationJob;
  /** 1-based version, persisted across deletion; legacy jobs use their per-candidate order. */
  version: number;
  state: RevisionState;
  playable: boolean;
};

export type FullRevisionGroup = {
  /** Stable card key: the candidate id, or the job id when a job has no candidate. */
  key: string;
  revisions: FullRevision[];
};

export function revisionState(job: GenerationJob): RevisionState {
  if (!terminalPhases.has(job.phase)) return "active";
  if (job.phase === "ready") return "ready";
  if (job.phase === "cancelled") return "cancelled";
  return "failed";
}

export function isPlayableRevision(job: GenerationJob) {
  return job.phase === "ready" && Boolean(job.outputType === "page" ? job.page : job.video);
}

/**
 * One group per creative direction (candidateId) in existing job order.
 * Titles and styles are never compared, and preview jobs never join a stack.
 */
export function fullRevisionGroups(jobs: GenerationJob[]): FullRevisionGroup[] {
  const versions = jobVersions(jobs);
  const groups = new Map<string, FullRevisionGroup>();
  for (const job of jobs) {
    if (job.kind !== "full") continue;
    const key = job.candidateId || job.id;
    const group = groups.get(key) ?? { key, revisions: [] };
    group.revisions.push({
      job,
      version: versions.get(job.id)!,
      state: revisionState(job),
      playable: isPlayableRevision(job),
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function fullRevisionGroupOf(jobs: GenerationJob[], jobId: string) {
  return fullRevisionGroups(jobs).find((group) =>
    group.revisions.some((revision) => revision.job.id === jobId),
  );
}

function latestPlayable(group: FullRevisionGroup) {
  return [...group.revisions].reverse().find((revision) => revision.playable);
}

/** Latest playable revision; otherwise the latest revision in any state. */
export function defaultRevision(group: FullRevisionGroup) {
  return latestPlayable(group) ?? group.revisions.at(-1)!;
}

/** A remembered job id wins while that job still exists in the group. */
export function selectedRevision(group: FullRevisionGroup, jobId?: string) {
  return group.revisions.find((revision) => revision.job.id === jobId) ?? defaultRevision(group);
}

/**
 * The one other revision worth surfacing inside the card: a newer revision (building,
 * failed or ready), or the playable revision to return to when a non-playable one is selected.
 */
export function revisionStripTarget(group: FullRevisionGroup, selected: FullRevision) {
  const newest = group.revisions.at(-1)!;
  if (newest.version > selected.version && newest.state !== "cancelled") return newest;
  if (selected.playable) return undefined;
  const playable = latestPlayable(group);
  return playable && playable !== selected ? playable : undefined;
}
