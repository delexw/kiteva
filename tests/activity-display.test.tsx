import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { displayActivityItems } from "../src/client/activity-display";
import { activityItems, type ActivityItem } from "../src/client/agent-activity-model";
import { uiLanguage } from "../src/client/i18n/service";
import { roomActivityStep } from "../src/client/room/room-activity";

const item = (id: number, change: Partial<ActivityItem> = {}): ActivityItem => ({
  id,
  scope: "job",
  jobId: "job",
  invocationId: "call",
  purpose: "full video generation",
  kind: "tool",
  text: "Building your full video…",
  time: "2026-10-19T00:00:00Z",
  status: "complete",
  ...change,
});
it("shows one video task around a recorded instrumental step, with a consolidated implementation group and no action counts", () => {
  const source = [
    item(1, { repetitions: 15 }),
    item(2, { text: "Rendering your instrumental music…" }),
    item(3, { repetitions: 2 }),
  ];
  const before = JSON.stringify(source);
  const shown = displayActivityItems(source);
  expect(shown).toHaveLength(1);
  expect(shown[0]).toMatchObject({
    text: "Creating your video…",
    children: [
      { text: "Building your full video…", status: "complete" },
      { text: "Rendering your instrumental music…", status: "complete" },
    ],
  });
  expect(shown[0].status).toBeUndefined();
  expect(shown[0].repetitions).toBeUndefined();
  expect(JSON.stringify(source)).toBe(before);
  const step = roomActivityStep(shown[0]);
  expect(step.title).toBe("Creating your video…");
  expect(step.status).toBeUndefined();
  const children = renderToStaticMarkup(<>{step.content}</>);
  expect(children).toContain("Rendering your instrumental music…");
  expect(children).toContain("success");
});
it("preserves running and failed capability statuses without claiming video completion", () => {
  const [shown] = displayActivityItems([
    item(1),
    item(2, { text: "Recording your website reference…", status: "failed" }),
    item(3, { status: "running" }),
  ]);
  expect(shown.status).toBe("running");
  expect(
    shown.children?.find((child) => child.text === "Recording your website reference…")?.status,
  ).toBe("failed");
});
it("groups resumed model calls by film while keeping jobs, review and repair tasks separate", () => {
  const shown = displayActivityItems([
    item(1),
    item(2, { invocationId: "second" }),
    item(3, { scope: "other-job" }),
    item(4, { purpose: "Result quality review", text: "Reviewing your finished result…" }),
    item(5, { purpose: "technical correction", text: "Fixing playback issues…" }),
  ]);
  expect(shown).toHaveLength(4);
  expect(shown[0].children?.map((child) => child.invocationId)).toEqual(["call", "second"]);
  expect(shown.slice(2).map((i) => i.text)).toEqual([
    "Reviewing your finished result…",
    "Fixing playback issues…",
  ]);
});
it("retains one film parent across intervening messages and capture stages", () => {
  const source = [
    item(1, { text: "Recording video details…" }),
    item(2, { kind: "message", text: "Continuing the film" }),
    item(3, {
      progressStage: "capture",
      captureChapterId: "chapter",
      captureChapterTitle: "Main task",
      captureChapterIndex: 1,
      progressPercent: 100,
    }),
    item(4, { invocationId: "resumed", status: "running" }),
  ];
  const before = JSON.stringify(source);
  const shown = displayActivityItems(source);
  const films = shown.filter((entry) => entry.text === "Creating your video…");
  expect(films).toHaveLength(1);
  expect(films[0]).toMatchObject({ status: "running" });
  expect(films[0].children?.map((child) => child.text)).toEqual([
    "Recording video details…",
    "Building your full video…",
  ]);
  expect(shown.some((entry) => entry.text === "Capturing footage…")).toBe(true);
  expect(shown.some((entry) => entry.text === "Continuing the film")).toBe(true);
  expect(JSON.stringify(source)).toBe(before);
});
it("keeps legacy labels, customer messages and preview tasks, while hiding action counts", () => {
  const shown = displayActivityItems([
    item(1, { purpose: undefined, text: "Reading project content…", repetitions: 5 }),
    item(2, { kind: "message", text: "Your original message" }),
    item(3, { purpose: "preview video generation", text: "Building your video preview…" }),
  ]);
  expect(shown.map((i) => i.text)).toEqual([
    "Reading project content…",
    "Your original message",
    "Building your video preview…",
  ]);
  expect(shown.every((i) => i.repetitions === undefined)).toBe(true);
  expect(String(roomActivityStep(shown[0]).title)).not.toContain("×");
});
it("uses only curated event labels and keeps raw content out of the presentation", () => {
  const events = [
    {
      id: 1,
      runId: "run",
      jobId: "job",
      time: "2026-10-19T00:00:00Z",
      type: "command_execution",
      message: "private command and filename",
      data: { purpose: "full video generation", invocationId: "call", itemId: "tool" },
    },
  ];
  const shown = displayActivityItems(activityItems(events));
  expect(shown[0].text).toBe("Creating your video…");
  expect(JSON.stringify(shown)).not.toContain("private command");
  expect(renderToStaticMarkup(<>{roomActivityStep(shown[0]).description}</>)).not.toContain(
    "private command",
  );
});

