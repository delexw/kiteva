import type { AgentProgressEvent } from "../shared/contracts";
export interface ActivityItem {
  id: number;
  scope: string;
  jobId?: string;
  kind: "message" | "tool" | "notice";
  text: string;
  time: string;
  itemId?: string;
  streaming?: boolean;
  repetitions?: number;
  status?: "running" | "complete" | "failed" | "stopped";
}
export function customerToolActivity(name: string, type: string): string {
  if (name.includes("capture_screenshot")) return "Capturing your website reference…";
  if (name.includes("inspect_page") || name.includes("click_control"))
    return "Exploring your website reference…";
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
    previous.scope !== item.scope ||
    previous.kind === "message" ||
    item.kind !== previous.kind ||
    item.text !== previous.text
  )
    return undefined;
  return {
    ...previous,
    time: item.time,
    repetitions: (previous.repetitions || 1) + (item.repetitions || 1),
    status: previous.status === "running" || item.status === "running" ? "running" : item.status,
  };
}
export function activityItems(
  events: AgentProgressEvent[],
  groupConsecutive = true,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  const streams = new Map<string, ActivityItem>();
  const seen = new Set<number>();
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const data = (event.data || {}) as {
      itemId?: string;
      audience?: "customer" | "internal";
      state?: string;
      toolName?: string;
      results?: { itemId: string; failed: boolean; output: string }[];
    };
    // Raw SDK narration and legacy unlabelled text are internal by default.
    // Only explicitly customer-authored messages can enter the streamed text view.
    if (
      event.type === "reasoning" ||
      (["text_start", "text_delta", "agent_message"].includes(event.type) &&
        data.audience !== "customer")
    )
      continue;
    const scope = `${event.runId}:${event.jobId || "brief"}`;
    const latest = (kind: ActivityItem["kind"]) =>
      items
        .slice()
        .reverse()
        .find((item) => item.scope === scope && item.kind === kind);
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
      const prior = data.itemId
        ? items
            .slice()
            .reverse()
            .find(
              (item) => item.scope === scope && item.kind === "tool" && item.itemId === data.itemId,
            )
        : event.type === "tool_progress"
          ? latest("tool")
          : undefined;
      const item = prior || add("tool", customerToolActivity(name, event.type));
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
                item.scope === scope && item.kind === "tool" && item.itemId === result.itemId,
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
    if (event.type === "state" || event.type === "session") continue;
    if (event.type === "usage") {
      finishText();
      // A turn ending is not evidence that a tool succeeded.
      for (const item of items)
        if (item.scope === scope && item.status === "running") item.status = "stopped";
      continue;
    }
    const notices: Record<string, string> = {
      lyrics: event.message === "Lyrics ready" ? "Lyrics ready" : "Writing your lyrics…",
      input: "Reading your reference material…",
      reference_capture: "Capturing your website reference…",
      reference_ready: "Website screenshot ready",
      ranking: "Finding visual styles for your idea…",
      validation: "Checking the design and playback…",
      result_review: "Checking your finished result…",
      phase: "Preparing your finished project…",
      render_progress: "Creating your video…",
      preview_ready: event.message.includes("Interactive")
        ? "Interactive preview ready"
        : "Preview ready",
      error: "Something interrupted this step. You can retry it.",
      warning: "This step needs another check…",
      retry: "Model is busy. Retrying automatically…",
    };
    const notice = notices[event.type];
    if (notice) add("notice", notice);
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
