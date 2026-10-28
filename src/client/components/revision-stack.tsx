import { Button, Popconfirm, Progress, Radio, Tooltip } from "antd";
import {
  Check,
  CircleSlash,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AgentProgressEvent, GenerationJob } from "../../shared/contracts";
import { activityItems } from "../agent-activity-model";
import { activityProgressPercent, latestActivityProgress } from "../activity-display";
import { translateUi, useUiLanguage } from "../i18n";
import {
  revisionStripTarget,
  selectedRevision,
  type FullRevision,
  type FullRevisionGroup,
} from "../lib/revision-stack";
import "./revision-stack.css";

/** Pieces a result card places inside its own layout; the card keeps its heading and actions. */
export type RevisionSlots = {
  /** Version switcher, rendered next to the title/date. */
  switcher?: ReactNode;
  /** Compact status row for the other relevant revision, rendered below the media. */
  strip?: ReactNode;
};

/** Session-only selection per stack key (candidate), always stored as a job id. */
export function useRevisionSelection() {
  const [selection, setSelection] = useState<Record<string, string>>({});
  const select = useCallback(
    (key: string, jobId: string) =>
      setSelection((previous) =>
        previous[key] === jobId ? previous : { ...previous, [key]: jobId },
      ),
    [],
  );
  return [selection, select] as const;
}

function stateLabel(revision: FullRevision) {
  if (revision.state === "active")
    return translateUi(revision.job.phase === "queued" ? "Queued" : "Building");
  if (revision.state === "ready") return translateUi("Ready");
  if (revision.state === "cancelled") return translateUi("Cancelled");
  return translateUi(revision.job.phase === "interrupted" ? "Interrupted" : "Failed");
}

function versionLabel(revision: FullRevision) {
  return translateUi("v{{value0}}", { value0: revision.version });
}

function RevisionGlyph({ revision }: { revision: FullRevision }) {
  if (revision.state === "active")
    return <LoaderCircle className="spin revision-glyph" size={13} aria-hidden="true" />;
  if (revision.state === "failed")
    return <TriangleAlert className="revision-glyph" size={13} aria-hidden="true" />;
  if (revision.state === "cancelled")
    return <CircleSlash className="revision-glyph" size={13} aria-hidden="true" />;
  return <Check className="revision-glyph" size={13} aria-hidden="true" />;
}

function RevisionSwitcher({
  group,
  selected,
  title,
  attention,
  onSelect,
  onDelete,
}: {
  group: FullRevisionGroup;
  selected: FullRevision;
  title: string;
  attention: (jobId: string) => boolean;
  onSelect: (jobId: string) => void;
  onDelete?: (jobId: string) => void | Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const name = translateUi("Versions of {{value0}}", { value0: title });
  const describe = (revision: FullRevision) =>
    translateUi("Version {{value0}} · {{value1}}", {
      value0: revision.version,
      value1: stateLabel(revision),
    });
  return (
    <div className="revision-switcher">
      <Radio.Group
        className="revision-switcher-tabs"
        size="small"
        aria-label={name}
        value={selected.job.id}
        onChange={(event) => onSelect(event.target.value)}
      >
        {group.revisions.map((revision) => (
          <Tooltip key={revision.job.id} title={describe(revision)} trigger={["hover", "focus"]}>
            <Radio.Button
              value={revision.job.id}
              className={`revision-tab revision-tab-${revision.state}`}
              aria-label={describe(revision)}
            >
              <span className="revision-tab-label">
                <RevisionGlyph revision={revision} />
                {versionLabel(revision)}
                {attention(revision.job.id) && (
                  <span
                    className="revision-attention"
                    aria-label={translateUi("Decision needed")}
                  />
                )}
              </span>
            </Radio.Button>
          </Tooltip>
        ))}
      </Radio.Group>
      {onDelete && selected.state !== "active" && selected.job.outputType !== "page" && (
        <Popconfirm
          title={translateUi("Delete version {{value0}}?", { value0: selected.version })}
          description={translateUi(
            "This removes the version and excludes its refinement request from future changes. Other versions stay saved.",
          )}
          okText={translateUi("Delete")}
          cancelText={translateUi("Cancel")}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await onDelete(selected.job.id);
            } finally {
              setDeleting(false);
            }
          }}
        >
          <Button
            type="text"
            danger
            loading={deleting}
            disabled={deleting}
            className="delivery-icon-button"
            title={translateUi("Delete version {{value0}}", { value0: selected.version })}
            aria-label={translateUi("Delete version {{value0}}", { value0: selected.version })}
            icon={<Trash2 size={16} aria-hidden="true" />}
          />
        </Popconfirm>
      )}
    </div>
  );
}

