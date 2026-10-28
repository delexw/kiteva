import { isVideoRefinementSource } from "../../shared/video-refinement-source";
import {
  RefinementHistoryReview,
  useRefinementExclusions,
} from "../components/refinement-history-review";
import { availableRefinementInstructions } from "../../shared/refinement-history";
import { ProjectActivityPanel } from "./project-activity-panel";
import { ReferenceSignIn } from "../components/reference-sign-in";
import { RefinementMessage } from "../components/refinement-message";
import {
  ConversationAttachments,
  useConversationAttachments,
} from "../components/conversation-attachments";
import { RefinementImages, useRefinementImages } from "../components/refinement-images";
import { translateUi, useUiLanguage } from "../i18n";
import { Bubble, Sender } from "@ant-design/x";
import { Alert, Button, Select, Tabs } from "antd";
import { useMemo, useState, type ReactNode } from "react";
import { roomActivityContexts } from "./project-stages";
import {
  type Run,
  type Style,
  type StyleExample,
  type GenerationJob,
  type AgentProgressEvent,
  terminalPhases,
} from "../../shared/contracts";
import { projectOverview } from "../lib/project-overview";
import { PromptText } from "../components/style-mention";
import { ProjectSettings } from "../components/project-settings";
import { ProjectResultPending } from "../components/project-result-pending";
import { api } from "../lib/api";
import { scopedAssetQuestions } from "../../shared/asset-question-scopes";
import { RoomActivityNow, RoomActivityTab } from "./room-activity";
import { roomQuestionScope } from "./question-scope";
import { roomProjectTabs, type RoomProjectView } from "../../shared/room";
import { candidateDisplayTitle } from "../../shared/candidate-copy";
import { fullRevisionGroups } from "../lib/revision-stack";
import {
  RevisionStack,
  useRevisionSelection,
  type RevisionSlots,
} from "../components/revision-stack";