it("translates the video parent and recorded child capabilities into Chinese", async () => {
  try {
    await uiLanguage.change("zh-CN");
    const [shown] = displayActivityItems([
      item(1),
      item(2, { text: "Rendering your instrumental music…" }),
    ]);
    expect(roomActivityStep(shown).title).toBe("正在创作你的视频…");
    expect(renderToStaticMarkup(<>{roomActivityStep(shown).content}</>)).toContain(
      "正在渲染器乐配乐…",
    );
  } finally {
    await uiLanguage.change("en");
  }
});

it("shows recovered capabilities as complete without intermediate errors while preserving active work", () => {
  const [shown] = displayActivityItems([
    item(1, { text: "Exploring your website reference…" }),
    item(2, { text: "Capturing your website reference…", status: "failed" }),
    item(3, { text: "Exploring your website reference…" }),
    item(4, { text: "Capturing your website reference…" }),
    item(5, { text: "Exploring your website reference…", status: "running" }),
  ]);
  expect(shown.children?.map((child) => [child.text, child.status])).toEqual([
    ["Exploring your website reference…", "running"],
    ["Capturing your website reference…", "complete"],
  ]);
  expect(shown.children?.[1].children).toBeUndefined();
});

it("replaces a failed scroll with the successful retry without nested attempts", () => {
  const context = { purpose: "full video generation", invocationId: "call" };
  const events = [
    {
      id: 1,
      type: "tool",
      message: "mcp__reference_browser__scroll_page",
      data: { ...context, itemId: "failed-scroll" },
    },
    {
      id: 2,
      type: "tool_result",
      message: "private validation error",
      data: {
        ...context,
        results: [{ itemId: "failed-scroll", failed: true, output: "private arguments" }],
      },
    },
    {
      id: 3,
      type: "tool",
      message: "mcp__reference_browser__scroll_page",
      data: { ...context, itemId: "retry" },
    },
    {
      id: 4,
      type: "tool_result",
      message: "private page content",
      data: { ...context, results: [{ itemId: "retry", failed: false, output: "private page" }] },
    },
  ].map((event) => ({ ...event, runId: "run", jobId: "job", time: "2026-10-19T00:00:00Z" }));
  const before = JSON.stringify(events);
  const pending = displayActivityItems(activityItems(events.slice(0, 3)))[0].children![0];
  expect(pending.status).toBe("running");
  const [shown] = displayActivityItems(activityItems(events));
  const capability = shown.children![0];
  expect(capability.status).toBe("complete");
  expect(capability.children).toBeUndefined();
  expect(roomActivityStep(capability).status).toBe("success");
  expect(renderToStaticMarkup(<>{roomActivityStep(shown).content}</>)).not.toContain("error");
  expect(shown.status).toBeUndefined();
  expect(JSON.stringify(shown)).not.toContain("private");
  expect(JSON.stringify(events)).toBe(before);
});

it("keeps a later failed attempt red and does not let another capability clear it", () => {
  const [shown] = displayActivityItems([
    item(1, { text: "Exploring your website reference…" }),
    item(2, { text: "Exploring your website reference…", status: "failed" }),
    item(3, { text: "Capturing your website reference…" }),
  ]);
  expect(shown.children?.map((child) => child.status)).toEqual(["failed", "complete"]);
});

it("advances the existing video group's timestamp and exposes the recorded details step", () => {
  const [shown] = displayActivityItems([
    item(1, { time: "2026-10-19T00:00:00Z" }),
    item(2, { time: "2026-10-19T00:02:00Z" }),
    item(3, { text: "Recording video details…", status: "running", time: "2026-10-19T00:04:00Z" }),
  ]);
  expect(shown.time).toBe("2026-10-19T00:04:00Z");
  expect(shown.status).toBe("running");
  expect(shown.children?.map((child) => child.text)).toEqual([
    "Building your full video…",
    "Recording video details…",
  ]);
});

