import { translateUi, useUiLanguage } from "../i18n";
import { Bubble, ThoughtChain, type ThoughtChainItemType } from "@ant-design/x";
import { useCallback, useMemo, type ReactNode } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { Button, Collapse } from "antd";
import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  CirclePause,
  Hourglass,
  LoaderCircle,
} from "lucide-react";
import type { AgentProgressEvent, Run } from "../../shared/contracts";
import { displayActivityItems, type DisplayActivityItem } from "../activity-display";
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
export function roomActivityStep(item: DisplayActivityItem): ThoughtChainItemType {
  return {
    key: String(item.id),
    title: translateUi(item.text),
    content: item.children?.length ? (
      <ThoughtChain
        line="dashed"
        className="room-activity-steps"
        items={item.children.map(roomActivityStep)}
      />
    ) : undefined,
    description: item.children?.length ? (
      <span aria-hidden="true">&nbsp;</span>
    ) : (
      <time dateTime={item.time}>{clock(item.time)}</time>
    ),
    status: item.status ? stepStatus[item.status] : undefined,
    icon: item.status ? undefined : (
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
function ContextDetail({ context }: { context: RoomActivityContext }) {
  useUiLanguage();
  const runs: Array<DisplayActivityItem | DisplayActivityItem[]> = [];
  for (const item of displayActivityItems(context.items)) {
    const last = runs.at(-1);
    if (item.kind !== "message" && Array.isArray(last)) last.push(item);
    else runs.push(item.kind === "message" ? item : [item]);
  }
  return (
    <div className="room-activity-detail">
      {context.checkpoints.length > 0 && (
        <ThoughtChain
          line="dashed"
          className="room-activity-steps"
          items={context.checkpoints.map((item) => ({
            ...item,
            title: typeof item.title === "string" ? translateUi(item.title) : item.title,
          }))}
        />
      )}
      {runs.map((entry) =>
        Array.isArray(entry) ? (
          <ThoughtChain
            key={entry[0].id}
            line="dashed"
            className="room-activity-steps"
            items={entry.map(roomActivityStep)}
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
  return (
    <div className="room-activity-now" role="status">
      <CrewOnSet />
      <span className="room-activity-now-text">
        <strong>{working[0].label}</strong>
        <span>{working[0].summary}</span>
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

export function RoomActivity({ run, events }: { run: Run; events: AgentProgressEvent[] }) {
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
          const latest = context.items.at(-1);
          return {
            key: context.key,
            collapsible: empty ? ("disabled" as const) : undefined,
            showArrow: !empty,
            label: (
              <span className="room-activity-line">
                <ContextStatus context={context} />
                <strong>{context.label}</strong>
                <span className="room-activity-summary">{context.summary}</span>
              </span>
            ),
            extra: latest && <time dateTime={latest.time}>{clock(latest.time)}</time>,
            children: <ContextDetail context={context} />,
          };
        })}
      />
    </section>
  );
}