const sectionLabels: Record<string, string> = {
  main: "Documents",
  images: "Images",
  music: "Music",
  urls: "Websites",
};
export function RoomProject({
  run,
  styles = [],
  examples = [],
  events,
  renderPreview,
  renderFull,
  controls,
  onQuestion,
  onUpdated,
  onEdit,
  onCancel,
  onCancelJob,
  onRetry,
  view,
  onView,
}: {
  run: Run;
  styles?: Pick<Style, "id" | "name_en">[];
  examples?: StyleExample[];
  events: AgentProgressEvent[];
  renderPreview: (job: GenerationJob) => ReactNode;
  /** Renders one full-result card; revision slots place the switcher/strip inside that card. */
  renderFull: (job: GenerationJob, revisions?: RevisionSlots) => ReactNode;
  controls: ReactNode;
  onQuestion: (id: string) => void;
  onUpdated: (run: Run) => void;
  onEdit: () => void;
  onCancel: () => void;
  onCancelJob?: (jobId: string) => void;
  onRetry: (jobId?: string) => void | Promise<void>;
  view: RoomProjectView;
  onView: (view: RoomProjectView) => void;
}) {
  const { language } = useUiLanguage();
  const activityContexts = useMemo(
    () => roomActivityContexts(run, events),
    [run, events, language],
  );
  const [discardedRefinements, setDiscardedRefinements] = useRefinementExclusions(run);
  const refinementImages = useRefinementImages(run.id, run.request.assetIds);
  const overview = projectOverview(run);
  const full = run.jobs.filter((job) => job.kind === "full");
  const fullGroups = fullRevisionGroups(run.jobs);
  const [revisionSelection, selectRevision] = useRevisionSelection();
  const candidateTitle = (candidateId: string) => {
    const candidate = run.candidates.find((item) => item.id === candidateId);
    return candidateDisplayTitle(
      candidate,
      candidate ? run.candidates.indexOf(candidate) + 1 : undefined,
    );
  };
  const tab = view.tab || (full.length ? "full" : "previews");
  const setTab = (next: string) =>
    onView({ ...view, tab: roomProjectTabs.find((item) => item === next) });
  const refine = view.refine;
  const setRefine = (text: string) => onView({ ...view, refine: text });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refinementSources = full.filter(isVideoRefinementSource);
  const refineId = refinementSources.some((job) => job.id === view.refineJobId)
    ? view.refineJobId
    : (refinementSources.filter((job) => job.phase === "ready").at(-1) || refinementSources.at(-1))
        ?.id;
  const storyboards = full.filter(
    (job) => job.outputType !== "page" && (job.storyboardReady || job.phase === "ready"),
  );
  const questions = scopedAssetQuestions(run);
  const attachments = useConversationAttachments(run.id, run.request.assetIds);
  const briefAssetIds = run.request.assetIds.filter(
    (id) => !questions.some((question) => question.assetIds?.includes(id)),
  );
  const open = questions.filter((q) => q.state === "open");
  const pending = (jobId?: string, version?: number) =>
    open
      .filter((q) => q.jobId === jobId)
      .map((q) => (
        <Button key={q.id} className="room-question-badge" onClick={() => onQuestion(q.id)}>
          <span className="room-attention-dot" />
          {version === undefined
            ? translateUi("Decision needed")
            : translateUi("Decision needed · v{{value0}}", { value0: version })}
        </Button>
      ));
  return (
    <div className="room-project">
      <div className="room-project-toolbar">
        <Button onClick={onEdit}>{translateUi("Edit brief")}</Button>
        {!terminalPhases.has(run.phase) ? (
          <Button danger onClick={onCancel}>
            {translateUi("Stop project")}
          </Button>
        ) : (
          ["failed", "interrupted", "cancelled"].includes(run.phase) && (
            <Button onClick={() => void onRetry()}>{translateUi("Retry")}</Button>
          )
        )}
        {pending()}
      </div>
      <div className="room-project-attention">
        <ReferenceSignIn
          runId={run.id}
          revision={
            events.filter((event) => event.type === "reference_authentication").at(-1)?.id || 0
          }
        />
      </div>
      {error && <Alert type="error" showIcon title={error} />}
      <div className="room-project-scroll">
        <RoomActivityNow
          run={run}
          events={events}
          contexts={activityContexts}
          onOpen={() => setTab("activity")}
        />
        <Tabs
          className="room-project-tabs"
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: "conversation",
              label: translateUi("Conversation"),
              children: (
                <div className="room-project-conversation">
                  <Bubble
                    placement="end"
                    className="room-bubble-user"
                    header={translateUi("Settings")}
                    content={<ProjectSettings run={run} styles={styles} examples={examples} />}
                  />
                  <Bubble
                    placement="end"
                    className="room-bubble-user"
                    content={
                      <>
                        <PromptText>{run.request.instructions}</PromptText>
                        <ConversationAttachments assetIds={briefAssetIds} assets={attachments} />
                      </>
                    }
                  />
                  {run.request.requirements &&
                    Object.entries(run.request.requirements).map(
                      ([label, value]) =>
                        label !== "urls" &&
                        value.instructions && (
                          <Bubble
                            key={label}
                            placement="end"
                            className="room-bubble-user"
                            header={sectionLabels[label] || label}
                            content={<PromptText>{value.instructions}</PromptText>}
                          />
                        ),
                    )}
                  {(run.request.urls.length > 0 || run.request.requirements?.urls.instructions) && (
                    <Bubble
                      placement="end"
                      className="room-bubble-user"
                      header={translateUi("Websites")}
                      content={
                        <>
                          {run.request.requirements?.urls.instructions && (
                            <PromptText>{run.request.requirements.urls.instructions}</PromptText>
                          )}
                          {run.request.urls.length > 0 && (
                            <ul>
                              {run.request.urls.map((url) => (
                                <li key={url}>
                                  <a href={url} target="_blank" rel="noreferrer">
                                    {url}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      }
                    />
                  )}
                  {questions.map((q) => (
                    <div className="room-chat-turn" key={`${q.id}:${q.jobId || ""}`}>
                      <Bubble
                        placement="start"
                        header={roomQuestionScope(run, q.jobId)}
                        content={<PromptText>{q.question}</PromptText>}
                        footer={
                          q.state === "open" ? (
                            <Button size="small" onClick={() => onQuestion(q.id)}>
                              {translateUi("Answer")}
                            </Button>
                          ) : undefined
                        }
                      />
                      {q.state === "answered" && (
                        <Bubble
                          placement="end"
                          className="room-bubble-user"
                          content={
                            <>
                              <PromptText>{q.answer || q.fallback}</PromptText>
                              <ConversationAttachments
                                assetIds={q.assetIds || []}
                                assets={attachments}
                              />
                            </>
                          }
                        />
                      )}
                    </div>
                  ))}
                  {full
                    .filter((job) => job.refinementPrompt)
                    .map((job) => (
                      <Bubble
                        key={`refinement-${job.id}`}
                        placement="end"
                        className="room-bubble-user"
                        header={roomQuestionScope(run, job.id)}
                        content={<RefinementMessage job={job} />}
                      />
                    ))}
                </div>
              ),
            },
            {
              key: "previews",
              label: translateUi("Directions"),
              children: (
                <>
                  {!run.jobs.some((j) => j.kind === "preview") && (
                    <ProjectResultPending project={run} />
                  )}
                  {controls}
                  <div className="room-preview-grid">
                    {run.jobs
                      .filter((j) => j.kind === "preview")
                      .map((job) => (
                        <section key={job.id}>
                          {renderPreview(job)}
                          {pending(job.id)}
                        </section>
                      ))}
                  </div>
                </>
              ),
            },
            {
              key: "full",
              label: translateUi("Full versions{{value0}}", {
                value0: full.length ? ` · ${full.length}` : "",
              }),
              children: (
                <div className="room-preview-grid">
                  {!full.length && (
                    <p className="room-hint">
                      {translateUi(
                        "Choose a direction to make the full version. Your previews stay saved.",
                      )}
                    </p>
                  )}
                  {fullGroups.map((group) => (
                    <section key={group.key}>
                      <RevisionStack
                        group={group}
                        title={candidateTitle(group.revisions[0].job.candidateId)}
                        selectedJobId={revisionSelection[group.key]}
                        onSelect={(jobId) => selectRevision(group.key, jobId)}
                        events={events}
                        onCancel={onCancelJob}
                        onDelete={
                          overview.active
                            ? undefined
                            : async (jobId) => {
                                try {
                                  onUpdated(
                                    await api<Run>(`/api/runs/${run.id}/versions/${jobId}`, {
                                      method: "DELETE",
                                    }),
                                  );
                                } catch (error) {
                                  setError((error as Error).message);
                                  throw error;
                                }
                              }
                        }
                        onRetry={(jobId) => void onRetry(jobId)}
                        attention={(jobId) => open.some((q) => q.jobId === jobId)}
                      >
                        {(job, revisions) => renderFull(job, revisions)}
                      </RevisionStack>
                      {group.revisions.flatMap((revision) =>
                        pending(
                          revision.job.id,
                          group.revisions.length > 1 ? revision.version : undefined,
                        ),
                      )}
                    </section>
                  ))}
                </div>
              ),
            },
            ...(run.request.outputType === "page"
              ? []
              : [
                  {
                    key: "storyboard",
                    label: translateUi("Storyboard"),
                    children: storyboards.length ? (
                      <ul className="room-storyboards">
                        {storyboards.map((job) => (
                          <li key={job.id}>
                            <span>{roomQuestionScope(run, job.id)}</span>
                            <a
                              href={`/projects/${run.id}/storyboard?job=${job.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {translateUi("Open storyboard")}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="room-hint">
                        {translateUi(
                          "The storyboard appears when planning is complete, before recording begins.",
                        )}
                      </p>
                    ),
                  },
                ]),
            {
              key: "activity",
              label: <RoomActivityTab run={run} />,
              children:
                tab === "activity" ? (
                  <ProjectActivityPanel run={run} contexts={activityContexts} onRetry={onRetry} />
                ) : null,
            },
          ]}
        />
      </div>
      {refinementSources.length > 0 && (
        <section className="room-refinement" aria-label={translateUi("Fine-tune a video version")}>
          <RefinementHistoryReview
            run={run}
            sourceJobId={refineId}
            discarded={discardedRefinements}
            onChange={setDiscardedRefinements}
            disabled={overview.active || busy}
          />
          <Sender
            aria-label={translateUi("Fine-tune instructions")}
            value={refine}
            onChange={setRefine}
            loading={busy}
            disabled={overview.active || refinementImages.uploading}
            placeholder={
              overview.active
                ? translateUi("Available when the current work finishes")
                : translateUi("Fine-tune: what would you like to change?")
            }
            footer={
              <div>
                <RefinementImages
                  attachments={refinementImages}
                  disabled={overview.active || busy}
                />
                <Select
                  size="small"
                  variant="borderless"
                  aria-label={translateUi("Version to fine-tune")}
                  value={refineId}
                  popupMatchSelectWidth={false}
                  options={refinementSources.map((job) => ({
                    value: job.id,
                    label:
                      roomQuestionScope(run, job.id) +
                      (job.phase === "cancelled" ? ` · ${translateUi("Cancelled")}` : ""),
                  }))}
                  onChange={(refineJobId) => onView({ ...view, refineJobId })}
                />
              </div>
            }
            onSubmit={async (text) => {
              if (!text.trim() || overview.active || busy || refinementImages.uploading) return;
              setBusy(true);
              setError("");
              try {
                await api(`/api/runs/${run.id}/refine`, {
                  method: "POST",
                  body: JSON.stringify({
                    jobId: refineId,
                    prompt: text,
                    discardedRefinementJobIds: discardedRefinements.filter((id) =>
                      availableRefinementInstructions(
                        run,
                        run.jobs.find((job) => job.id === refineId)?.candidateId || "",
                      ).some((entry) => entry.jobId === id),
                    ),
                    assetIds: refinementImages.images.map((image) => image.id),
                  }),
                });
                onUpdated(await api<Run>(`/api/runs/${run.id}`));
                onView({ ...view, refine: "", tab: "full" });
                refinementImages.clear();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </section>
      )}
    </div>
  );
}
