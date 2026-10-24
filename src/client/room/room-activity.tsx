import { ActivityWorkTitle } from "../components/activity-progress";
import { translateUi, useUiLanguage } from "../i18n";
import { Bubble, ThoughtChain, type ThoughtChainItemType } from "@ant-design/x";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { Button, Collapse } from "antd";
import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  CirclePause,
  Hourglass,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import type { AgentProgressEvent, Run } from "../../shared/contracts";
import {
  activityProgressPercent,
  activityText,
  latestActivityProgress,
  displayActivityItems,
  type DisplayActivityItem,
} from "../activity-display";
import type { ActivityItem } from "../agent-activity-model";
import { MessageResponse } from "../components/ai-elements/message";
import { StoryboardCrew } from "../storyboard-crew";
import {
  isRoomActivityLive,
  roomActivityContexts,
  type RoomActivityContext,
} from "./project-stages";

const stepStatus: Record<NonNullable<ActivityItem["status"]>, ThoughtChainItemType["status"]> = {
  running: "loading",
  complete: "success",
  failed: "error",
  stopped: "abort",
};
function clock(time: string) {
  return new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function ActivityRowTime({ time }: { time?: string }) {
  return time ? <time dateTime={time}>{clock(time)}</time> : <span aria-hidden="true">&nbsp;</span>;
}
type ActivityRetry = { itemId: number; action: () => void | Promise<void> };
function ActivityRetryButton({ action }: { action: ActivityRetry["action"] }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="text"
      size="small"
      shape="circle"
      className="room-activity-retry"
      aria-label={translateUi("Retry")}
      title={translateUi("Retry")}
      loading={busy}
      icon={<RotateCcw size={14} />}
      disabled={busy}
      onClick={async (event) => {
        event.stopPropagation();
        setBusy(true);
        try {
          await action();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
export function roomActivityStep(
  item: DisplayActivityItem,
  retry?: ActivityRetry,
): ThoughtChainItemType {
  if (item.kind === "message")
    return {
      key: String(item.id),
      content: (
        <MessageResponse isAnimating={Boolean(item.streaming)} controls={false}>
          {item.text}
        </MessageResponse>
      ),
      description: <ActivityRowTime time={item.time} />,
    };
  return {
    key: String(item.id),
    title:
      activityProgressPercent(item) === undefined ? (
        activityText(item)
      ) : (
        <ActivityWorkTitle item={item} />
      ),
    content: item.children?.length ? (
      <ThoughtChain
        line="dashed"
        className="room-activity-steps"
        items={item.children.map((child) => roomActivityStep(child, retry))}
      />
    ) : undefined,
    description: item.children?.length ? undefined : <ActivityRowTime time={item.time} />,
    status: item.status ? stepStatus[item.status] : undefined,
    icon:
      retry?.itemId === item.id ? (
        <ActivityRetryButton action={retry.action} />
      ) : item.status ? undefined : (
        <span
          role="img"
          aria-label={translateUi("Progress update")}
          title={translateUi("Progress update — no separate outcome recorded")}
        >
          <CircleDot size={14} />
        </span>
      ),
  };
}
function ContextEntries({ items, retry }: { items: ActivityItem[]; retry?: ActivityRetry }) {
  const runs: Array<DisplayActivityItem | DisplayActivityItem[]> = [];
  for (const item of displayActivityItems(items)) {
    const last = runs.at(-1);
    if (item.kind !== "message" && Array.isArray(last)) last.push(item);
    else runs.push(item.kind === "message" ? item : [item]);
  }
  return (
    <>
      {runs.map((entry) =>
        Array.isArray(entry) ? (
          <ThoughtChain
            key={entry[0].id}
            line="dashed"
            className="room-activity-steps"
            items={entry.map((item) => roomActivityStep(item, retry))}
          />
        ) : (
          <Bubble
            key={entry.id}
            placement="start"
            variant="borderless"
            className="room-activity-message"
            content={entry.text}
            contentRender={(text) => (
              <MessageResponse isAnimating={Boolean(entry.streaming)} controls={false}>
                {String(text)}
              </MessageResponse>
            )}
            footer={<time dateTime={entry.time}>{clock(entry.time)}</time>}
          />
        ),
      )}
    </>
  );
}

/** Checkpoint state owns the parent outcome; finished child calls do not complete it. */
export function roomPreparationSteps(context: RoomActivityContext, retry?: ActivityRetry) {
  const checkpointKeys = new Set(context.checkpoints.map((checkpoint) => checkpoint.key));
  const nested = new Map<string, ActivityItem[]>();
  const remaining: ActivityItem[] = [];
  for (const item of context.items) {
    if (item.preparationStep && checkpointKeys.has(item.preparationStep)) {
      const children = nested.get(item.preparationStep) || [];
      children.push(item);
      nested.set(item.preparationStep, children);
    } else remaining.push(item);
  }
  return {
    checkpoints: context.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      title:
        typeof checkpoint.title === "string" ? translateUi(checkpoint.title) : checkpoint.title,
      description: checkpoint.description ?? <ActivityRowTime />,
      content: nested.has(String(checkpoint.key)) ? (
        <ContextEntries items={nested.get(String(checkpoint.key))!} retry={retry} />
      ) : (
        checkpoint.content
      ),
    })),
    remaining,
  };
}

function ContextDetail({
  context,
  retry,
}: {
  context: RoomActivityContext;
  retry?: ActivityRetry;
}) {
  useUiLanguage();
  const { checkpoints, remaining } = roomPreparationSteps(context, retry);
  return (
    <div className="room-activity-detail">
      {checkpoints.length > 0 && (
        <ThoughtChain line="dashed" className="room-activity-steps" items={checkpoints} />
      )}
      <ContextEntries items={remaining} retry={retry} />
    </div>
  );
}

const contextStatus: Record<string, { label: string; icon: ReactNode }> = {
  loading: { label: "Working", icon: <LoaderCircle size={14} className="spin" /> },
  success: { label: "Done", icon: <CircleCheck size={14} /> },
  error: { label: "Needs attention", icon: <CircleAlert size={14} /> },
  abort: { label: "Stopped", icon: <CirclePause size={14} /> },
  waiting: { label: "Waiting for you", icon: <Hourglass size={14} /> },
};
function ContextStatus({ context }: { context: RoomActivityContext }) {
  useUiLanguage();
  const tone = context.status || "waiting";
  const { label, icon } = contextStatus[tone];
  return (
    <span
      className={`room-activity-status is-${tone}`}
      role="img"
      aria-label={translateUi(label)}
      title={translateUi(label)}
    >
      {icon}
    </span>
  );
}
function CrewOnSet() {
  useUiLanguage();
  return (
    <span className="room-activity-crew" aria-hidden="true">
      <span>
        <StoryboardCrew role="director" reaction />
      </span>
      <span>
        <StoryboardCrew role="camera" />
      </span>
    </span>
  );
}

export function RoomActivityTab({ run }: { run: Run }) {
  useUiLanguage();
  const working = isRoomActivityLive(run);
  return (
    <span className="room-activity-tab">
      {translateUi("Activity")}
      {working && (
        <span
          className="room-activity-crew room-activity-tab-crew"
          role="status"
          aria-label={translateUi("Working")}
        >
          <span aria-hidden="true">
            <StoryboardCrew role="director" reaction />
          </span>
        </span>
      )}
    </span>
  );
}

export function RoomActivityNow({
  run,
  events,
  onOpen,
}: {
  run: Run;
  events: AgentProgressEvent[];
  onOpen: () => void;
}) {
  const { language } = useUiLanguage();
  const contexts = useMemo(() => roomActivityContexts(run, events), [run, events, language]);
  const working = contexts.filter((context) => context.status === "loading");
  if (!isRoomActivityLive(run) || !working.length) return null;
  const progress = latestActivityProgress(working[0].items);
  return (
    <div className="room-activity-now" role="status">
      <CrewOnSet />
      <span className="room-activity-now-text">
        <strong>{working[0].label}</strong>
        <ActivityWorkTitle item={progress} label={progress ? undefined : working[0].summary} />
      </span>
      {working.length > 1 && (
        <span className="room-hint">
          +{working.length - 1}
          {" " + translateUi("more working")}
        </span>
      )}
      <Button size="small" type="link" onClick={onOpen}>
        {translateUi("See activity")}
      </Button>
    </div>
  );
}

export function RoomActivity({
  run,
  events,
  onRetry,
}: {
  run: Run;
  events: AgentProgressEvent[];
  onRetry?: (jobId?: string) => void | Promise<void>;
}) {
  const { language } = useUiLanguage();
  const contexts = useMemo(() => roomActivityContexts(run, events), [run, events, language]);
  const { scrollRef, contentRef } = useStickToBottom({ initial: "smooth", resize: "smooth" });
  const activityRef = useCallback(
    (element: HTMLElement | null) => {
      scrollRef(element?.closest<HTMLElement>(".room-project-scroll") ?? null);
      contentRef(element);
    },
    [scrollRef, contentRef],
  );
  if (!contexts.length)
    return (
      <p className="room-hint">{translateUi("Activity appears here as soon as work starts.")}</p>
    );
  return (
    <section
      ref={activityRef}
      className="room-activity"
      aria-label={translateUi("Project activity")}
    >
      <Collapse
        size="small"
        ghost
        className="room-activity-list"
        items={contexts.map((context) => {
          const empty = !context.items.length && !context.checkpoints.length;
          const interrupted = context.items.filter((item) => item.retryable).at(-1);
          const phase = interrupted?.jobId
            ? run.jobs.find((job) => job.id === interrupted.jobId)?.phase
            : run.phase;
          const retry =
            interrupted &&
            onRetry &&
            phase &&
            ["failed", "interrupted", "cancelled"].includes(phase)
              ? { itemId: interrupted.id, action: () => onRetry(interrupted.jobId) }
              : undefined;
          const latest = context.items.at(-1);
          const progress = latestActivityProgress(context.items);
          return {
            key: context.key,
            collapsible: empty ? ("disabled" as const) : undefined,
            showArrow: !empty,
            label: (
              <span className="room-activity-heading">
                <span className="room-activity-line">
                  <ContextStatus context={context} />
                  <strong>{context.label}</strong>
                  <span className="room-activity-summary">
                    <ActivityWorkTitle
                      item={progress}
                      label={progress ? undefined : context.summary}
                    />
                  </span>
                </span>
              </span>
            ),
            extra: latest && <time dateTime={latest.time}>{clock(latest.time)}</time>,
            children: <ContextDetail context={context} retry={retry} />,
          };
        })}
      />
    </section>
  );
}
