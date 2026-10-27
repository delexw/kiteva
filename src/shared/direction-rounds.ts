import type { AgentProgressEvent, GenerationJob, Run } from "./contracts";
import type { PreparationCheckpoint, PreparationStep } from "./preparation";

export const directionRoundSteps: readonly PreparationStep[] = [
  "proposals",
  "selection",
  "preview-plan",
];
export interface DirectionRoundRecord {
  round: number;
  startedAt: string;
  afterEventId: number;
  replacedCheckpoints: Partial<Record<PreparationStep, PreparationCheckpoint>>;
}

export function directionCandidateId(round: number, id: string) {
  return round ? `round-${round}-${id}` : id;
}
export function directionRoundOf(candidateId?: string) {
  const match = candidateId?.match(/^round-(\d+)-/);
  return match ? Number(match[1]) : 0;
}
export function jobDirectionRound(job: Pick<GenerationJob, "candidateId">) {
  return directionRoundOf(job.candidateId);
}

export function directionRoundBoundaries(run: Run, events: readonly AgentProgressEvent[]) {
  const boundaries = new Map<number, number>();
  const roundOfJob = new Map(run.jobs.map((job) => [job.id, jobDirectionRound(job)]));
  let previous = 0;
  for (let round = 1; round <= (run.directionRound || 0); round++) {
    const recorded = run.directionRounds?.find((entry) => entry.round === round)?.afterEventId;
    const inferred = Math.max(
      0,
      ...events
        .filter((event) => event.jobId && (roundOfJob.get(event.jobId) ?? round) < round)
        .map((event) => event.id),
    );
    const boundary = recorded ?? (inferred > previous ? inferred : undefined);
    if (boundary === undefined) continue;
    boundaries.set(round, boundary);
    previous = boundary;
  }
  return boundaries;
}
export function directionRoundOfEvent(boundaries: ReadonlyMap<number, number>, eventId: number) {
  let found = 0;
  for (const [round, after] of boundaries) if (eventId > after && round > found) found = round;
  return found;
}
