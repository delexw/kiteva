import { translateUi, useUiLanguage } from "../i18n";
import { ProjectSettings } from "./project-settings";
import { PromptText } from "./style-mention";
import { VideoRefinement } from "./video-refinement";
import { Button, Card } from "antd";
import { Fragment, useMemo, useState, type ReactNode, type Ref } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";
import type {
  AgentProgressEvent,
  GenerationJob,
  Run,
  Style,
  StyleExample,
} from "../../shared/contracts";
import { projectConversationEntries, projectActivityTarget } from "../project-conversation-model";
import { ActivityRow, GenerationActivity, ProgressDisclosure } from "../agent-activity";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/conversation";
import { Message, MessageContent } from "./ai-elements/message";
import { PreviewWorkspace, PreviewLoadingMedia } from "./preview-workspace";
import { AssetQuestions } from "./asset-questions";
import { GenerationTime } from "./generation-time";

function GenerationProgressCard({
  job,
  title,
  now,
  onCancel,
  activity,
}: {
  job: GenerationJob;
  title: string;
  now: number;
  onCancel?: () => void;
  activity?: ReactNode;
}) {
  useUiLanguage();
  const active = !["ready", "failed", "cancelled", "interrupted"].includes(job.phase);
  return (
    <Card
      id={`generation-progress-${job.id}`}
      tabIndex={-1}
      className="candidate generation-progress-card studio-result-card"
      aria-busy={active}
    >
      <div className="candidate-body">
        <h3>{title}</h3>
        <PreviewLoadingMedia
          status={
            job.phase === "queued"
              ? "Waiting to start"
              : job.phase === "rendering"
                ? "Rendering your project"
                : "Creating your project"
          }
        />
        <GenerationTime job={job} now={now} />
        {activity}
        {active && onCancel && (
          <div className="candidate-actions">
            <Button className="secondary compact" onClick={onCancel}>
              {translateUi("Cancel")}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function ProjectConversation({
  styles,
  examples,
  contextRef,
  onRunUpdated,
  run,
  events,
  now,
  titleFor,
  controls,
  renderPreview,
  renderFull,
  onCancel,
  onPreviewActivate,
}: {
  styles?: Pick<Style, "id" | "name_en">[];
  examples?: StyleExample[];
  contextRef?: Ref<StickToBottomContext>;
  onRunUpdated: (run: Run) => void;
  run: Run;
  events: AgentProgressEvent[];
  now: number;
  titleFor: (job: GenerationJob) => string;
  controls: ReactNode;
  renderPreview: (job: GenerationJob, activity?: ReactNode) => ReactNode;
  renderFull: (job: GenerationJob, activity?: ReactNode) => ReactNode;
  onCancel?: (jobId: string) => void;
  onPreviewActivate?: () => void;
}) {
  useUiLanguage();
  const [previewPanelOpen, setPreviewPanelOpen] = useState(true);
  const hasFullBuild = run.jobs.some((job) => job.kind === "full");
  const previews = run.jobs.filter((job) => job.kind === "preview");
  const entries = useMemo(() => projectConversationEntries(run, events), [run, events]);
  const active = (job: GenerationJob) =>
    !["ready", "failed", "cancelled", "interrupted"].includes(job.phase);
  return (
    <section className="project-chat" aria-label={translateUi("Project conversation")}>
      <div className="section-heading">
        <h2>{translateUi("Project conversation")}</h2>
        {hasFullBuild ? (
          <Button
            className="secondary compact project-action-button"
            aria-expanded={previewPanelOpen}
            onClick={() => setPreviewPanelOpen((open) => !open)}
          >
            {translateUi("Preview choices")}
          </Button>
        ) : (
          <span className="local-dot" />
        )}
      </div>
      <ProjectSettings run={run} styles={styles} examples={examples} />
      <div className="project-chat-body">
        <Conversation
          contextRef={contextRef}
          className="project-chat-conversation"
          aria-label={translateUi("Project activity")}
          aria-live="polite"
          aria-relevant="additions text"
        >
          <ConversationContent
            className="project-chat-messages"
            scrollClassName="project-main-scroll"
          >
            {entries.map((entry) => {
              if (entry.kind === "progress")
                return (
                  <ProgressDisclosure
                    key={entry.id}
                    items={entry.items}
                    title={projectActivityTarget(run, entry.items[0], titleFor).label}
                    active={
                      ["preparing", "ranking"].includes(run.phase) && entry === entries.at(-1)
                    }
                    now={now}
                  />
                );
              if (entry.kind === "activity")
                return (
                  <ActivityRow
                    item={entry.item}
                    target={projectActivityTarget(run, entry.item, titleFor)}
                    key={entry.id}
                  />
                );
              if (entry.kind === "brief")
                return (
                  <Fragment key={entry.id}>
                    <Message
                      id="project-preparation"
                      tabIndex={-1}
                      from="user"
                      className="project-chat-user"
                    >
                      <MessageContent>
                        <div className="project-brief-section">
                          <h3>{translateUi("Main prompt")}</h3>
                          <p>
                            <PromptText>{run.request.instructions}</PromptText>
                          </p>
                          {run.request.requirements?.main.instructions && (
                            <p>
                              <PromptText>{run.request.requirements.main.instructions}</PromptText>
                            </p>
                          )}
                        </div>
                        {(
                          [
                            [
                              "Music / instrumental requirements",
                              run.request.requirements?.music.instructions,
                            ],
                            ["Image requirements", run.request.requirements?.images.instructions],
                            ["URL requirements", run.request.requirements?.urls.instructions],
                          ] as const
                        ).map(([label, instructions]) =>
                          instructions ? (
                            <div className="project-brief-section" key={label}>
                              <h3>{label}</h3>
                              <p>
                                <PromptText>{instructions}</PromptText>
                              </p>
                            </div>
                          ) : null,
                        )}
                        {run.request.urls.length > 0 && (
                          <div className="project-brief-section">
                            <h3>{translateUi("Website URLs")}</h3>
                            <ul>
                              {run.request.urls.map((url) => (
                                <li key={url}>
                                  <a href={url} target="_blank" rel="noreferrer">
                                    {url}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </MessageContent>
                    </Message>
                    <AssetQuestions key={run.id} run={run} onUpdated={onRunUpdated} />
                  </Fragment>
                );
              if (entry.kind === "previews")
                return (
                  <Message from="assistant" key={entry.id} className="project-chat-artifact">
                    <MessageContent>
                      <h2>
                        {previews.some(active)
                          ? translateUi("Creating your previews")
                          : translateUi("Choose your direction")}
                      </h2>
                      <PreviewWorkspace
                        jobIds={entry.jobIds}
                        controls={previews.some((job) => job.phase === "ready") ? controls : null}
                        renderCard={(id) => {
                          const job = previews.find((job) => job.id === id)!;
                          const activity = (
                            <GenerationActivity
                              events={events}
                              jobId={job.id}
                              title={titleFor(job)}
                              completed={!active(job)}
                            />
                          );
                          return (
                            <div
                              id={`generation-preview-${job.id}`}
                              tabIndex={-1}
                              className="project-job-target"
                            >
                              {active(job) ? (
                                <GenerationProgressCard
                                  job={job}
                                  title={titleFor(job)}
                                  now={now}
                                  activity={activity}
                                  onCancel={onCancel ? () => onCancel(job.id) : undefined}
                                />
                              ) : (
                                renderPreview(job, activity)
                              )}
                              <AssetQuestions run={run} jobId={job.id} onUpdated={onRunUpdated} />
                            </div>
                          );
                        }}
                      />
                    </MessageContent>
                  </Message>
                );
              const job = run.jobs.find((job) => job.id === entry.jobId)!;
              const output = run.request.outputType === "page" ? "page" : "video";
              if (entry.kind === "selection")
                return (
                  <Message from="user" key={entry.id} className="project-chat-user">
                    <MessageContent>
                      <p>
                        {job.refinementPrompt
                          ? translateUi("Fine-tune: {{value0}}", { value0: job.refinementPrompt })
                          : translateUi("Build the full {{value0}} using {{value1}}.", {
                              value0: output,
                              value1: titleFor(job),
                            })}
                      </p>
                    </MessageContent>
                  </Message>
                );
              const activity = (
                <GenerationActivity
                  events={events}
                  jobId={job.id}
                  title={titleFor(job)}
                  label={translateUi("Full {{value0}}", { value0: output })}
                  completed={!active(job)}
                />
              );
              return (
                <Message from="assistant" key={entry.id} className="project-chat-artifact">
                  <MessageContent>
                    <h2>
                      {active(job)
                        ? translateUi("Building your full {{value0}}", { value0: output })
                        : job.phase === "ready"
                          ? translateUi("Your finished {{value0}}", { value0: output })
                          : translateUi("Build needs attention")}
                    </h2>
                    <div
                      id={`generation-full-${job.id}`}
                      tabIndex={-1}
                      className="project-job-target"
                    >
                      {active(job) ? (
                        <GenerationProgressCard
                          job={job}
                          title={titleFor(job)}
                          now={now}
                          activity={activity}
                          onCancel={onCancel ? () => onCancel(job.id) : undefined}
                        />
                      ) : (
                        renderFull(job, activity)
                      )}
                      <AssetQuestions run={run} jobId={job.id} onUpdated={onRunUpdated} />
                    </div>
                  </MessageContent>
                </Message>
              );
            })}
            {!events.length && !run.jobs.length && (
              <p role="status">{translateUi("Preparing your project…")}</p>
            )}
            <VideoRefinement key={`refine-${run.id}`} run={run} onUpdated={onRunUpdated} />
          </ConversationContent>
          <ConversationScrollButton aria-label={translateUi("Jump to latest project update")} />
        </Conversation>
        {hasFullBuild && previewPanelOpen && (
          <aside className="project-preview-panel" aria-label={translateUi("Preview choices")}>
            <h3>{translateUi("Preview choices")}</h3>
            <p>
              {translateUi(
                "Your finished versions are saved. Select another preview to build another version.",
              )}
            </p>
            <div className="project-preview-panel-content">
              <PreviewWorkspace
                jobIds={previews.map((job) => job.id)}
                controls={controls}
                renderCard={(id) => (
                  <div
                    id={`generation-preview-${id}`}
                    tabIndex={-1}
                    onClickCapture={onPreviewActivate}
                  >
                    {renderPreview(
                      previews.find((job) => job.id === id)!,
                      <GenerationActivity
                        events={events}
                        jobId={id}
                        title={titleFor(previews.find((job) => job.id === id)!)}
                        completed={!active(previews.find((job) => job.id === id)!)}
                      />,
                    )}
                    <AssetQuestions run={run} jobId={id} onUpdated={onRunUpdated} />
                  </div>
                )}
              />
              {previews.length > 0 &&
                previews.every((preview) =>
                  run.jobs.some(
                    (job) =>
                      job.kind === "full" &&
                      job.phase === "ready" &&
                      job.candidateId === preview.candidateId,
                  ),
                ) && <p>{translateUi("All directions built")}</p>}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