it("keeps implementation visible after recording, updating its time and active state", () => {
  const [shown] = displayActivityItems([
    item(1, { text: "Recording your website reference…" }),
    item(2, { time: "2026-10-19T00:01:00Z" }),
    item(3, { status: "running", time: "2026-10-19T00:03:00Z" }),
  ]);
  expect(shown.children).toHaveLength(2);
  const building = shown.children![1];
  expect(building).toMatchObject({
    text: "Building your full video…",
    status: "running",
    time: "2026-10-19T00:03:00Z",
  });
  expect(roomActivityStep(building).status).toBe("loading");
  expect(shown.children![0].status).toBe("complete");
});

it("places a later-updated capability after earlier capabilities", () => {
  const [shown] = displayActivityItems([
    item(1, { time: "2026-10-19T00:00:00Z" }),
    item(2, { text: "Recording your website reference…", time: "2026-10-19T00:01:00Z" }),
    item(3, { text: "Exploring your website reference…", time: "2026-10-19T00:02:00Z" }),
    item(4, { status: "running", time: "2026-10-19T00:03:00Z" }),
  ]);
  expect(shown.children?.map((child) => child.text)).toEqual([
    "Recording your website reference…",
    "Exploring your website reference…",
    "Building your full video…",
  ]);
  expect(shown.children?.at(-1)).toMatchObject({ status: "running", time: "2026-10-19T00:03:00Z" });
});

it.each(["Full video planning", "Preview video planning", "Brief preparation"])(
  "consolidates recovered %s tools into one flat activity",
  (purpose) => {
    const source = [
      item(1, { purpose, text: "Planning…", status: "complete" }),
      item(2, { purpose, text: "Planning…", status: "failed" }),
      item(3, { purpose, text: "Exploring…" }),
      item(4, { purpose, text: "Planning…", status: "running" }),
    ];
    const before = JSON.stringify(source);
    const pending = displayActivityItems(source);
    expect(pending.filter((entry) => entry.text === "Planning…")).toHaveLength(1);
    expect(pending[0]).toMatchObject({ status: "running" });
    const recovered = displayActivityItems([
      ...source.slice(0, 3),
      item(4, { purpose, text: "Planning…", status: "complete" }),
    ]);
    expect(recovered).toHaveLength(2);
    expect(recovered[0].status).toBe("complete");
    expect(recovered.every((entry) => !entry.children)).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
    const failed = displayActivityItems([
      ...source.slice(0, 3),
      item(4, { purpose, text: "Planning…", status: "failed" }),
    ]);
    expect(failed[0].status).toBe("failed");
  },
);

it("moves a consolidated planning update below earlier website activities", () => {
  const purpose = "Full video planning";
  const source = [
    item(1, {
      purpose,
      text: "Planning your full video…",
      time: "2026-10-21T00:41:00Z",
      status: "failed",
    }),
    item(2, { purpose, text: "Exploring your website reference…", time: "2026-10-21T00:43:00Z" }),
    item(3, { purpose, text: "Capturing your website reference…", time: "2026-10-21T00:43:30Z" }),
    item(4, { purpose, text: "Planning your full video…", time: "2026-10-21T00:44:00Z" }),
  ];
  const before = JSON.stringify(source);
  const shown = displayActivityItems(source);
  expect(shown.map(({ text }) => text)).toEqual([
    "Exploring your website reference…",
    "Capturing your website reference…",
    "Planning your full video…",
  ]);
  expect(shown.at(-1)).toMatchObject({ status: "complete", time: "2026-10-21T00:44:00Z" });
  expect(JSON.stringify(source)).toBe(before);
});

it("shows a green success node when its own measured work reaches 100%, preserving failures and stops", () => {
  const progress = item(1, {
    kind: "notice",
    purpose: undefined,
    invocationId: undefined,
    progressStage: "render",
    progressPercent: 100,
    status: undefined,
  });
  const complete = displayActivityItems([progress])[0];
  expect(roomActivityStep(complete).status).toBe("success");
  expect(roomActivityStep(complete).icon).toBeUndefined();
  for (const [status, expected] of [
    ["failed", "error"],
    ["stopped", "abort"],
  ] as const) {
    const shown = displayActivityItems([{ ...progress, status }])[0];
    expect(roomActivityStep(shown).status).toBe(expected);
  }
  expect(displayActivityItems([{ ...progress, progressPercent: 99 }])[0].status).toBeUndefined();
  const parent = displayActivityItems([item(1, { progressPercent: undefined })])[0];
  parent.children = [complete];
  expect(roomActivityStep(parent).status).not.toBe("success");
});

