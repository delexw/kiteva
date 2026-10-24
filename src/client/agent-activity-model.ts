import {
  CaptureChapterProgressSchema,
  CaptureChapterTimingSchema,
  type CaptureChapterTiming,
} from "../shared/capture-chapters";
import {
  renderProgressUpdate,
  isRendererProgressEvent,
  type RenderProgress,
} from "./render-progress";
import { usesTitleOnlyPreparation, type PreparationStep } from "../shared/preparation";
import { terminalPhases, type AgentProgressEvent, type Run } from "../shared/contracts";
export interface ActivityItem {
  id: number;
  scope: string;
  jobId?: string;
  kind: "message" | "tool" | "notice";
  text: string;
  time: string;
  itemId?: string;
  capability?: "narration";
  correctionAttempt?: number;
  purpose?: string;
  preparationStep?: PreparationStep;
  activityScopeId?: string;
  invocationId?: string;
  streaming?: boolean;
  retryable?: boolean;
  repetitions?: number;
  progressPercent?: number;
  progressStage?: "render" | "playback-copy" | "capture";
  captureChapterId?: string;
  captureChapterTitle?: string;
  captureChapterIndex?: number;
  captureTiming?: CaptureChapterTiming;
  status?: "running" | "complete" | "failed" | "stopped";
}
export const taskActivityLabels: Record<
  string,
  { working: string; saving: string; preparationStep?: PreparationStep }
