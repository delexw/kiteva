import type { GenerationJob } from "../../shared/contracts";

type GenerationTiming = Pick<
  GenerationJob,
  "startedAt" | "finishedAt" | "generationMs" | "renderMs"
> & {
  validationMs?: number;
};

export function GenerationTime({ job, now }: { job: GenerationTiming; now: number }) {
  const hasRecordedTime = [job.generationMs, job.renderMs, job.validationMs].some(
    (value) => value !== undefined,
  );
  const recordedTime = (job.generationMs || 0) + (job.renderMs || 0) + (job.validationMs || 0);
  const elapsedTime = job.startedAt
    ? (job.finishedAt ? Date.parse(job.finishedAt) : now) - Date.parse(job.startedAt)
    : undefined;
  const totalTime =
    job.finishedAt && hasRecordedTime
      ? recordedTime
      : (elapsedTime ?? (hasRecordedTime ? recordedTime : undefined));
  if (totalTime === undefined) return null;
  return <p className="rationale">Generation {Math.max(0, Math.round(totalTime / 1000))}s</p>;
}
