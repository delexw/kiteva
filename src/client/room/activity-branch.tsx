import "./activity-branch.css";
import { createContext, startTransition, useContext, useEffect, useState } from "react";
import { Alert, Button, Collapse } from "antd";
import { ThoughtChain } from "@ant-design/x";
import type { Run } from "../../shared/contracts";
import { terminalPhases } from "../../shared/contracts";
import type { ActivityBranch, ActivityBranchItem } from "../../shared/activity-branches";
import { LoadingStatus } from "../components/loading-status";
import { api } from "../lib/api";
import { subscribeProjectEvents } from "../lib/project-event-stream";
import { translateUi, useUiLanguage } from "../i18n";
import { roomActivityStep } from "./room-activity";
import { VirtualActivityRows } from "./virtual-activity-rows";

const BranchRefresh = createContext(0);
const rootPath: number[] = [];

/** Every level shares this loader; collapsed descendants never mount or retain history. */
export function ActivityBranchView({
  run,
  jobId,
  parents = rootPath,
  onRetry,
}: {
  run: Run;
  jobId: string;
  parents?: number[];
  onRetry?: (jobId?: string) => void | Promise<void>;
}) {
  useUiLanguage();
  const upstream = useContext(BranchRefresh);
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ActivityBranch>();
  const [cursor, setCursor] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const path = parents.join(".");
  const phase = run.jobs.find((job) => job.id === jobId)?.phase || run.phase;
  const refresh = upstream + revision;
  useEffect(() => setOffset(0), [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const query = new URLSearchParams({ jobId, offset: String(offset) });
    if (path) query.set("path", path);
    void api<ActivityBranch>(`/api/runs/${run.id}/activity/children?${query}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setCursor((previous) => previous ?? result.lastEventId);
        setPage((previous) => ({
          ...result,
          items: offset && previous ? [...previous.items, ...result.items] : result.items,
        }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [run.id, jobId, path, offset, refresh, phase]);
  useEffect(() => {
    if (path || cursor === undefined || terminalPhases.has(phase)) return;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const stop = subscribeProjectEvents(
      run.id,
      (batch) => {
        if (pending || !batch.some((event) => (event.jobId || "") === jobId)) return;
        // Coalesce history invalidations; avoid a database scan for every rendered frame.
        pending = setTimeout(() => {
          pending = undefined;
          startTransition(() => setRevision((value) => value + 1));
        }, 750);
      },
      () => {},
      { view: "activity", after: cursor },
    );
    return () => {
      stop();
      clearTimeout(pending);
    };
  }, [run.id, jobId, path, cursor, phase]);
  useEffect(() => {
    if (!sentinel || loading || error || page?.nextOffset === undefined) return;
    const next = page.nextOffset;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setOffset(next);
      },
      { root: sentinel.closest<HTMLElement>(".room-project-scroll"), rootMargin: "160px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, loading, error, page?.nextOffset]);
  const retry =
    page?.retryItemId !== undefined &&
    onRetry &&
    ["failed", "cancelled", "interrupted"].includes(phase)
      ? { itemId: page.retryItemId, action: () => onRetry(jobId || undefined) }
      : undefined;
  const row = (item: ActivityBranchItem) => {
    const step = roomActivityStep(item, retry);
    return item.hasChildren ? (
      <Collapse
        size="small"
        ghost
        className="activity-branch-group"
        styles={{
          header: { padding: 0 },
          body: { paddingBlock: 12, paddingInlineStart: 28, paddingInlineEnd: 0 },
        }}
        destroyOnHidden
        items={[
          {
            key: String(item.id),
            label: (
              <ThoughtChain
                className="room-activity-steps"
                items={[{ ...step, description: undefined }]}
              />
            ),
            children: (
              <ActivityBranchView
                run={run}
                jobId={jobId}
                parents={[...parents, item.id]}
                onRetry={onRetry}
              />
            ),
          },
        ]}
      />
    ) : (
      <div className="activity-branch-leaf">
        <ThoughtChain line="dashed" className="room-activity-steps" items={[step]} />
      </div>
    );
  };
  return (
    <BranchRefresh.Provider value={refresh}>
      <div
        className="activity-context-history"
        data-activity-branch={path || "root"}
        aria-busy={loading}
      >
        {error && (
          <Alert
            type="error"
            title={translateUi("Could not load activity.")}
            action={
              <Button onClick={() => setRevision((value) => value + 1)}>
                {translateUi("Retry")}
              </Button>
            }
          />
        )}
        {page &&
          (page.items.length > 100 ? (
            <VirtualActivityRows
              rows={page.items.map((item) => ({ key: String(item.id), depth: 0, item }))}
              renderRow={({ item }) => row(item)}
            />
          ) : (
            page.items.map((item) => <div key={item.id}>{row(item)}</div>)
          ))}
        {loading && !page && (
          <div className="activity-branch-loading">
            <LoadingStatus text={translateUi("Loading activity…")} />
          </div>
        )}
        {!loading && !error && page?.items.length === 0 && (
          <p className="room-hint">{translateUi("No activity has been recorded yet.")}</p>
        )}
        <div ref={setSentinel} aria-hidden="true" />
      </div>
    </BranchRefresh.Provider>
  );
}
