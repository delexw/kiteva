import { translateUi } from "../i18n/service";
import type { ThoughtChainItemType } from "@ant-design/x";
import {
  terminalPhases,
  type AgentProgressEvent,
  type GenerationJob,
  type Run,
} from "../../shared/contracts";
import {
  directionRoundBoundaries,
  directionRoundOf,
  directionRoundOfEvent,
  directionRoundSteps,
  jobDirectionRound,
} from "../../shared/direction-rounds";
import {
  preparationStepLabel,
  preparationSteps,
  type PreparationCheckpoint,
  type PreparationStep,
} from "../../shared/preparation";
import { activityItems, type ActivityItem } from "../agent-activity-model";
import { displayActivityItems } from "../activity-display";
import { roomQuestionScope } from "./question-scope";

type StageStatus = ThoughtChainItemType["status"];
export type RoomActivityContext = {
  key: string;
  label: string;
  status: StageStatus;
  summary: string;
  items: ActivityItem[];
  checkpoints: ThoughtChainItemType[];
};

const phaseLabels: Partial<Record<GenerationJob["phase"], string>> = {
  queued: "Waiting for a free worker",
  generating: "Building",
  validating: "Checking",
  rendering: "Rendering",
  ready: "Ready",
  failed: "Needs attention",
  cancelled: "Stopped",
  interrupted: "Interrupted",
};
const preparingPhases = new Set<Run["phase"]>(["queued", "preparing", "ranking"]);

function jobStatus(phase: GenerationJob["phase"], waiting: boolean): StageStatus {
  if (waiting) return undefined;
  if (phase === "ready") return "success";
  if (phase === "failed") return "error";
  if (phase === "cancelled" || phase === "interrupted") return "abort";
  return "loading";
}
function checkpointItems(
  checkpoints: Partial<Record<PreparationStep, PreparationCheckpoint>> = {},
  run?: Run,
): ThoughtChainItemType[] {
  return preparationSteps.flatMap((step) => {
    const checkpoint = checkpoints[step];
    if (!checkpoint) return [];
    const status: StageStatus =
      checkpoint.state === "completed"
        ? "success"
        : checkpoint.state === "failed"
          ? "error"
          : checkpoint.state === "interrupted"
            ? "abort"
            : "loading";
    return [
      {
        key: step,
        title: translateUi(preparationStepLabel(step, run?.request, run?.preparation)),
        status,
      },
    ];
  });
}
function preparationStatus(
  run: Run,
  checkpoints: ThoughtChainItemType[],
  produced: boolean,
): StageStatus {
  if (run.inputWaits?.some((wait) => !wait.jobId)) return undefined;
  if (preparingPhases.has(run.phase)) return "loading";
  if (produced) return "success";
  if (run.phase === "failed") return "error";
  if (run.phase === "cancelled" || run.phase === "interrupted") return "abort";
  return checkpoints.every((checkpoint) => checkpoint.status === "success") ? "success" : undefined;
}
function duration(items: ActivityItem[]) {
  if (items.length < 2) return "";
  const seconds = Math.max(
    0,
    Math.round((Date.parse(items.at(-1)!.time) - Date.parse(items[0].time)) / 1000),
  );
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}
function summary(status: StageStatus, items: ActivityItem[], fallback: string) {
  const steps = displayActivityItems(items.filter((item) => item.kind !== "message"));
  if (status === "loading") return translateUi(steps.at(-1)?.text || fallback);
  if (status === undefined && fallback) return fallback;
  if (!items.length) return fallback;
  const took = duration(items);
  return [fallback, took && translateUi("worked for {{time}}", { time: took })]
    .filter(Boolean)
    .join(" · ");
}

