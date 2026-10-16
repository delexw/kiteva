import { VideoPlayer } from "./video-player";
import { useEffect, useRef, useState } from "react";
import { useViewportVisibility } from "../use-viewport-visibility";
import { Button } from "antd";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, FileCode2, Film, Play } from "lucide-react";
import { ProjectResultPending } from "./project-result-pending";
import { ProjectPreviewFrame } from "./project-preview-frame";
import { type Run } from "../../shared/contracts";
import { projectName } from "../../shared/project-name";
import { cardClipOf, playbackVideoOf } from "../../shared/domains/video";
import { candidateDisplayTitle } from "../../shared/candidate-copy";
import { projectOverview } from "../lib/project-overview";
import { InteractivePagePreview } from "../domains/page/preview";

export function ProjectMediaStack({ project, onOpen }: { project: Run; onOpen: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const hasEnteredViewport = useViewportVisibility(container, 0, true);
  const visible = useViewportVisibility(container, 0);
  const { media: latest, fullResults } = projectOverview(project);
  const [selectedId, setSelectedId] = useState<string>();
  const [rotationDirection, setRotationDirection] = useState<-1 | 0 | 1>(0);
  const reducedMotion = useReducedMotion();
  const selectedIndex = Math.max(
    0,
    fullResults.findIndex((job) => job.id === selectedId),
  );
  const media = fullResults[selectedIndex] || latest;
  const stacked = fullResults.length > 1;
  const title = media && project.candidates.find((candidate) => candidate.id === media.candidateId);
  const artifact = (file: string) => `/api/artifacts/${project.id}/${media!.id}/${file}`;
  const clip = media && cardClipOf(media);
  const clipSource = clip ? artifact(clip) : undefined;
  const clipPlayer = useRef<HTMLVideoElement>(null);
  const playClip = Boolean(clip) && hasEnteredViewport && visible && !reducedMotion;
  useEffect(() => {
    const player = clipPlayer.current;
    if (!player) return;
    if (playClip) player.play().catch(() => player.pause());
    else player.pause();
    return () => player.pause();
  }, [playClip, clipSource]);
  function rotate(offset: -1 | 1) {
    setRotationDirection(offset);
    setSelectedId(
      fullResults[(selectedIndex + offset + fullResults.length) % fullResults.length].id,
    );
  }
  return (
    <ProjectPreviewFrame
      ref={container}
      variant={
        media && !hasEnteredViewport
          ? "placeholder"
          : media?.page
            ? "page"
            : media?.video
              ? "video"
              : "progress"
      }
      label={`Results for ${projectName(project)}`}
      carousel={stacked}
    >
      <div className={`project-media-stack ${stacked ? "has-multiple-results" : ""}`}>
        {stacked && (
          <>
            <motion.div
              key={`${media?.id}-back`}
              className="project-media-stack-back"
              aria-hidden="true"
              initial={{ x: 0, y: -8, rotate: -2 }}
              animate={
                reducedMotion || !rotationDirection
                  ? { x: 0, y: -8, rotate: -2 }
                  : {
                      x: [0, rotationDirection * 10, 0],
                      y: [-8, -2, -8],
                      rotate: [-2, rotationDirection, -2],
                    }
              }
              transition={{ duration: 0.42, ease: "easeInOut" }}
            />
            <motion.div
              key={`${media?.id}-middle`}
              className="project-media-stack-middle"
              aria-hidden="true"
              initial={{ x: 0, y: -4, rotate: 1 }}
              animate={
                reducedMotion || !rotationDirection
                  ? { x: 0, y: -4, rotate: 1 }
                  : {
                      x: [0, rotationDirection * 16, 0],
                      y: [-4, 0, -4],
                      rotate: [1, rotationDirection * 2, 1],
                    }
              }
              transition={{ duration: 0.36, ease: "easeInOut" }}
            />
          </>
        )}
        <motion.div
          key={media?.id || "empty"}
          className="project-media-stack-front"
          initial={
            reducedMotion
              ? false
              : {
                  opacity: 0.6,
                  x: (rotationDirection || 1) * 18,
                  rotate: (rotationDirection || 1) * 1.5,
                }
          }
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ duration: 0.22 }}
        >
          {media && !hasEnteredViewport ? (
            <div className="recent-project-placeholder" aria-label="Preview loads when visible">
              {project.request.outputType === "page" ? (
                <FileCode2 aria-hidden="true" />
              ) : (
                <Film aria-hidden="true" />
              )}
              <p>Preview</p>
            </div>
          ) : media?.outputType === "page" && media.page ? (
            <InteractivePagePreview
              job={media}
              title={projectName(project)}
              viewport={
                project.request.outputType === "page" ? project.request.viewport : "desktop"
              }
            />
          ) : clip ? (
            <>
              <video
                ref={clipPlayer}
                className="project-card-clip"
                aria-label={`Clip from ${projectName(project)}`}
                src={clipSource}
                poster={media.poster ? artifact(media.poster) : undefined}
                muted
                loop
                playsInline
                preload="metadata"
              />
            </>
          ) : media?.video ? (
            <VideoPlayer
              aria-label={`Video project: ${projectName(project)}`}
              src={artifact(playbackVideoOf(media)!)}
              poster={media.poster ? artifact(media.poster) : undefined}
              playsInline
              preload="none"
            />
          ) : (
            <ProjectResultPending project={project} visible={visible} />
          )}
          {media?.video && hasEnteredViewport && (
            <Button
              className="project-card-play"
              size="small"
              icon={<Play size={14} />}
              aria-label={`Play film: ${projectName(project)}`}
              onClick={onOpen}
            >
              Play film
            </Button>
          )}
        </motion.div>
      </div>
      {stacked ? (
        <div className="project-media-stack-controls">
          <Button
            className="project-stack-previous"
            aria-label={`Previous result for ${projectName(project)}`}
            icon={<ArrowLeft size={16} />}
            onClick={() => rotate(-1)}
          />
          {title && (
            <span className="project-media-stack-label" aria-live="polite" aria-atomic="true">
              <small>{candidateDisplayTitle(title)}</small>
            </span>
          )}
          <Button
            className="project-stack-next"
            aria-label={`Next result for ${projectName(project)}`}
            icon={<ArrowRight size={16} />}
            onClick={() => rotate(1)}
          />
        </div>
      ) : (
        media && <span className="recent-project-media-caption">Latest finished result</span>
      )}
    </ProjectPreviewFrame>
  );
}