it("groups chapter captures under one measured parent progress bar", () => {
  const events = [
    { completed: 0, index: 1, chapterId: "create", title: "Create", status: "running" },
    { completed: 1, index: 1, chapterId: "create", title: "Create", status: "complete" },
    { completed: 1, index: 2, chapterId: "review", title: "Review", status: "running" },
  ].map((progress, index) => ({
    id: index + 1,
    runId: "example",
    jobId: "job",
    type: "capture_progress",
    time: `2026-01-01T00:00:0${index}Z`,
    message: "Capturing footage…",
    data: { captureProgress: { ...progress, total: 2 } },
  }));
  const display = displayActivityItems(activityItems(events));
  expect(display).toHaveLength(1);
  expect(display[0]).toMatchObject({
    text: "Capturing footage…",
    progressPercent: 50,
    status: "running",
  });
  expect(
    display[0].children?.map((child) => ({ id: child.captureChapterId, status: child.status })),
  ).toEqual([
    { id: "create", status: "complete" },
    { id: "review", status: "running" },
  ]);
  const complete = {
    ...events[2],
    id: 4,
    data: {
      captureProgress: {
        completed: 2,
        total: 2,
        index: 2,
        chapterId: "review",
        title: "Review",
        status: "complete",
      },
    },
  };
  const finished = displayActivityItems(activityItems([...events, complete]));
  expect(finished[0]).toMatchObject({ progressPercent: 100, status: "complete" });
  const failed = {
    ...events[2],
    id: 4,
    data: {
      captureProgress: {
        completed: 1,
        total: 2,
        index: 2,
        chapterId: "review",
        title: "Review",
        status: "failed",
      },
    },
  };
  expect(displayActivityItems(activityItems([...events, failed]))[0]).toMatchObject({
    progressPercent: 50,
    status: "failed",
  });
});

it("shows each chapter as the parent and consolidates recovered operations to their final result", () => {
  const chapter = {
    captureChapterId: "discover",
    captureChapterTitle: "Find the knowledge",
    captureChapterIndex: 2,
    purpose: "Footage chapter capture",
  };
  const source = [
    item(1, {
      ...chapter,
      kind: "notice",
      progressStage: "capture",
      progressPercent: 25,
      status: "running",
    }),
    item(2, { ...chapter, text: "Exploring your website reference…", status: "complete" }),
    item(3, { ...chapter, text: "Exploring your website reference…", status: "failed" }),
    item(4, { ...chapter, text: "Recording your website reference…", status: "complete" }),
    item(5, {
      ...chapter,
      text: "Exploring your website reference…",
      status: "complete",
      invocationId: "retry",
      time: "2026-10-19T00:03:00Z",
    }),
    item(6, {
      ...chapter,
      kind: "notice",
      progressStage: "capture",
      progressPercent: 50,
      status: "complete",
    }),
  ];
  const before = JSON.stringify(source);
  const [capture] = displayActivityItems(source);
  expect(capture.children).toHaveLength(1);
  const parent = capture.children![0];
  expect(parent).toMatchObject({ text: "2 · Find the knowledge", status: "complete" });
  expect(parent.children).toHaveLength(2);
  expect(
    parent.children?.find((child) => child.text === "Exploring your website reference…"),
  ).toMatchObject({ status: "complete", time: "2026-10-19T00:03:00Z" });
  expect(roomActivityStep(parent).status).toBe("success");
  expect(renderToStaticMarkup(<>{roomActivityStep(parent).content}</>)).not.toContain(
    "status-error",
  );
  expect(JSON.stringify(source)).toBe(before);
});
it.each(["failed", "running"] as const)(
  "preserves an unresolved chapter operation's final %s state without duplicate rows",
  (status) => {
    const chapter = {
      captureChapterId: "discover",
      captureChapterTitle: "Discover",
      captureChapterIndex: 1,
      purpose: "Footage chapter capture",
      text: "Exploring your website reference…",
    };
    const [capture] = displayActivityItems([
      item(1, { ...chapter, status: "complete" }),
      item(2, { ...chapter, status: "failed" }),
      item(3, { ...chapter, status }),
    ]);
    expect(capture.children![0].children).toHaveLength(1);
    expect(capture.children![0].children![0].status).toBe(status);
  },
);
it("never merges identical operation labels from different capture chapters or jobs", () => {
  const chapter = {
    captureChapterTitle: "Discover",
    captureChapterIndex: 1,
    purpose: "Footage chapter capture",
    text: "Exploring your website reference…",
  };
  const shown = displayActivityItems([
    item(1, { ...chapter, captureChapterId: "first", status: "failed" }),
    item(2, { ...chapter, captureChapterId: "second", captureChapterIndex: 2, status: "complete" }),
    item(3, { ...chapter, captureChapterId: "first", scope: "other-job", status: "complete" }),
  ]);
  expect(shown).toHaveLength(2);
  expect(shown[0].children?.map((parent) => parent.children![0].status)).toEqual([
    "failed",
    "complete",
  ]);
  expect(shown[1].children![0].children![0].status).toBe("complete");
});