> = {
  "Footage chapter capture": { working: "Capturing footage…", saving: "Saving captured chapter…" },
  "Project title extraction": {
    preparationStep: "brief",
    working: "Extracting your project title…",
    saving: "Saving the project title…",
  },
  "Explicit-style preview planning": {
    preparationStep: "selection",
    working: "Planning your requested previews…",
    saving: "Saving the preview directions…",
  },
  "Brief preparation": {
    preparationStep: "brief",
    working: "Preparing your brief…",
    saving: "Saving the draft brief…",
  },
  "Brief asset self-review": {
    preparationStep: "brief",
    working: "Checking references against your story…",
    saving: "Recording review findings…",
  },
  "Brief asset alignment repair": {
    preparationStep: "brief",
    working: "Revising reference usage…",
    saving: "Saving the revised brief…",
  },
  "Motion Graphic information extraction": {
    preparationStep: "styles",
    working: "Understanding Motion Graphics…",
    saving: "Recording Motion Graphic details…",
  },
  "Motion Graphic combination proposals": {
    preparationStep: "proposals",
    working: "Exploring Motion Graphic combinations…",
    saving: "Saving proposed combinations…",
  },
  "Combination evaluation": {
    preparationStep: "selection",
    working: "Comparing creative directions…",
    saving: "Recording direction choices…",
  },
  "Video copy translation": {
    working: "Translating your video text…",
    saving: "Saving translated video text…",
  },
  "Lyrics generation": {
    preparationStep: "lyrics",
    working: "Writing your on-screen text…",
    saving: "Saving your on-screen text…",
  },
  "Full video planning": {
    working: "Planning your full video…",
    saving: "Receiving the full video plan…",
  },
  "Preview video planning": {
    working: "Planning your preview…",
    saving: "Receiving the preview plan…",
  },
  "preview video generation": {
    working: "Building your video preview…",
    saving: "Recording preview details…",
  },
  "full video generation": {
    working: "Building your full video…",
    saving: "Recording video details…",
  },
  "preview HTML generation": {
    working: "Building your page preview…",
    saving: "Recording page preview details…",
  },
  "full HTML generation": {
    working: "Building your full page…",
    saving: "Recording page details…",
  },
  "Result quality review": {
    working: "Reviewing your finished result…",
    saving: "Recording result review findings…",
  },
  "layout correction": {
    working: "Adjusting the layout…",
    saving: "Recording layout changes…",
  },
  "contrast correction": {
    working: "Improving readability…",
    saving: "Recording readability changes…",
  },
  "technical correction": {
    working: "Fixing playback issues…",
    saving: "Recording playback fixes…",
  },
  "pacing correction": {
    working: "Refining the story timing…",
    saving: "Recording timing changes…",
  },
  "style correction": {
    working: "Refining the Motion Graphics…",
    saving: "Recording Motion Graphic changes…",
  },
};
export function customerToolActivity(name: string, type: string, purpose?: string): string {
  if (/narration.*create_narration/.test(name)) return "Creating narration…";
  if (/narration.*edit_narration/.test(name)) return "Editing narration…";
  if (/react_bits.*search_components/.test(name)) return "Exploring visual components…";
  if (/react_bits.*read_component/.test(name)) return "Checking a visual component…";
  if (/react_bits.*install_component/.test(name)) return "Adding a visual component…";
  if (name.includes("capture_screenshot")) return "Capturing your website reference…";
  if (name.includes("capture_video")) return "Recording your website reference…";
  if (name.includes("wait_for_view")) return "Waiting for the website view…";
  if (
    /inspect_page|click_control|fill_control|upload_files|scroll_page|(?:^|__)browser_/.test(name)
  )
    return purpose === "Explicit-style preview planning"
      ? "Exploring your website for preview planning…"
      : "Exploring your website reference…";
  const task = purpose ? taskActivityLabels[purpose] : undefined;
  if (task) return /structuredoutput/i.test(name) ? task.saving : task.working;
  if (type === "file_change" || /write|edit|patch/i.test(name)) return "Updating the design…";
  if (/read|glob|grep|list/i.test(name)) return "Reading project content…";
  if (type === "web_search" || /search|fetch/i.test(name)) return "Looking up reference material…";
  if (/render|preview/i.test(name)) return "Preparing the preview…";
  if (/structuredoutput/i.test(name)) return "Finalizing the project details…";
  return "Working on your project…";
}
export function mergeProgressItems(
  previous: ActivityItem,
  item: ActivityItem,
): ActivityItem | undefined {
  if (
    previous.activityScopeId ||
    item.activityScopeId ||
    previous.captureTiming ||
    item.captureTiming ||
    previous.scope !== item.scope ||
    previous.purpose !== item.purpose ||
    previous.invocationId !== item.invocationId ||
    previous.progressStage !== item.progressStage ||
    previous.status === "failed" ||
    previous.status === "stopped" ||
    item.status === "failed" ||
    item.status === "stopped" ||
    previous.kind === "message" ||
    item.kind !== previous.kind ||
    item.text !== previous.text
  )
    return undefined;
  return {
    ...previous,
    time: item.time,
    progressPercent: item.progressPercent ?? previous.progressPercent,
    repetitions: previous.progressStage
      ? undefined
      : (previous.repetitions || 1) + (item.repetitions || 1),
    status:
      item.progressStage === "capture"
        ? item.status
        : previous.status === "running" || item.status === "running"
          ? "running"
          : item.status,
  };
}
export function activityItems(
  events: AgentProgressEvent[],
  groupConsecutive = true,
  run?: Pick<Run, "request" | "preparation" | "phase">,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  const renderProgress = new Map<string, RenderProgress>();
  const streams = new Map<string, ActivityItem>();
  const seen = new Set<number>();
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const data = { ...(event.data as object | undefined) } as {
      itemId?: string;
      activityScopeId?: string;
      audience?: "customer" | "internal";
      state?: string;
      toolName?: string;
      purpose?: string;
      invocationId?: string;
      correctionAttempt?: number;
      captureProgress?: unknown;
      captureTiming?: unknown;
      captureChapter?: { chapterId: string; title: string; index: number; total: number };
      results?: { itemId: string; failed: boolean; output: string }[];
    };
    // Execution scopes are tracing metadata, not customer activity groups.
    if (event.type === "activity_scope") continue;
    // Older title-only invocations were emitted with the full-brief default purpose.
    if (
      !event.jobId &&
      data.purpose === "Brief preparation" &&
      usesTitleOnlyPreparation(run?.request, run?.preparation)
    ) {
      data.purpose = "Project title extraction";
    }
    // Raw SDK narration and legacy unlabelled text are internal by default.
    // Only explicitly customer-authored messages can enter the streamed text view.
    if (
      event.type === "reasoning" ||
      (["text_start", "text_delta", "agent_message"].includes(event.type) &&
        data.audience !== "customer")
    )
      continue;
    const scope = `${event.runId}:${event.jobId || "brief"}`;
    const ownsInvocation = (item: ActivityItem) =>
      item.scope === scope &&
      item.purpose === data.purpose &&
      item.invocationId === data.invocationId &&
      item.activityScopeId === data.activityScopeId;
    const latest = (kind: ActivityItem["kind"]) =>
      items
        .slice()
        .reverse()
        .find((item) => ownsInvocation(item) && item.kind === kind);
    const finishText = () => {
      const text = streams.get(scope);
      if (text) text.streaming = false;
      streams.delete(scope);
    };
    const add = (kind: ActivityItem["kind"], text: string) => {
      const item: ActivityItem = {
        id: event.id,
        scope,
        jobId: event.jobId,
        kind,
        text,
        time: event.time,
        itemId: data.itemId,
        purpose: data.purpose,
        activityScopeId: data.activityScopeId,
        preparationStep: !event.jobId
          ? event.type === "reference_capture"
            ? "inputs"
            : taskActivityLabels[data.purpose || ""]?.preparationStep
          : undefined,
        invocationId: data.invocationId,
        correctionAttempt: data.correctionAttempt,
        captureChapterId: data.captureChapter?.chapterId,
        captureChapterTitle: data.captureChapter?.title,
        captureChapterIndex: data.captureChapter?.index,
      };
      items.push(item);
      return item;
    };
    if (event.type === "text_start") {
      finishText();
      continue;
    }
    if (event.type === "text_delta") {
      let item = streams.get(scope);
      if (!item) {
        item = add("message", "");
        streams.set(scope, item);
      }
      item.text += event.message;
      item.streaming = true;
      continue;
    }
    if (event.type === "agent_message") {
      const text = event.message.trim();
      if (!text) {
        finishText();
        continue;
      }
      const prior = data.itemId
        ? items
            .slice()
            .reverse()
            .find(
              (item) =>
                item.scope === scope && item.kind === "message" && item.itemId === data.itemId,
            )
        : latest("message");
      const item =
        prior && (data.itemId || prior.text.trim() === text || text.startsWith(prior.text.trim()))
          ? prior
          : add("message", text);
      item.text = text;
      item.streaming = data.state === "item.started" || data.state === "item.updated";
      finishText();
      continue;
    }
    if (
      [
        "tool",
        "tool_progress",
        "command_execution",
        "mcp_tool_call",
        "web_search",
        "file_change",
      ].includes(event.type)
    ) {
      finishText();
      const name =
        data.toolName ||
        (event.type === "command_execution"
          ? "Terminal"
          : event.type === "web_search"
            ? "Search"
            : event.type === "file_change"
              ? "Edit files"
              : event.message.split(" · ")[0]);
      // SDK heartbeats may use a synthetic ID rather than the owning tool-use ID.
      const ownerId =
        event.type === "tool_progress" ? data.itemId?.replace(/-heartbeat-\d+$/, "") : data.itemId;
      const prior = data.itemId
        ? items
            .slice()
            .reverse()
            .find(
              (item) =>
                ownsInvocation(item) &&
                item.kind === "tool" &&
                (item.itemId === data.itemId || item.itemId === ownerId),
            )
        : event.type === "tool_progress"
          ? latest("tool")
          : undefined;
      // Progress is not a separate action and cannot reopen a terminal result.
      if (event.type === "tool_progress") {
        if (prior?.status === "running") prior.time = event.time;
        continue;
      }
      const item = prior || add("tool", customerToolActivity(name, event.type, data.purpose));
      if (/narration.*(?:create_narration|edit_narration)/.test(name))
        item.capability = "narration";
      item.status = data.state === "item.completed" ? "complete" : "running";
      continue;
    }
    if (event.type === "tool_result") {
      finishText();
      if (data.results) {
        for (const result of data.results) {
          const tool = items
            .slice()
            .reverse()
            .find(
              (item) =>
                ownsInvocation(item) && item.kind === "tool" && item.itemId === result.itemId,
            );
          if (tool) {
            tool.status = result.failed ? "failed" : "complete";
          }
        }
      } else {
        const tool = latest("tool");
        if (tool) {
          tool.status = "complete";
        }
      }
      continue;
    }
    if (event.type === "capture_timing") {
      const parsed = CaptureChapterTimingSchema.safeParse(data.captureTiming);
      if (parsed.success) {
        const timing = parsed.data;
        const labels: Record<CaptureChapterTiming["phase"], string> = {
          recording: "Recording footage…",
          speed: "Speed adjusted to fit {{target}}s",
          review: "Reviewing playback…",
          validation: "Checking chapter duration…",
          accepted: "Capture accepted · {{actual}}s / {{target}}s",
          conflict: "Timing conflict · needs {{actual}}s / budget {{target}}s",
          replanning: "Revising timing with main planner… · attempt {{revision}}/2",
          revised: "Revised budget · {{target}}s",
          retry: "Retrying chapter capture… · attempt {{revision}}/{{limit}}",
        };
        const item = add("notice", labels[timing.phase]);
        item.captureTiming = timing;
        item.captureChapterId = timing.chapterId;
        item.captureChapterTitle = timing.title;
        item.captureChapterIndex = timing.index;
        item.status = timing.status;
      }
      continue;
    }
    if (event.type === "capture_progress") {
      const parsed = CaptureChapterProgressSchema.safeParse(data.captureProgress);
      if (parsed.success) {
        const progress = parsed.data;
        const item = add("notice", `${progress.index}/${progress.total} · ${progress.title}`);
        item.progressStage = "capture";
        item.captureChapterId = progress.chapterId;
        item.captureChapterTitle = progress.title;
        item.captureChapterIndex = progress.index;
        item.progressPercent = (progress.completed / progress.total) * 100;
        item.status = progress.status;
      }
      continue;
    }
    if (event.type === "state" || event.type === "session") continue;
    if (event.type === "usage") {
      finishText();
      // A turn ending is not evidence that a tool succeeded.
      for (const item of items)
        if (ownsInvocation(item) && item.status === "running") item.status = "stopped";
      continue;
    }
    const playbackCopy =
      event.message.startsWith("720p viewing copy") ||
      event.message === "Making the 720p viewing copy and card clip; the MP4 download is ready";
    const rendering = isRendererProgressEvent(event);
    const phaseLabel = playbackCopy
      ? "Preparing viewing copies…"
      : rendering
        ? "Rendering your video…"
        : event.message === "Mixing voice and music…"
          ? "Mixing your audio…"
          : "Preparing your finished project…";
    const notices: Record<string, string> = {
      lyrics: event.message === "Lyrics ready" ? "Lyrics ready" : "Writing your lyrics…",
      input: "Reading your reference material…",
      reference_capture: "Capturing your website reference…",
      reference_ready: "Website screenshot ready",
      plan_ready:
        event.message === "Preview plan validated and saved"
          ? "Preview plan validated and saved"
          : event.message === "Full-film storyboard validated and saved before capture"
            ? "Storyboard ready"
            : "Full-film plan validated and saved",
      ranking: "Finding visual Motion Graphics for your idea…",
      validation: playbackCopy
        ? "Viewing copies checked"
        : event.message === "Composition, layout, motion, and contrast checks passed"
          ? "Design checks complete"
          : "Checking the design and playback…",
      result_review: "Starting the final review…",
      phase: phaseLabel,
      render_progress: playbackCopy ? "Preparing viewing copies…" : "Rendering your video…",
      preview_ready: event.message.includes("Interactive")
        ? "Interactive preview ready"
        : event.message === "Full video ready"
          ? "Full video ready"
          : "Preview ready",
      error: "Something interrupted this step. You can retry it.",
      warning: "This step needs another check…",
      retry: "Model is busy. Retrying automatically…",
    };
    const notice = notices[event.type];
    if (notice) {
      const item = add("notice", notice);
      if (event.type === "error") item.retryable = true;
      if (playbackCopy) {
        const percent = event.message.match(/^720p viewing copy (\d+)%$/);
        if (percent) item.progressPercent = Math.min(100, Number(percent[1]));
      }
      if (rendering && !playbackCopy) {
        const progress = renderProgressUpdate(event, renderProgress.get(item.scope));
        if (progress) {
          renderProgress.set(item.scope, progress);
          item.progressPercent = progress.percent;
        }
        item.progressStage = "render";
      }
      if (event.type === "plan_ready") item.status = "complete";
      if (
        event.type === "render_progress" ||
        (event.type === "phase" && (rendering || playbackCopy))
      )
        item.progressStage = playbackCopy ? "playback-copy" : "render";
    }
  }
  // A terminal project cannot still have active preparation tools or text streams.
  if (run && terminalPhases.has(run.phase)) {
    for (const item of items) {
      if (item.jobId) continue;
      if (item.status === "running") item.status = "stopped";
      if (item.streaming) item.streaming = false;
    }
  }
  const visibleItems = items.filter((item) => item.text.trim());
  if (!groupConsecutive) return visibleItems;
  const grouped: ActivityItem[] = [];
  for (const item of visibleItems) {
    const previous = grouped.at(-1);
    const merged = previous && mergeProgressItems(previous, item);
    if (merged) grouped[grouped.length - 1] = merged;
    else grouped.push({ ...item });
  }
  return grouped;
}
