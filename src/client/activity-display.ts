import { captureChapterRetryLimit } from "../shared/capture-chapters";
import { translateUi } from "./i18n/service";
import { type ActivityItem } from "./agent-activity-model";

export interface DisplayActivityItem extends ActivityItem {
  children?: DisplayActivityItem[];
}

function appendActivityOutcome(target: DisplayActivityItem[], item: DisplayActivityItem) {
  if (item.captureTiming) {
    if (item.captureTiming.phase === "accepted") {
      for (const child of target)
        if (child.captureTiming && child.status === "running") child.status = "complete";
      const conflict = target.find((child) => child.captureTiming?.phase === "conflict");
      if (conflict) {
        conflict.status = "complete";
        conflict.text = "Timing conflict resolved";
      }
    }
    const prior = target.find((child) => child.captureTiming?.phase === item.captureTiming?.phase);
    if (prior) Object.assign(prior, item, { id: prior.id });
    else target.push(item);
    return;
  }
  const prior =
    item.kind !== "message" &&
    target.find(
      (child) =>
        child.text === item.text &&
        child.kind === item.kind &&
        child.scope === item.scope &&
        ((item.capability === "narration" && child.capability === "narration") ||
          child.purpose === item.purpose) &&
        child.captureChapterId === item.captureChapterId &&
        ((item.capability === "narration" && child.capability === "narration") ||
          (Boolean(child.activityScopeId) && Boolean(item.activityScopeId)) ||
          Boolean(item.captureChapterId) ||
          child.invocationId === item.invocationId ||
          (item.purpose === "full video generation" &&
            child.status === "complete" &&
            item.status === "complete")),
    );
  if (!prior) target.push(item);
  else if (item.activityScopeId || item.capability === "narration")
    Object.assign(prior, item, { id: prior.id });
  else {
    // Preserve genuinely pending actions; otherwise show the latest attempt's outcome.
    prior.status =
      prior.status === "running" || item.status === "running" ? "running" : item.status;
    prior.time = item.time;
  }
}

