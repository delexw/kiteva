import { translateUi, useUiLanguage } from "./i18n";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "./components/ai-elements/chain-of-thought";
import { useMemo } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "./components/ai-elements/message";
import { Check, LoaderCircle } from "lucide-react";
import type { AgentProgressEvent } from "../shared/contracts";
import { type ActivityItem, activityItems } from "./agent-activity-model";
import { displayActivityItems, type DisplayActivityItem } from "./activity-display";
import { useStickToBottomContext } from "use-stick-to-bottom";

function ActivityTargetLink({ label, targetId }: { label: string; targetId: string }) {
  useUiLanguage();
  const { scrollRef, stopScroll } = useStickToBottomContext();
  return (
    <a
      className="activity-target"
      href={`#${targetId}`}
      onClick={(event) => {
        event.preventDefault();
        const scroller = scrollRef.current;
        const target = scroller?.querySelector<HTMLElement>(`#${CSS.escape(targetId)}`);
        if (!scroller || !target) return;
        stopScroll();
        const top =
          target.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop -
          16;
        target.focus({ preventScroll: true });
        scroller.scrollTo({ top, behavior: "smooth" });
      }}
    >
      {label}
    </a>
  );
}
export function AgentActivity({
  events,
  variant = "panel",
}: {
  events: AgentProgressEvent[];
  variant?: "panel" | "progress";
}) {
  useUiLanguage();
  const items = useMemo(() => displayActivityItems(activityItems(events)), [events]);
  return (
    <aside
      className={variant === "progress" ? "activity-panel activity-progress" : "activity-panel"}
    >
      <div className="section-heading">
        <h2>
          {variant === "progress" ? translateUi("Live progress") : translateUi("Agent activity")}
        </h2>
        <span className="local-dot" />
      </div>
      <p className="activity-caption">{translateUi("Follow the work as it happens")}</p>
      <Conversation
        className="activity-conversation"
        role="log"
        aria-label={translateUi("Agent activity")}
        aria-live="polite"
        aria-relevant="additions text"
      >
        <ConversationContent className="activity-feed">
          {!items.length && <p>{translateUi("Preparing your project…")}</p>}
          {items.map((item) => (
            <ActivityRow item={item} key={item.id} />
          ))}
        </ConversationContent>
        <ConversationScrollButton aria-label={translateUi("Jump to latest activity")} />
      </Conversation>
    </aside>
  );
}

export function ProgressDisclosure({
  items,
  title,
  active = false,
  now,
  startedAt,
}: {
  items: ActivityItem[];
  title: string;
  active?: boolean;
  now?: number;
  startedAt?: string;
}) {
  useUiLanguage();
  if (!items.length) return null;
  const elapsed = Math.max(
    0,
    Math.round(
      ((active && now ? now : Date.parse(items.at(-1)!.time)) -
        Date.parse(startedAt || items[0].time)) /
        1000,
    ),
  );
  const duration = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;
  return (
    <ChainOfThought
      className="progress-disclosure"
      aria-label={translateUi("{{value0}} progress", { value0: title })}
    >
      <ChainOfThoughtHeader
        className="progress-disclosure-trigger"
        icon={
          <span
            className={`progress-kiteva-mark${active ? " progress-kiteva-mark-loading" : ""}`}
            aria-hidden="true"
          >
            <img src="/kiteva-mark.svg" alt="" width="28" height="28" />
          </span>
        }
      >
        {active && <span className="progress-thinking-label">{translateUi("Thinking…")}</span>}
        {title} · {active ? translateUi("Working for") : translateUi("Worked for")} {duration}
        {active && (
          <span className="progress-disclosure-latest">
            {translateUi(displayActivityItems(items).at(-1)!.text)}
          </span>
        )}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent className="progress-disclosure-content">
        {displayActivityItems(items).map((item) => (
          <ProgressStep item={item} key={item.id} />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function ProgressStep({ item }: { item: DisplayActivityItem }) {
  return (
    <ChainOfThoughtStep
      className="progress-disclosure-step"
      icon={
        item.status === "running" ? LoaderCircle : item.status === "complete" ? Check : undefined
      }
      status={item.status === "running" ? "active" : "complete"}
      label={translateUi(item.text)}
      description={
        <time dateTime={item.time}>
          {new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </time>
      }
    >
      {item.children?.map((child) => (
        <ProgressStep item={child} key={child.id} />
      ))}
    </ChainOfThoughtStep>
  );
}

export function GenerationActivity({
  events,
  jobId,
  title,
  completed,
  label = translateUi("Preview"),
}: {
  events: AgentProgressEvent[];
  jobId: string;
  title: string;
  completed: boolean;
  label?: string;
}) {
  useUiLanguage();
  const items = useMemo(
    () => activityItems(events.filter((event) => event.jobId === jobId)),
    [events, jobId],
  );
  if (!items.length) return null;
  return (
    <div
      className="generation-job-activity"
      aria-label={translateUi("{{value0}} activity · {{value1}}", { value0: label, value1: title })}
    >
      <ProgressDisclosure
        items={items.filter((item) => item.kind !== "message")}
        title={translateUi("{{value0}} progress", { value0: label })}
        active={!completed}
      />
      {items
        .filter((item) => item.kind === "message")
        .map((item) => (
          <ActivityRow item={item} key={item.id} />
        ))}
    </div>
  );
}

export function ActivityRow({
  item,
  target,
}: {
  item: DisplayActivityItem;
  target?: { label: string; targetId?: string };
}) {
  useUiLanguage();
  return (
    <Message from="assistant" className={`activity-item activity-${item.kind}`}>
      <time dateTime={item.time}>
        {new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </time>
      <MessageContent className="activity-content">
        {target &&
          (target.targetId ? (
            <ActivityTargetLink label={target.label} targetId={target.targetId} />
          ) : (
            <span className="activity-target">{target.label}</span>
          ))}
        {item.kind !== "message" ? (
          <p>{translateUi(item.text)}</p>
        ) : (
          <MessageResponse isAnimating={Boolean(item.streaming)} controls={false}>
            {item.text}
          </MessageResponse>
        )}
        {item.children?.map((child) => (
          <ActivityRow item={child} key={child.id} />
        ))}
      </MessageContent>
      {item.kind === "tool" && (item.status === "running" || item.status === "complete") && (
        <span
          className={`tool-status tool-status-${item.status}`}
          role="img"
          aria-label={item.status === "running" ? translateUi("Working") : translateUi("Done")}
          title={item.status === "running" ? translateUi("Working") : translateUi("Done")}
        >
          {item.status === "running" ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Check size={18} strokeWidth={3} />
          )}
        </span>
      )}
    </Message>
  );
}
