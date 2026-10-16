import { Bubble, ThoughtChain, type ThoughtChainItemType } from "@ant-design/x";
import { useMemo, type ReactNode } from "react";
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
export function roomActivityStep(item: ActivityItem): ThoughtChainItemType {
  return {
    key: String(item.id),
    title:
      item.repetitions && item.repetitions > 1 ? `${item.text} · ${item.repetitions}×` : item.text,
    description: <time dateTime={item.time}>{clock(item.time)}</time>,
    status: item.status ? stepStatus[item.status] : undefined,
    icon: item.status ? undefined : (
      <span
        role="img"
        aria-label="Progress update"
        title="Progress update — no separate outcome recorded"
      >
        <CircleDot size={14} />
      </span>
    ),
  };
}
function ContextDetail({ context }: { context: RoomActivityContext }) {
  const runs: Array<ActivityItem | ActivityItem[]> = [];
  for (const item of context.items) {
    const last = runs.at(-1);
    if (item.kind !== "message" && Array.isArray(last)) last.push(item);
    else runs.push(item.kind === "message" ? item : [item]);
  }
  return (
    <div className="room-activity-detail">
      {context.checkpoints.length > 0 && (
        <ThoughtChain line="dashed" className="room-activity-steps" items={context.checkpoints} />
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
  const tone = context.status || "waiting";
  const { label, icon } = contextStatus[tone];
  return (
    <span className={`room-activity-status is-${tone}`} role="img" aria-label={label} title={label}>
      {icon}
    </span>
  );
}
function CrewOnSet() {
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
  const working = isRoomActivityLive(run);
  return (
    <span className="room-activity-tab">
      Activity
      {working && (
        <span
          className="room-activity-crew room-activity-tab-crew"
          role="status"
          aria-label="Working"
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
  const contexts = useMemo(() => roomActivityContexts(run, events), [run, events]);
  const working = contexts.filter((context) => context.status === "loading");
  if (!isRoomActivityLive(run) || !working.length) return null;
  return (
    <div className="room-activity-now" role="status">
      <CrewOnSet />
      <span className="room-activity-now-text">
        <strong>{working[0].label}</strong>
        <span>{working[0].summary}</span>
      </span>
      {working.length > 1 && <span className="room-hint">+{working.length - 1} more working</span>}
      <Button size="small" type="link" onClick={onOpen}>
        See activity
      </Button>
    </div>
  );
}

export function RoomActivity({ run, events }: { run: Run; events: AgentProgressEvent[] }) {
  const contexts = useMemo(() => roomActivityContexts(run, events), [run, events]);
  if (!contexts.length)
    return <p className="room-hint">Activity appears here as soon as work starts.</p>;
  return (
    <section className="room-activity" aria-label="Project activity">
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
