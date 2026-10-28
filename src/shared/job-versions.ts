import type { GenerationJob, Run } from "./contracts";

/** Explicit versions survive deletion; legacy jobs retain their original per-direction order. */
export function jobVersions(jobs: GenerationJob[]) {
  const counters = new Map<string, number>();
  const versions = new Map<string, number>();
  for (const job of jobs) {
    if (job.kind !== "full") continue;
    const key = job.candidateId || job.id;
    const version = job.version ?? (counters.get(key) || 0) + 1;
    counters.set(key, Math.max(counters.get(key) || 0, version));
    versions.set(job.id, version);
  }
  return versions;
}

export function preserveJobVersions(run: Run) {
  const versions = jobVersions(run.jobs);
  const counters = new Map(Object.entries(run.revisionCounters || {}));
  for (const job of run.jobs) {
    if (job.kind !== "full") continue;
    job.version = versions.get(job.id)!;
    const key = job.candidateId || job.id;
    counters.set(key, Math.max(counters.get(key) || 0, job.version));
  }
  run.revisionCounters = Object.fromEntries(counters);
}

export function reserveJobVersion(run: Run, candidateId: string) {
  const versions = jobVersions(run.jobs);
  const existing = run.jobs
    .filter((job) => job.kind === "full" && job.candidateId === candidateId)
    .map((job) => versions.get(job.id) || 0);
  const version = Math.max(Number(run.revisionCounters?.[candidateId]) || 0, 0, ...existing) + 1;
  run.revisionCounters = { ...run.revisionCounters, [candidateId]: version };
  return version;
}