it("nests timing outcomes under the chapter, resolves recovered conflicts and preserves measured progress", () => {
  const timing = (id: number, phase: string, status: string, actualDurationSeconds?: number) => ({
    id,
    runId: "run",
    jobId: "job",
    type: "capture_timing",
    message: "Internal timing details",
    time: `2026-01-01T10:00:${String(id).padStart(2, "0")}Z`,
    data: {
      captureTiming: {
        chapterId: "create",
        title: "Create",
        index: 1,
        total: 2,
        phase,
        status,
        targetDurationSeconds: 10,
        actualDurationSeconds,
        revision: 1,
      },
    },
  });
  const progress = {
    id: 1,
    runId: "run",
    jobId: "job",
    type: "capture_progress",
    message: "",
    time: "2026-01-01T10:00:01Z",
    data: {
      captureProgress: {
        chapterId: "create",
        title: "Create",
        index: 1,
        total: 2,
        completed: 0,
        status: "running",
      },
    },
  };
  const events = [
    progress,
    timing(2, "conflict", "failed", 13),
    timing(3, "replanning", "running"),
    timing(4, "replanning", "complete"),
    timing(5, "speed", "complete"),
    timing(6, "review", "running"),
    timing(7, "review", "complete"),
    timing(8, "accepted", "complete", 9.9),
    {
      ...progress,
      id: 9,
      data: {
        captureProgress: { ...progress.data.captureProgress, completed: 1, status: "complete" },
      },
      time: "2026-01-01T10:00:09Z",
    },
  ];
  const before = JSON.stringify(events);
  const [capture] = displayActivityItems(activityItems(events));
  expect(capture.progressPercent).toBe(50);
  const chapter = capture.children![0];
  expect(chapter.text).toBe("1 · Create");
  expect(
    chapter.children?.filter((child) => child.captureTiming?.phase === "replanning"),
  ).toHaveLength(1);
  expect(chapter.children?.filter((child) => child.captureTiming?.phase === "review")).toHaveLength(
    1,
  );
  expect(chapter.children?.every((child) => child.status === "complete")).toBe(true);
  expect(chapter.children?.find((child) => child.captureTiming?.phase === "conflict")?.text).toBe(
    "Timing conflict resolved",
  );
  const accepted = chapter.children!.find((child) => child.captureTiming?.phase === "accepted")!;
  expect(roomActivityStep(accepted).title).toBe("Capture accepted · 9.9s / 10s");
  expect(JSON.stringify(events)).toBe(before);
  expect(
    activityItems([
      { ...timing(10, "accepted", "complete"), data: { captureTiming: { phase: "accepted" } } },
    ]),
  ).toEqual([]);
});

it.each(["failed", "stopped"] as const)(
  "settles pending chapter timing rows when capture is %s",
  (status) => {
    const timing = {
      id: 1,
      runId: "run",
      jobId: "job",
      time: "2026-01-01T00:00:01Z",
      type: "capture_timing",
      message: "",
      data: {
        captureTiming: {
          chapterId: "create",
          title: "Create",
          index: 1,
          total: 1,
          phase: "review",
          status: "running",
          targetDurationSeconds: 10,
        },
      },
    };
    const end = {
      id: 2,
      runId: "run",
      jobId: "job",
      time: "2026-01-01T00:00:02Z",
      type: "capture_progress",
      message: "",
      data: {
        captureProgress: {
          chapterId: "create",
          title: "Create",
          index: 1,
          total: 1,
          completed: 0,
          status,
        },
      },
    };
    const [capture] = displayActivityItems(activityItems([timing, end]));
    expect(capture.children![0].children![0].status).toBe(status);
  },
);
