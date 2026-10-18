import { translateUi } from "../i18n/service";
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
    queued: translateUi("Waiting to start"),
    preparing: translateUi("Preparing project"),
    ranking: translateUi("Exploring directions"),
    generating: activeFull
      ? project.request.outputType === "page"
        ? translateUi("Building full page")
        : translateUi("Building full video")
      : translateUi("Preparing previews"),
    validating: translateUi("Checking result"),
    rendering: translateUi("Rendering result"),
    ready: translateUi("Ready"),
    failed: translateUi("Needs attention"),
    cancelled: translateUi("Cancelled"),
    interrupted: translateUi("Interrupted"),
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