/** Present known capabilities within a single model task without exposing its internal actions. */
export function displayActivityItems(items: ActivityItem[]): DisplayActivityItem[] {
  const display: DisplayActivityItem[] = [];
  const renderGroups = new Map<string, DisplayActivityItem>();
  const captureGroups = new Map<string, DisplayActivityItem>();
  const pacingGroups = new Map<string, DisplayActivityItem>();
  const pacingInvocationGroups = new Map<string, DisplayActivityItem>();
  const narrationGroups = new Map<string, DisplayActivityItem>();
  const fullVideoGroups = new Map<string, DisplayActivityItem>();
  for (const item of items) {
    const visible = { ...item, repetitions: undefined };
    if (item.capability === "narration") {
      let narration = narrationGroups.get(item.scope);
      if (!narration) {
        narration = { ...visible, kind: "notice", text: "Narration", children: [] };
        narrationGroups.set(item.scope, narration);
        display.push(narration);
      }
      narration.time = item.time;
      appendActivityOutcome(narration.children!, visible);
      const statuses = narration.children!.map((child) => child.status);
      narration.status = statuses.includes("running")
        ? "running"
        : statuses.includes("failed")
          ? "failed"
          : statuses.includes("stopped")
            ? "stopped"
            : "complete";
      continue;
    }
    if (item.purpose === "pacing correction" && item.invocationId && item.kind !== "message") {
      const invocationKey = `${item.scope}:${item.invocationId}`;
      let pacing = pacingInvocationGroups.get(invocationKey);
      if (!pacing) {
        pacing = pacingGroups.get(item.scope);
        const previousAttempt = pacing?.children?.at(-1)?.correctionAttempt;
        if (
          item.correctionAttempt !== undefined &&
          previousAttempt !== undefined &&
          item.correctionAttempt < previousAttempt
        )
          pacing = undefined;
      }
      if (!pacing) {
        pacing = {
          ...visible,
          kind: "notice",
          text: "Refining story timing",
          status: undefined,
          children: [],
        };
        pacingGroups.set(item.scope, pacing);
        display.push(pacing);
      }
      pacingInvocationGroups.set(invocationKey, pacing);
      let attempt = pacing.children!.find((child) => child.invocationId === item.invocationId);
      if (!attempt) {
        attempt = {
          ...visible,
          kind: "notice",
          text: "Timing correction attempt",
          correctionAttempt: item.correctionAttempt ?? pacing.children!.length + 1,
          status: undefined,
          children: [],
        };
        pacing.children!.push(attempt);
      }
      appendActivityOutcome(attempt.children!, visible);
      attempt.time = item.time;
      // A completed model call does not establish that the timing repair passed review.
      attempt.status = attempt.children!.some((child) => child.status === "running")
        ? "running"
        : attempt.children!.some((child) => child.status === "failed")
          ? "failed"
          : attempt.children!.some((child) => child.status === "stopped")
            ? "stopped"
            : undefined;
      pacing.time = item.time;
      pacing.status = pacing.children!.some((child) => child.status === "running")
        ? "running"
        : undefined;
      continue;
    }
    if (item.progressStage === "capture" || item.captureChapterId) {
      let capture = captureGroups.get(item.scope);
      if (!capture) {
        capture = {
          ...visible,
          kind: "notice",
          text: "Capturing footage…",
          captureChapterId: undefined,
          captureChapterTitle: undefined,
          captureChapterIndex: undefined,
          progressStage: "capture",
          children: [],
          progressPercent: 0,
          status: "running",
        };
        captureGroups.set(item.scope, capture);
        display.push(capture);
      }
      capture.time = item.time;
      let chapter = capture.children!.find(
        (child) => child.captureChapterId === item.captureChapterId,
      );
      if (!chapter) {
        chapter = {
          ...visible,
          kind: "notice",
          text: `${item.captureChapterIndex} · ${item.captureChapterTitle}`,
          progressPercent: undefined,
          progressStage: undefined,
          children: [],
        };
        capture.children!.push(chapter);
      }
      if (item.progressStage === "capture") {
        capture.progressPercent = item.progressPercent;
        capture.status =
          item.status === "stopped"
            ? "stopped"
            : item.status === "failed"
              ? "failed"
              : item.progressPercent === 100
                ? "complete"
                : "running";
        chapter.status = item.status;
        chapter.time = item.time;
        if (item.status === "failed" || item.status === "stopped")
          for (const child of chapter.children ?? [])
            if (child.captureTiming && child.status === "running") child.status = item.status;
      } else {
        chapter.time = item.time;
        if (item.captureTiming?.status === "running") {
          chapter.status = "running";
          capture.status = "running";
        }
        appendActivityOutcome(chapter.children!, { ...visible, progressPercent: undefined });
      }
      continue;
    }
    if (item.progressStage === "render") {
      let renderGroup = renderGroups.get(item.scope);
      if (!renderGroup) {
        renderGroup = { ...visible, text: "Rendering your video…", children: [] };
        renderGroups.set(item.scope, renderGroup);
        display.push(renderGroup);
      }
      if (renderGroup.activityScopeId !== item.activityScopeId) {
        renderGroup.activityScopeId = item.activityScopeId;
        renderGroup.progressPercent = undefined;
        renderGroup.children = [];
      }
      renderGroup.status = item.status;
      renderGroup.time = item.time;
      renderGroup.progressPercent = item.progressPercent ?? renderGroup.progressPercent;
      if (item.text === renderGroup.text) continue;
      const prior = renderGroup.children!.find((child) => child.text === item.text);
      if (prior) {
        Object.assign(prior, visible, { id: prior.id, progressPercent: undefined });
      } else renderGroup.children!.push({ ...visible, progressPercent: undefined });
      continue;
    }
    if (item.kind === "message" || (!item.invocationId && !item.activityScopeId)) {
      display.push(visible);
      continue;
    }
    let target = display;
    if (item.purpose !== "full video generation") {
      if (item.kind !== "tool" && !item.activityScopeId) {
        display.push(visible);
        continue;
      }
    } else {
      let group = fullVideoGroups.get(item.scope);
      if (!group) {
        group = {
          ...visible,
          kind: "notice",
          text: "Creating your video…",
          status: undefined,
          children: [],
        };
        fullVideoGroups.set(item.scope, group);
        display.push(group);
      }
      group.time = item.time;
      // Finished tool actions cannot establish that the whole video is finished.
      if (item.status === "running") group.status = "running";
      target = group.children!;
    }
    appendActivityOutcome(target, visible);
  }
  const chronological = (left: ActivityItem, right: ActivityItem) =>
    left.time.localeCompare(right.time) || left.id - right.id;
  for (const item of display) {
    // Completion belongs to this measured operation, not to a parent relaying a child stage.
    if (
      item.progressPercent !== undefined &&
      item.progressPercent >= 100 &&
      item.status !== "failed" &&
      item.status !== "stopped"
    )
      item.status = "complete";
    item.children?.sort(
      item.progressStage === "capture"
        ? (left, right) => (left.captureChapterIndex ?? 0) - (right.captureChapterIndex ?? 0)
        : chronological,
    );
    if (item.progressStage === "capture")
      for (const chapter of item.children ?? []) chapter.children?.sort(chronological);
  }
  return display.sort(chronological);
}

/** One label for progress in the room, conversation and activity panel. */
export function activityLabel(item: ActivityItem): string {
  const label = activityText(item);
  const percent = activityProgressPercent(item);
  return percent === undefined ? label : `${label} · ${Math.floor(percent)}%`;
}

export function activityText(item: ActivityItem): string {
  if (item.text === "Timing correction attempt")
    return translateUi("Attempt {{attempt}}", { attempt: String(item.correctionAttempt) });
  const timing = item.captureTiming;
  return timing
    ? translateUi(item.text, {
        target: String(Number(timing.targetDurationSeconds.toFixed(2))),
        actual:
          timing.actualDurationSeconds === undefined
            ? ""
            : String(Number(timing.actualDurationSeconds.toFixed(2))),
        revision: String(timing.revision ?? 1),
        limit: String(captureChapterRetryLimit),
      })
    : translateUi(item.text);
}

/** A parent may relay its current child's measured work, but never average unrelated stages. */
export function activityProgressPercent(item: DisplayActivityItem): number | undefined {
  if (item.progressPercent !== undefined) return item.progressPercent;
  const current = item.children?.at(-1);
  return current ? activityProgressPercent(current) : undefined;
}

export function latestActivityProgress(items: ActivityItem[]): DisplayActivityItem | undefined {
  const current = displayActivityItems(items).at(-1);
  return current && activityProgressPercent(current) !== undefined ? current : undefined;
}
