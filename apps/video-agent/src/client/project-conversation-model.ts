import type { AgentProgressEvent, Run, GenerationJob } from "../shared/contracts";
import { activityItems, mergeProgressItems, type ActivityItem } from "./agent-activity-model";

export function projectActivityTarget(
  run: Run,
  item: ActivityItem,
  titleFor: (job: GenerationJob) => string,
) {
  if (!item.jobId) return { label: "Project preparation", targetId: "project-preparation" };
  const job = run.jobs.find((entry) => entry.id === item.jobId);
  if (!job) return { label: "Earlier generation" };
  const kind =
    job.kind === "preview"
      ? "Preview"
      : run.request.outputType === "page"
        ? "Full page"
        : "Full video";
  return {
    label: `${kind} · ${titleFor(job)}`,
    targetId: job.kind === "preview" ? `generation-preview-${job.id}` : `generation-full-${job.id}`,
  };
}

export type ProjectConversationEntry = {
  id: string;
  time: string;
} & (
  | { kind: "brief" }
  | { kind: "activity"; item: ActivityItem }
  | { kind: "progress"; items: ActivityItem[] }
  | { kind: "previews"; jobIds: string[] }
  | { kind: "selection" | "full"; jobId: string }
);

export function projectConversationEntries(run: Run, events: AgentProgressEvent[]) {
  const entries: ProjectConversationEntry[] = [
    { id: "brief", kind: "brief", time: run.createdAt },
    ...activityItems(
      events.filter((event) => !run.jobs.some((job) => job.id === event.jobId)),
      false,
    ).map((item): ProjectConversationEntry => ({
      id: `activity-${item.id}`,
      kind: "activity",
      time: item.time,
      item,
    })),
  ];
  const previews = run.jobs.filter((job) => job.kind === "preview");
  if (previews.length && !run.jobs.some((job) => job.kind === "full")) {
    const started = previews
      .map((job) => job.createdAt || job.startedAt)
      .filter((time): time is string => Boolean(time))
      .sort()[0];
    const firstEvent = events.find((event) => previews.some((job) => job.id === event.jobId));
    entries.push({
      id: "previews",
      kind: "previews",
      time: started || firstEvent?.time || run.createdAt,
      jobIds: previews.map((job) => job.id),
    });
  }
  for (const job of run.jobs.filter((job) => job.kind === "full")) {
    const time =
      job.createdAt ||
      job.startedAt ||
      events.find((event) => event.jobId === job.id)?.time ||
      previews
        .filter((preview) => preview.phase === "ready")
        .map((preview) => preview.finishedAt || preview.startedAt || run.createdAt)
        .sort()
        .at(-1) ||
      run.createdAt;
    entries.push({ id: `selection-${job.id}`, kind: "selection", time, jobId: job.id });
    entries.push({ id: `full-${job.id}`, kind: "full", time, jobId: job.id });
  }
  const grouped: ProjectConversationEntry[] = [];
  for (const entry of entries.sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    const previous = grouped.at(-1);
    const merged =
      previous?.kind === "activity" && entry.kind === "activity"
        ? mergeProgressItems(previous.item, entry.item)
        : undefined;
    if (merged && previous)
      grouped[grouped.length - 1] = {
        ...previous,
        kind: "activity",
        time: merged.time,
        item: merged,
      };
    else grouped.push(entry);
  }
  const collapsed: ProjectConversationEntry[] = [];
  for (const entry of grouped) {
    if (entry.kind !== "activity" || entry.item.kind === "message") {
      collapsed.push(entry);
      continue;
    }
    const previous = collapsed.at(-1);
    if (previous?.kind === "progress" && previous.items[0].scope === entry.item.scope)
      previous.items.push(entry.item);
    else
      collapsed.push({
        id: `progress-${entry.item.id}`,
        kind: "progress",
        time: entry.time,
        items: [entry.item],
      });
  }
  return collapsed;
}
