import { useLayoutEffect, useRef, useState } from "react";
import { StoryboardCrew } from "../storyboard-crew";
import { useViewportVisibility } from "../use-viewport-visibility";
import { terminalPhases, type Run } from "../../shared/contracts";
import { projectOverview } from "../lib/project-overview";

export const productionSetSize = { width: 380, height: 165 };
export function productionSetScale(width: number, height: number) {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(1.12, width / productionSetSize.width, height / productionSetSize.height);
}

export function ProjectResultPending({ project, visible }: { project: Run; visible?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (!slot.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(productionSetScale(entry.contentRect.width, entry.contentRect.height)),
    );
    observer.observe(slot.current);
    return () => observer.disconnect();
  }, []);
  const inView = useViewportVisibility(container, 0);
  const shown = visible ?? inView;
  const overview = projectOverview(project);
  const fullJobs = project.jobs.filter((job) => job.kind === "full");
  const activeFull = fullJobs.some((job) => !terminalPhases.has(job.phase));
  const waitingForInput = Boolean(project.inputWaits?.length);
  const working =
    !waitingForInput &&
    (project.jobs.some((job) => !terminalPhases.has(job.phase)) ||
      ["queued", "preparing", "ranking"].includes(project.phase));
  const page = project.request.outputType === "page";
  const awaitingDirection =
    !activeFull && !fullJobs.length && !working && overview.readyPreviews > 0;
  const title = waitingForInput
    ? "Waiting for your decision"
    : activeFull
      ? page
        ? "Building your page…"
        : overview.phase === "rendering"
          ? "Rendering your film…"
          : "Making your film…"
      : fullJobs.length
        ? "Build needs attention"
        : working
          ? "Making previews…"
          : overview.readyPreviews
            ? "Choose a direction"
            : "No finished result yet";
  return (
    <div
      ref={container}
      className={`project-result-pending ${working && shown ? "is-working" : ""}`}
      role="status"
      aria-label="Full result status"
    >
      <div className="project-production-slot" ref={slot}>
        <div
          className="project-production-set"
          aria-hidden="true"
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <div className="production-set-board">
            <span>ON SET · {activeFull ? "FULL FILM" : "DIRECTIONS"}</span>
            <div className="production-set-scene">
              <i />
              <i />
              <i />
              <i />
            </div>
            <small>
              {overview.readyPreviews}/{overview.previewCount || project.request.candidateCount}{" "}
              ready
            </small>
          </div>
          <div className="production-set-director">
            <span className="production-set-speech">
              {working ? (activeFull ? "Action!" : "Finding the shot…") : "Your call!"}
            </span>
            <StoryboardCrew role="director" reaction />
          </div>
          <div className="production-set-stage">
            <StoryboardCrew role="stage" />
          </div>
          <div className="production-set-camera">
            <StoryboardCrew role="camera" />
            <i className="production-set-recording" />
          </div>
          <div className="production-set-floor" />
        </div>
      </div>
      <h3>
        {(awaitingDirection || waitingForInput) && (
          <span
            className={`production-waiting-dots ${shown ? "is-visible" : ""}`}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
          </span>
        )}
        {title}
      </h3>
    </div>
  );
}
