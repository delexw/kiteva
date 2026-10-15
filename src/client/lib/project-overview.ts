import { isRunSettled, terminalPhases, type Run } from "../../shared/contracts";

export function projectOverview(project: Run) {
  const activeJobs = project.jobs.filter((job) => !terminalPhases.has(job.phase));
  const activeFull = activeJobs.find((job) => job.kind === "full");
  const readyMedia = project.jobs
    .filter((job) => job.phase === "ready" && (job.video || job.page))
    .sort(
      (a, b) =>
        Date.parse(b.createdAt || project.createdAt) - Date.parse(a.createdAt || project.createdAt),
    );
  const fullResults = readyMedia.filter((job) => job.kind === "full");
  const media = fullResults[0];
  const previews = project.jobs.filter((job) => job.kind === "preview");
  const phase = activeFull?.phase || activeJobs[0]?.phase || project.phase;
  const stages = {
    queued: "Waiting to start",
    preparing: "Preparing project",
    ranking: "Exploring directions",
    generating: activeFull
      ? project.request.outputType === "page"
        ? "Building full page"
        : "Building full video"
      : "Preparing previews",
    validating: "Checking result",
    rendering: "Rendering result",
    ready: "Ready",
    failed: "Needs attention",
    cancelled: "Cancelled",
    interrupted: "Interrupted",
  };
  return {
    active: !isRunSettled(project),
    phase,
    stage: stages[phase],
    media,
    fullResults,
    previewCount: previews.length,
    readyPreviews: previews.filter((job) => job.phase === "ready").length,
    startedAt: activeFull?.startedAt || activeJobs[0]?.startedAt || project.createdAt,
  };
}
