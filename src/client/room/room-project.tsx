import { translateUi, useUiLanguage } from "../i18n";
import { Bubble, Sender } from "@ant-design/x";
import { Alert, Button, Select, Tabs } from "antd";
import { useState, type ReactNode } from "react";
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
import { RoomActivity, RoomActivityNow, RoomActivityTab } from "./room-activity";
import { roomQuestionScope } from "./question-scope";
import { roomProjectTabs, type RoomProjectView } from "../../shared/room";

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
  onRetry,
  view,
  onView,
}: {
  run: Run;
  styles?: Pick<Style, "id" | "name_en">[];
  examples?: StyleExample[];
  events: AgentProgressEvent[];
  renderPreview: (job: GenerationJob) => ReactNode;
  renderFull: (job: GenerationJob) => ReactNode;
  controls: ReactNode;
  onQuestion: (id: string) => void;
  onUpdated: (run: Run) => void;
  onEdit: () => void;
  onCancel: () => void;
  onRetry: (jobId?: string) => void | Promise<void>;
  view: RoomProjectView;
  onView: (view: RoomProjectView) => void;
}) {
  useUiLanguage();
  const overview = projectOverview(run);
  const full = run.jobs.filter((job) => job.kind === "full");
  const tab = view.tab || (full.length ? "full" : "previews");
  const setTab = (next: string) =>
    onView({ ...view, tab: roomProjectTabs.find((item) => item === next) });
  const refine = view.refine;
  const setRefine = (text: string) => onView({ ...view, refine: text });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const completed = full.filter(
    (job) => job.phase === "ready" && job.outputType !== "page" && job.sessionId,
  );
  const refineId = completed.some((job) => job.id === view.refineJobId)
    ? view.refineJobId
    : completed.at(-1)?.id;
  const storyboards = full.filter(
    (job) => job.outputType !== "page" && (job.storyboardReady || job.phase === "ready"),
  );
  const questions = scopedAssetQuestions(run);
  const open = questions.filter((q) => q.state === "open");
  const pending = (jobId?: string) =>
    open
      .filter((q) => q.jobId === jobId)
      .map((q) => (
        <Button key={q.id} className="room-question-badge" onClick={() => onQuestion(q.id)}>
          <span className="room-attention-dot" />
          {translateUi("Decision needed")}
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
      <div className="room-project-scroll">
        <RoomActivityNow run={run} events={events} onOpen={() => setTab("activity")} />
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
                    content={<PromptText>{run.request.instructions}</PromptText>}
                  />
                  {run.request.requirements &&
                    Object.entries(run.request.requirements).map(
                      ([label, value]) =>
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
                          content={<PromptText>{q.answer || q.fallback}</PromptText>}
                        />
                      )}
                    </div>
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
                  {full.map((job) => (
                    <section key={job.id}>
                      {renderFull(job)}
                      {pending(job.id)}
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
              children: <RoomActivity run={run} events={events} onRetry={onRetry} />,
            },
          ]}
        />
      </div>
      {completed.length > 0 && (
        <section className="room-refinement" aria-label={translateUi("Fine-tune a finished film")}>
          <Sender
            aria-label={translateUi("Fine-tune instructions")}
            value={refine}
            onChange={setRefine}
            loading={busy}
            disabled={overview.active}
            placeholder={
              overview.active
                ? translateUi("Available when the current work finishes")
                : translateUi("Fine-tune: what would you like to change?")
            }
            footer={
              <Select
                size="small"
                variant="borderless"
                aria-label={translateUi("Version to fine-tune")}
                value={refineId}
                popupMatchSelectWidth={false}
                options={completed.map((job) => ({
                  value: job.id,
                  label: roomQuestionScope(run, job.id),
                }))}
                onChange={(refineJobId) => onView({ ...view, refineJobId })}
              />
            }
            onSubmit={async (text) => {
              if (!text.trim()) return;
              setBusy(true);
              setError("");
              try {
                await api(`/api/runs/${run.id}/refine`, {
                  method: "POST",
                  body: JSON.stringify({ jobId: refineId, prompt: text }),
                });
                onUpdated(await api<Run>(`/api/runs/${run.id}`));
                onView({ ...view, refine: "", tab: "full" });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
          {error && <Alert type="error" showIcon title={error} />}
        </section>
      )}
    </div>
  );
}