export function roomActivityContexts(
  run: Run,
  events: AgentProgressEvent[],
): RoomActivityContext[] {
  const ordered = [...new Map(events.map((event) => [event.id, event])).values()].sort(
    (a, b) => a.id - b.id,
  );
  const boundaries = directionRoundBoundaries(run, ordered);
  const rounds = [0, ...boundaries.keys()];
  const latestRound = rounds.at(-1)!;
  const shownRound = (round: number) => Math.max(...rounds.filter((shown) => shown <= round));
  const preparationKey = (round: number) => (round ? `main:round-${round}` : "main");
  const byContext = new Map<string, ActivityItem[]>();
  const projectEvents = new Map<number, AgentProgressEvent[]>();
  const jobEvents: AgentProgressEvent[] = [];
  for (const event of ordered) {
    if (event.jobId) {
      jobEvents.push(event);
      continue;
    }
    const round = directionRoundOfEvent(boundaries, event.id);
    projectEvents.set(round, [...(projectEvents.get(round) || []), event]);
  }
  for (const [round, roundEvents] of projectEvents)
    byContext.set(preparationKey(round), activityItems(roundEvents, true, run));
  for (const item of activityItems(jobEvents)) {
    const key = run.jobs.some((job) => job.id === item.jobId) ? item.jobId! : "earlier";
    byContext.set(key, [...(byContext.get(key) || []), item]);
  }
  const context = (
    key: string,
    label: string,
    status: StageStatus,
    fallback: string,
    checkpoints: ThoughtChainItemType[] = [],
  ): RoomActivityContext => {
    const items = byContext.get(key) || [];
    return {
      key,
      label,
      status,
      summary: summary(status, items, translateUi(fallback)),
      items,
      checkpoints,
    };
  };
  const waits = run.inputWaits || [];
  const record = (round: number) => run.directionRounds?.find((entry) => entry.round === round);
  const jobsOf = (round: number) =>
    run.jobs.filter((job) => shownRound(jobDirectionRound(job)) === round);
  const timeline: Array<{ context: RoomActivityContext; start?: string }> = [];
  for (const round of rounds) {
    const current = round === latestRound;
    const directionCheckpoints = current
      ? run.preparation?.checkpoints
      : record(round + 1)?.replacedCheckpoints;
    const checkpoints = checkpointItems(
      Object.fromEntries(
        preparationSteps.flatMap((step) => {
          const source = directionRoundSteps.includes(step)
            ? directionCheckpoints
            : round
              ? undefined
              : run.preparation?.checkpoints;
          return source?.[step] ? [[step, source[step]]] : [];
        }),
      ),
      run,
    );
    const jobs = jobsOf(round);
    const status = current
      ? preparationStatus(
          run,
          checkpoints,
          jobs.length > 0 ||
            run.candidates.some(
              (candidate) => shownRound(directionRoundOf(candidate.id)) === round,
            ),
        )
      : jobs.length
        ? "success"
        : checkpoints.some((checkpoint) => checkpoint.status === "error")
          ? "error"
          : "abort";
    const key = preparationKey(round);
    const preparation = context(
      key,
      round
        ? translateUi("New directions · round {{round}}", { round: round + 1 })
        : translateUi("Project preparation"),
      status,
      current && status === undefined && waits.some((wait) => !wait.jobId)
        ? "Waiting for your decision"
        : status === "loading"
          ? round
            ? "Preparing new directions"
            : "Preparing your project"
          : !current && !jobs.length
            ? "Replaced by new directions"
            : "",
      checkpoints,
    );
    if (
      preparation.items.length ||
      preparation.checkpoints.length ||
      (current && status === "loading") ||
      (round && current)
    )
      timeline.push({
        context: preparation,
        start: round ? record(round)?.startedAt || preparation.items[0]?.time : run.createdAt,
      });
    for (const job of jobs) {
      const waiting = waits.some((wait) => wait.jobId === job.id);
      const status = jobStatus(job.phase, waiting);
      const phase = translateUi(phaseLabels[job.phase] || job.phase);
      const jobContext = context(
        job.id,
        `${roomQuestionScope(run, job.id)}${round ? translateUi(" · round {{round}}", { round: round + 1 }) : ""}`,
        status,
        waiting
          ? "Waiting for your decision"
          : `${job.refinementPrompt ? translateUi("Fine-tune · ") : ""}${phase}`,
      );
      timeline.push({
        context: jobContext,
        start: job.createdAt || job.startedAt || jobContext.items[0]?.time,
      });
    }
  }
  let previous = Number.NEGATIVE_INFINITY;
  const contexts = timeline
    .map((entry) => {
      const parsed = entry.start ? Date.parse(entry.start) : Number.NaN;
      previous = Number.isNaN(parsed) ? previous : parsed;
      return { context: entry.context, start: previous };
    })
    .sort((a, b) => a.start - b.start)
    .map((entry) => entry.context);
  if (byContext.has("earlier"))
    contexts.push(context("earlier", translateUi("Earlier generation"), "success", ""));
  return contexts;
}

export function isRoomActivityLive(run: Run) {
  return (
    preparingPhases.has(run.phase) ||
    run.jobs.some(
      (job) =>
        !terminalPhases.has(job.phase) && !run.inputWaits?.some((wait) => wait.jobId === job.id),
    )
  );
}