function RevisionStrip({
  revision,
  events,
  attention,
  onSelect,
  onCancel,
  onRetry,
}: {
  revision: FullRevision;
  events: AgentProgressEvent[];
  attention: boolean;
  onSelect: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
}) {
  const { language } = useUiLanguage();
  const jobId = revision.job.id;
  const active = revision.state === "active";
  const percent = useMemo(() => {
    if (!active) return undefined;
    const item = latestActivityProgress(
      activityItems(events.filter((event) => event.jobId === jobId)),
    );
    const value = item && activityProgressPercent(item);
    return value === undefined ? undefined : Math.floor(value);
  }, [active, events, jobId, language]);
  const version = revision.version;
  const status = stateLabel(revision);
  return (
    <div
      className={`revision-strip revision-strip-${revision.state}`}
      role="group"
      aria-label={translateUi("Version {{value0}} · {{value1}}", {
        value0: version,
        value1: status,
      })}
    >
      <Button
        type="text"
        className="revision-strip-body"
        onClick={() => onSelect(jobId)}
        aria-label={translateUi("Show version {{value0}} · {{value1}}", {
          value0: version,
          value1: percent === undefined ? status : `${status} ${percent}%`,
        })}
      >
        {revision.state === "ready" ? (
          <Play className="revision-glyph" size={13} aria-hidden="true" />
        ) : (
          <RevisionGlyph revision={revision} />
        )}
        <span className="revision-strip-label">
          {versionLabel(revision)} · {status}
        </span>
        {attention && <span className="revision-attention" aria-hidden="true" />}
      </Button>
      {percent !== undefined && (
        <>
          <Progress
            className="revision-strip-progress"
            percent={percent}
            showInfo={false}
            size="small"
            status="active"
            aria-hidden="true"
          />
          <span className="revision-strip-percent" aria-hidden="true">
            {percent}%
          </span>
        </>
      )}
      <span className="revision-visually-hidden" aria-live="polite">
        {translateUi("Version {{value0}} · {{value1}}", { value0: version, value1: status })}
      </span>
      {active && onCancel && (
        <Tooltip
          trigger={["hover", "focus"]}
          title={translateUi("Stop version {{value0}}", { value0: version })}
        >
          <Button
            className="delivery-icon-button revision-strip-action stop-icon-button"
            type="text"
            danger
            aria-label={translateUi("Stop version {{value0}}", { value0: version })}
            onClick={() => onCancel(jobId)}
          >
            <Square size={16} fill="currentColor" strokeWidth={0} aria-hidden="true" />
          </Button>
        </Tooltip>
      )}
      {revision.state === "failed" && onRetry && (
        <Tooltip
          trigger={["hover", "focus"]}
          title={translateUi("Retry version {{value0}}", { value0: version })}
        >
          <Button
            className="secondary delivery-icon-button revision-strip-action"
            aria-label={translateUi("Retry version {{value0}}", { value0: version })}
            onClick={() => onRetry(jobId)}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </Button>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Renders one result card for a direction's revisions. The caller's card renderer receives
 * the selected job plus switcher/strip slots, so media, heading and actions are never duplicated
 * and every action keeps targeting the job it was rendered for.
 */
export function RevisionStack({
  group,
  title,
  selectedJobId,
  onSelect,
  events,
  onCancel,
  onRetry,
  onDelete,
  attention = () => false,
  children,
}: {
  group: FullRevisionGroup;
  title: string;
  selectedJobId?: string;
  onSelect: (jobId: string) => void;
  events: AgentProgressEvent[];
  onCancel?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  onDelete?: (jobId: string) => void | Promise<void>;
  attention?: (jobId: string) => boolean;
  children: (job: GenerationJob, slots: RevisionSlots) => ReactNode;
}) {
  useUiLanguage();
  const selected = selectedRevision(group, selectedJobId);
  const remembered = group.revisions.some((revision) => revision.job.id === selectedJobId);
  // Pin the playable revision being shown so a later finished revision never swaps the player.
  useEffect(() => {
    if (!remembered && selected.playable) onSelect(selected.job.id);
  }, [remembered, selected.playable, selected.job.id, onSelect]);
  const strip = revisionStripTarget(group, selected);
  const slots: RevisionSlots = {
    switcher:
      group.revisions.length > 1 || onDelete ? (
        <RevisionSwitcher
          group={group}
          selected={selected}
          title={title}
          attention={attention}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ) : undefined,
    strip: strip && (
      <RevisionStrip
        revision={strip}
        events={events}
        attention={attention(strip.job.id)}
        onSelect={onSelect}
        onCancel={onCancel}
        onRetry={onRetry}
      />
    ),
  };
  return (
    <div className="revision-stack" data-revision-stack={group.key}>
      <Fragment key={selected.job.id}>{children(selected.job, slots)}</Fragment>
    </div>
  );
}

/** Conversation entry for a revision whose card is shown in its direction's stack. */
export function RevisionReference({
  revision,
  title,
  onShow,
  children,
}: {
  revision: FullRevision;
  title: string;
  onShow: () => void;
  children?: ReactNode;
}) {
  useUiLanguage();
  return (
    <div className={`revision-reference revision-strip-${revision.state}`}>
      <div className="revision-reference-row">
        <RevisionGlyph revision={revision} />
        <span>
          {translateUi("Version {{value0}} of {{value1}} · {{value2}}", {
            value0: revision.version,
            value1: title,
            value2: stateLabel(revision),
          })}
        </span>
        <Button size="small" className="secondary compact" onClick={onShow}>
          {translateUi("Show in card")}
        </Button>
      </div>
      {children}
    </div>
  );
}
