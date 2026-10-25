import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityRow, AgentActivity, ProgressDisclosure } from "../src/client/agent-activity";
import {
  activityItems,
  customerToolActivity,
  mergeProgressItems,
} from "../src/client/agent-activity-model";
import type { AgentProgressEvent } from "../src/shared/contracts";

it("distinguishes receiving a model response from a validated and saved plan", () => {
  const received = event(1, "tool", "StructuredOutput", "a", {
    toolName: "StructuredOutput",
    itemId: "output",
    purpose: "Preview video planning",
    state: "item.completed",
  });
  const items = activityItems([
    received,
    event(2, "plan_ready", "Preview plan validated and saved", "a", {
      purpose: "Preview video planning",
    }),
  ]);
  expect(items.map((item) => item.text)).toEqual([
    "Receiving the preview plan…",
    "Preview plan validated and saved",
  ]);
  expect(items[1].status).toBe("complete");
  expect(activityItems([received]).some((item) => item.text.includes("validated and saved"))).toBe(
    false,
  );
});
function event(
  id: number,
  type: string,
  message: string,
  jobId = "a",
  data?: unknown,
): AgentProgressEvent {
  return {
    id,
    runId: "project",
    jobId,
    type,
    message,
    time: "2026-10-11T00:00:00Z",
    data: { audience: "customer", ...(data as object) },
  };
}
describe("readable agent activity", () => {
  it("shows branded loading only while the grouped progress is active", () => {
    const items = [
      {
        id: 1,
        scope: "project",
        kind: "tool" as const,
        text: "Reading project content…",
        time: "2026-10-11T00:00:00Z",
      },
    ];
    for (const active of [true, false]) {
      const html = renderToStaticMarkup(
        <ProgressDisclosure items={items} title="Project preparation" active={active} />,
      );
      expect(html).toContain("/kiteva-mark.svg");
      expect(html).not.toContain("lucide-brain");
      expect(html.includes("progress-kiteva-mark-loading")).toBe(active);
      expect(html.includes("Thinking…")).toBe(active);
      expect(html).toContain('aria-expanded="false"');
    }
  });
  it("hides internal failed and stopped indicators while keeping useful progress", () => {
    for (const status of ["failed", "stopped"] as const) {
      const html = renderToStaticMarkup(
        <ActivityRow
          item={{
            id: 1,
            scope: "project",
            kind: "tool",
            text: "Reading project content…",
            time: "2026-10-11T00:00:00Z",
            status,
          }}
        />,
      );
      expect(html).toContain("Reading project content…");
      expect(html).not.toContain('role="img"');
    }
    for (const status of ["running", "complete"] as const) {
      const html = renderToStaticMarkup(
        <ActivityRow
          item={{
            id: 1,
            scope: "project",
            kind: "tool",
            text: "Reading project content…",
            time: "2026-10-11T00:00:00Z",
            status,
          }}
        />,
      );
      expect(html).toContain(`aria-label="${status === "running" ? "Working" : "Done"}"`);
    }
  });
  it("streams fragments into one message and replaces the completed duplicate", () => {
    const events = [event(1, "text_delta", "Building "), event(2, "text_delta", "geometry.")];
    expect(activityItems(events)).toMatchObject([{ text: "Building geometry.", streaming: true }]);
    events.push(event(3, "agent_message", "Building geometry."));
    expect(activityItems(events)).toMatchObject([{ text: "Building geometry.", streaming: false }]);
  });
  it("separates concurrent candidates and content blocks and ignores reconnect duplicates", () => {
    const first = event(1, "text_delta", "One", "a");
    const items = activityItems([
      first,
      first,
      event(2, "text_delta", "Two", "b"),
      event(3, "text_start", "", "a"),
      event(4, "text_delta", "Next", "a"),
    ]);
    expect(items.map((item) => item.text)).toEqual(["One", "Two", "Next"]);
  });
  it("updates Codex cumulative messages and tool calls in place", () => {
    const items = activityItems([
      event(1, "agent_message", "Building", "a", { itemId: "text", state: "item.started" }),
      event(2, "agent_message", "Building shapes", "a", { itemId: "text", state: "item.updated" }),
      event(3, "agent_message", "Building shapes.", "a", {
        itemId: "text",
        state: "item.completed",
      }),
      event(4, "command_execution", "render\n", "a", { itemId: "cmd", state: "item.started" }),
      event(5, "command_execution", "render\nDone", "a", {
        itemId: "cmd",
        state: "item.completed",
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ text: "Building shapes.", streaming: false });
    expect(items[1]).toMatchObject({
      text: "Working on your project…",
      status: "complete",
    });
  });
  it("matches tool progress and results by identity, including parallel failures", () => {
    const items = activityItems([
      event(1, "tool", "Read", "a", { itemId: "one" }),
      event(2, "tool", "Write", "a", { itemId: "two" }),
      event(3, "tool_progress", "Read · 2s", "a", { itemId: "one", toolName: "Read" }),
      event(4, "tool_result", "", "a", {
        results: [
          { itemId: "one", failed: true, output: "Denied" },
          { itemId: "two", failed: false, output: "Saved" },
        ],
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.status)).toEqual(["failed", "complete"]);
  });
  it.each(["complete", "failed", "stopped"] as const)(
    "keeps recording heartbeats attached to their owner with a %s outcome",
    (status) => {
      const data = { purpose: "full video generation", invocationId: "build" };
      const events = [
        event(1, "tool", "mcp__reference_browser__capture_video", "a", { ...data, itemId: "take" }),
        event(2, "tool", "Read", "a", { ...data, itemId: "parallel" }),
        {
          ...event(3, "tool_progress", "capture_video · 30s", "a", {
            ...data,
            itemId: "take-heartbeat-0",
            toolName: "mcp__reference_browser__capture_video",
          }),
          time: "2026-10-11T00:00:30Z",
        },
      ];
      expect(activityItems(events, false)[0]).toMatchObject({
        itemId: "take",
        time: "2026-10-11T00:00:30Z",
        status: "running",
      });
      if (status !== "stopped")
        events.push(
          event(4, "tool_result", "", "a", {
            ...data,
            results: [{ itemId: "take", failed: status === "failed", output: "Result" }],
          }),
        );
      events.push(event(5, "usage", "Turn complete", "a", data));
      events.push(
        event(6, "tool_progress", "capture_video · 60s", "a", {
          ...data,
          itemId: "take-heartbeat-1",
          toolName: "mcp__reference_browser__capture_video",
        }),
      );
      const items = activityItems(events, false);
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({ itemId: "take", status });
      expect(items[1]).toMatchObject({ itemId: "parallel", status: "stopped" });
      expect(items.some((item) => item.itemId?.includes("heartbeat"))).toBe(false);
    },
  );
  it("does not invent tasks for unmatched progress or attach it to another invocation", () => {
    const items = activityItems(
      [
        event(1, "tool", "Read", "a", { itemId: "tool", invocationId: "first" }),
        event(2, "tool_progress", "Read · 30s", "a", {
          itemId: "tool-heartbeat-0",
          invocationId: "second",
        }),
        event(3, "tool_progress", "Read · 30s", "a", {
          itemId: "unknown-heartbeat-0",
          invocationId: "first",
        }),
      ],
      false,
    );
    expect(items).toHaveLength(1);
    expect(items[0].time).toBe("2026-10-11T00:00:00Z");
  });
  it("renders messages and named tools without SDK labels, usage JSON or duplicate tool messages", () => {
    const html = renderToStaticMarkup(
      <AgentActivity
        events={[
          event(1, "state", "Workflow updated"),
          event(2, "session", "Claude session opened"),
          event(3, "text_delta", "**Building** shapes."),
          event(4, "agent_message", "**Building** shapes."),
          event(5, "tool", "Bash", "a", { itemId: "tool" }),
          event(6, "agent_message", "Tool: Bash", "a", { audience: "internal" }),
          event(7, "tool_result", "ok"),
          event(8, "usage", "Turn complete", "a", { cost: 1.23 }),
        ]}
      />,
    );
    expect(html).toContain('data-streamdown="strong">Building');
    expect(html).toContain("Working on your project…");
    expect(html).not.toContain("View result");
    expect(html).not.toContain("Bash");
    for (const hidden of [
      "text_delta",
      "agent_message",
      "tool_result",
      "Workflow updated",
      "Tool: Bash",
      "1.23",
    ])
      expect(html).not.toContain(hidden);
  });
});
it("reuses the streaming activity display within the progress area", () => {
  const html = renderToStaticMarkup(
    <AgentActivity variant="progress" events={[event(1, "text_delta", "Planning your story.")]} />,
  );
  expect(html).toContain("activity-panel activity-progress");
  expect(html).toContain("Live progress");
  expect(html).toContain("Planning your story.");
  expect(html).not.toContain("text_delta");
});

it("shows customer actions without commands, tool results, paths or export promotions", () => {
  const html = renderToStaticMarkup(
    <AgentActivity
      events={[
        event(1, "tool", "Read", "a", { itemId: "read" }),
        event(2, "tool_result", "/Users/private/storyboard.json", "a"),
        event(3, "file_change", "update: /Users/private/index.html", "a", { itemId: "edit" }),
        event(4, "render_progress", "Keep editing with Framey in HyperFrames https://example.com"),
        event(5, "render_progress", "/Users/private/preview.mp4"),
        event(6, "text_delta", "Let me check HyperFrames audio syntax.", "a", {
          audience: "internal",
        }),
        event(7, "text_start", ""),
        event(8, "text_delta", "Refining the scene."),
      ]}
    />,
  );
  expect(html).toContain("Reading project content…");
  expect(html).toContain("Updating the design…");
  expect(html).toContain("Rendering your video…");
  expect(html).toContain("Refining the scene.");
  for (const hidden of [
    "/Users/",
    "storyboard.json",
    "index.html",
    "preview.mp4",
    "Framey",
    "HyperFrames",
    "https://",
    "View result",
  ])
    expect(html).not.toContain(hidden);
});

it("hides raw narration regardless of its vocabulary, including legacy events and split streams", () => {
  const text = "Next I'll generate the code-made score and check the palette with chroma-js.";
  for (const narration of [text, "This scene looks great.", "The Miro tools are not needed."]) {
    const raw = ["agent_message", "reasoning", "text_delta"].map((type, i) => ({
      ...event(i + 1, type, narration),
      data: undefined,
    }));
    expect(activityItems(raw)).toEqual([]);
    expect(activityItems(raw.map((e) => ({ ...e, data: { audience: "internal" } })))).toEqual([]);
  }
  expect(
    activityItems([
      event(1, "text_delta", "Next I'll", "a", { audience: "internal" }),
      event(2, "text_delta", " generate sound", "a", { audience: "internal" }),
    ]),
  ).toEqual([]);
  // Visibility follows structured intent, never the words in the message.
  expect(activityItems([event(1, "agent_message", text)])).toMatchObject([{ text }]);
  expect(activityItems([event(1, "reasoning", text)])).toEqual([]);
});

it("groups consecutive identical progress within a job without mixing candidates", () => {
  const items = activityItems([
    event(1, "tool", "Bash", "a", { itemId: "a1" }),
    event(2, "tool_result", "done", "a"),
    event(3, "tool", "Bash", "a", { itemId: "a2" }),
    event(4, "tool_result", "done", "a"),
    event(5, "tool", "Bash", "b", { itemId: "b1" }),
    event(6, "tool_result", "done", "b"),
    event(7, "tool", "Bash", "a", { itemId: "a3" }),
    event(8, "tool_result", "", "a", {
      results: [{ itemId: "a3", failed: true, output: "private" }],
    }),
  ]);
  expect(items).toHaveLength(3);
  expect(items[0]).toMatchObject({ jobId: "a", repetitions: 2, status: "complete" });
  expect(items[1]).toMatchObject({ jobId: "b", status: "complete" });
  expect(items[2]).toMatchObject({ jobId: "a", status: "failed" });
  const html = renderToStaticMarkup(
    <AgentActivity
      events={[
        event(1, "tool", "Read"),
        event(2, "tool_result", "done"),
        event(3, "tool", "Read"),
        event(4, "tool_result", "done"),
      ]}
    />,
  );
  expect(html).not.toContain("2 updates");
  expect(html).toMatch(/class="[^"]*activity-content/);
  expect(html).not.toContain("<header>");
});
it("adds existing update counts and stops grouping when the message changes", () => {
  const base = {
    id: 1,
    scope: "project:a",
    kind: "tool" as const,
    text: "Working on your project…",
    time: "2026-10-11T00:00:00Z",
    status: "complete" as const,
    repetitions: 2,
  };
  expect(mergeProgressItems(base, { ...base, id: 2, repetitions: 3 })).toMatchObject({
    repetitions: 5,
  });
  expect(mergeProgressItems(base, { ...base, scope: "project:b" })).toBeUndefined();
  expect(mergeProgressItems(base, { ...base, text: "Updating the design…" })).toBeUndefined();
  const items = activityItems([
    event(1, "tool", "Bash", "a", { itemId: "a" }),
    event(2, "tool", "Write", "a", { itemId: "b" }),
    event(3, "tool", "Bash", "a", { itemId: "c" }),
  ]);
  expect(items.map((item) => item.text)).toEqual([
    "Working on your project…",
    "Updating the design…",
    "Working on your project…",
  ]);
  expect(items.every((item) => !item.repetitions)).toBe(true);
});

it("shows automatic capacity retry progress within the owning job", () => {
  const items = activityItems([
    event(1, "retry", "Internal detail", "preview-a", { reason: "model_capacity" }),
  ]);
  expect(items).toMatchObject([
    { jobId: "preview-a", kind: "notice", text: "Model is busy. Retrying automatically…" },
  ]);
});

it("distinguishes preparation, review, repair and recheck without showing internal data", () => {
  const phases = [
    ["Brief preparation", "Preparing your brief…", "Saving the draft brief…"],
    [
      "Brief asset self-review",
      "Checking references against your story…",
      "Recording review findings…",
    ],
    ["Brief asset alignment repair", "Revising reference usage…", "Saving the revised brief…"],
    [
      "Brief asset self-review",
      "Checking references against your story…",
      "Recording review findings…",
    ],
  ];
  const events = phases.flatMap(([purpose], index) => {
    const data = { purpose, invocationId: `turn-${index}`, audience: "internal" };
    return [
      event(index * 4 + 1, "tool", "Read secret-file.txt", "a", {
        ...data,
        itemId: "read",
        toolName: "Read",
      }),
      event(index * 4 + 2, "tool_result", "secret raw output", "a", {
        ...data,
        results: [{ itemId: "read", failed: false, output: "secret" }],
      }),
      event(index * 4 + 3, "tool", "StructuredOutput", "a", {
        ...data,
        itemId: "save",
        toolName: "StructuredOutput",
      }),
      event(index * 4 + 4, "reasoning", "secret reasoning", "a", data),
    ];
  });
  const items = activityItems(events);
  expect(items.map((item) => item.text)).toEqual(
    phases.flatMap(([, working, saving]) => [working, saving]),
  );
  expect(
    items.filter((item) => item.itemId === "read").every((item) => item.status === "complete"),
  ).toBe(true);
  expect(
    items.filter((item) => item.itemId === "save").every((item) => item.status === "running"),
  ).toBe(true);
  expect(JSON.stringify(items)).not.toContain("secret");
});

it("groups only within the same purpose and invocation, preserving website actions and legacy labels", () => {
  const tool = (id: number, purpose?: string, invocationId?: string, toolName = "Read") =>
    event(id, "tool", "raw hidden", "a", { purpose, invocationId, toolName, itemId: String(id) });
  const items = activityItems([
    tool(1, "Brief preparation", "one"),
    tool(2, "Brief preparation", "one"),
    tool(3, "Brief preparation", "two"),
    tool(4, "Brief asset self-review", "two"),
    tool(5, "Brief asset self-review", "two", "mcp__reference_browser__inspect_page"),
    tool(6, "Brief asset self-review", "two", "mcp__reference_browser__capture_screenshot"),
    tool(7),
    tool(8, undefined, undefined, "StructuredOutput"),
  ]);
  expect(items).toHaveLength(7);
  expect(items[0].repetitions).toBe(2);
  expect(items[1].repetitions).toBeUndefined();
  expect(items.slice(3).map((item) => item.text)).toEqual([
    "Exploring your website reference…",
    "Capturing your website reference…",
    "Reading project content…",
    "Finalizing the project details…",
  ]);
});

it("does not apply one invocation's tool completion or usage to another invocation", () => {
  const items = activityItems([
    event(1, "tool", "Read", "a", { invocationId: "one", itemId: "shared" }),
    event(2, "tool", "Read", "a", { invocationId: "two", itemId: "shared" }),
    event(3, "tool_result", "hidden", "a", {
      invocationId: "one",
      results: [{ itemId: "shared", failed: true, output: "hidden" }],
    }),
    event(4, "usage", "done", "a", { invocationId: "one" }),
  ]);
  expect(items.map((item) => item.status)).toEqual(["failed", "running"]);
});

it.each([
  [
    "Motion Graphic information extraction",
    "Understanding Motion Graphics…",
    "Recording Motion Graphic details…",
  ],
  [
    "Motion Graphic combination proposals",
    "Exploring Motion Graphic combinations…",
    "Saving proposed combinations…",
  ],
  ["Combination evaluation", "Comparing creative directions…", "Recording direction choices…"],
  ["Lyrics generation", "Writing your on-screen text…", "Saving your on-screen text…"],
  ["Video copy translation", "Translating your video text…", "Saving translated video text…"],
  ["Preview video planning", "Planning your preview…", "Receiving the preview plan…"],
  ["Full video planning", "Planning your full video…", "Receiving the full video plan…"],
  ["preview video generation", "Building your video preview…", "Recording preview details…"],
  ["full video generation", "Building your full video…", "Recording video details…"],
  ["preview HTML generation", "Building your page preview…", "Recording page preview details…"],
  ["full HTML generation", "Building your full page…", "Recording page details…"],
  ["Result quality review", "Reviewing your finished result…", "Recording result review findings…"],
  ["layout correction", "Adjusting the layout…", "Recording layout changes…"],
  ["contrast correction", "Improving readability…", "Recording readability changes…"],
  ["technical correction", "Fixing playback issues…", "Recording playback fixes…"],
  ["pacing correction", "Refining the story timing…", "Recording timing changes…"],
  ["style correction", "Refining the Motion Graphics…", "Recording Motion Graphic changes…"],
])("labels %s by task instead of raw tool actions", (purpose, working, saving) => {
  for (const toolName of ["Read", "Bash", "Write", "mcp__internal__private_tool"])
    expect(customerToolActivity(toolName, "tool", purpose)).toBe(working);
  expect(customerToolActivity("StructuredOutput", "tool", purpose)).toBe(saving);
  const metadata = { purpose, invocationId: "invocation-a", audience: "internal" };
  const events = [
    event(1, "tool", "Read private-file.txt", "a", {
      ...metadata,
      toolName: "Read",
      itemId: "read",
    }),
    event(2, "tool_result", "private tool output", "a", {
      ...metadata,
      results: [{ itemId: "read", failed: false, output: "private findings" }],
    }),
    event(3, "tool", "StructuredOutput", "a", {
      ...metadata,
      toolName: "StructuredOutput",
      itemId: "save",
    }),
    event(4, "reasoning", "private reasoning", "a", metadata),
    event(5, "agent_message", "private prompt and progress", "a", metadata),
  ];
  expect(activityItems(events).map((item) => [item.text, item.status])).toEqual([
    [working, "complete"],
    [saving, "running"],
  ]);
  const html = renderToStaticMarkup(<AgentActivity events={events} />);
  if (purpose === "full video generation") {
    expect(html).toContain("Creating your video…");
    expect(html).toContain(working);
    expect(html).toContain(saving);
  } else {
    expect(html).toContain(working);
    expect(html).toContain(saving);
  }
  expect(html).not.toMatch(/private|StructuredOutput|Finalizing|Reading project content/);
});

it("keeps Motion Graphic extraction, proposals and separate model calls distinct", () => {
  const tasks = [
    ["Motion Graphic information extraction", "one"],
    ["Motion Graphic information extraction", "one"],
    ["Motion Graphic information extraction", "two"],
    ["Motion Graphic combination proposals", "three"],
    ["Combination evaluation", "four"],
  ];
  const items = activityItems(
    tasks.map(([purpose, invocationId], index) =>
      event(index + 1, "tool", "private", "a", {
        purpose,
        invocationId,
        toolName: "Read",
        itemId: String(index),
      }),
    ),
  );
  expect(items.map((item) => [item.text, item.repetitions])).toEqual([
    ["Understanding Motion Graphics…", 2],
    ["Understanding Motion Graphics…", undefined],
    ["Exploring Motion Graphic combinations…", undefined],
    ["Comparing creative directions…", undefined],
  ]);
  expect(customerToolActivity("mcp__reference_browser__inspect_page", "tool", tasks[0][0])).toBe(
    "Exploring your website reference…",
  );
  expect(
    customerToolActivity("mcp__reference_browser__capture_screenshot", "tool", tasks[0][0]),
  ).toBe("Capturing your website reference…");
  expect(customerToolActivity("Read", "tool", "private unknown task")).toBe(
    "Reading project content…",
  );
});

it.each([
  ["capture_video", "Recording your website reference…"],
  ["wait_for_view", "Waiting for the website view…"],
  ["fill_control", "Exploring your website reference…"],
  ["scroll_page", "Exploring your website reference…"],
])("labels website %s separately from generation", (toolName, label) => {
  const events = [
    event(1, "tool", "private parameters and output", "a", {
      purpose: "full video generation",
      invocationId: "video",
      audience: "internal",
      toolName: `mcp__reference_browser__${toolName}`,
      itemId: "website",
    }),
  ];
  expect(activityItems(events)[0]).toMatchObject({ text: label, status: "running" });
  const html = renderToStaticMarkup(<AgentActivity events={events} />);
  expect(html).toContain(label);
  expect(html).not.toMatch(/private|mcp__|parameters|output/);
});

it("shows rendering, audio, final review and viewing copies as distinct stages without frame counts", () => {
  const events = [
    event(1, "phase", "Rendering validated composition"),
    ...Array.from({ length: 154 }, (_, index) =>
      event(index + 2, "render_progress", `private renderer output ${index}`),
    ),
    event(156, "phase", "Mixing voice and music…"),
    event(157, "result_review", "Checking your finished result…"),
    event(158, "tool", "private", "a", {
      toolName: "Read",
      purpose: "Result quality review",
      invocationId: "review",
      itemId: "read",
    }),
    event(159, "tool", "private", "a", {
      toolName: "StructuredOutput",
      purpose: "Result quality review",
      invocationId: "review",
      itemId: "save",
    }),
    event(160, "preview_ready", "Full video ready"),
    event(161, "phase", "Making the 720p viewing copy and card clip; the MP4 download is ready"),
    ...Array.from({ length: 9 }, (_, index) =>
      event(index + 162, "render_progress", `720p viewing copy ${index * 10}%`),
    ),
    event(
      171,
      "validation",
      "720p viewing copy and card clip checked against the MP4 (private diagnostics)",
    ),
  ];
  const items = activityItems(events);
  expect(items.map((item) => item.text)).toEqual([
    "Rendering your video…",
    "Mixing your audio…",
    "Starting the final review…",
    "Reviewing your finished result…",
    "Recording result review findings…",
    "Full video ready",
    "Preparing viewing copies…",
    "Viewing copies checked",
  ]);
  expect(items.every((item) => item.repetitions === undefined)).toBe(true);
  expect(items.map((item) => item.text).join(" ")).not.toMatch(/\d+%/);
  const html = renderToStaticMarkup(<AgentActivity events={events} />);
  expect(html).not.toMatch(
    /private|renderer output|154|720p|Preview ready|Preparing your finished project/,
  );
});

it("keeps rendering passes, jobs and validation outcomes distinct", () => {
  const items = activityItems([
    event(1, "validation", "Checking composition, seekable motion, layout, and contrast"),
    event(2, "validation", "Composition, layout, motion, and contrast checks passed"),
    event(3, "phase", "Rendering the Multiplane shot"),
    event(4, "render_progress", "private first frame"),
    event(5, "render_progress", "private other job", "b"),
    event(6, "validation", "private findings"),
    event(7, "render_progress", "private retry frame"),
    event(8, "preview_ready", "Preview ready"),
    event(9, "preview_ready", "Interactive preview ready"),
  ]);
  expect(items.map((item) => item.text)).toEqual([
    "Checking the design and playback…",
    "Design checks complete",
    "Rendering your video…",
    "Rendering your video…",
    "Checking the design and playback…",
    "Rendering your video…",
    "Preview ready",
    "Interactive preview ready",
  ]);
  expect(items[2].jobId).toBe("a");
  expect(items[3].jobId).toBe("b");
  expect(items.every((item) => item.status === undefined)).toBe(true);
});

it("shows distinct component actions without exposing registry payloads or source", () => {
  for (const [tool, label] of [
    ["search_components", "Exploring visual components…"],
    ["read_component", "Checking a visual component…"],
    ["install_component", "Adding a visual component…"],
  ]) {
    for (const toolName of [`mcp__react_bits__${tool}`, `react_bits: ${tool}`]) {
      expect(customerToolActivity(toolName, "tool", "Preview video planning")).toBe(label);
      const items = activityItems([
        event(1, "tool", "raw source and internal command", "a", { toolName, itemId: "component" }),
      ]);
      expect(items.map((item) => item.text)).toEqual([label]);
    }
  }
});

it("shows technology operations instead of generic production messages", () => {
  for (const [tool, label] of [
    ["inspect_technologies", "Checking tool availability…"],
    ["prepare_technology", "Bundling browser dependencies…"],
    ["prepare_technology_stylesheet", "Bundling stylesheets and assets…"],
    ["read_technology", "Reading tool guidance…"],
  ]) {
    expect(
      customerToolActivity(`mcp__creative_pool__${tool}`, "tool", "full video generation"),
    ).toBe(label);
    expect(
      customerToolActivity(`creative_pool: ${tool}`, "mcp_tool_call", "technical correction"),
    ).toBe(label);
  }
});

it("updates the owning command when installation input arrives and preserves its result", () => {
  const items = activityItems(
    [
      event(1, "tool", "Bash", "a", { itemId: "install", toolName: "Bash" }),
      event(2, "tool_result", "Done", "a", {
        results: [{ itemId: "install", failed: false, output: "Done" }],
      }),
      event(3, "tool", "Bash", "a", {
        itemId: "install",
        toolName: "Bash",
        activity: "dependencies",
      }),
    ],
    false,
  );
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ text: "Installing project dependencies…", status: "complete" });
});

it("keeps bundling failures and unknown commands distinct", () => {
  const items = activityItems(
    [
      event(1, "command_execution", "private command", "a", {
        itemId: "bundle",
        activity: "bundling",
      }),
      event(2, "tool_result", "Failed", "a", {
        results: [{ itemId: "bundle", failed: true, output: "Failed" }],
      }),
      event(3, "command_execution", "unknown script", "a", { itemId: "unknown" }),
    ],
    false,
  );
  expect(items[0]).toMatchObject({ text: "Bundling project assets…", status: "failed" });
  expect(items[1].text).toBe("Working on your project…");
});

it("does not show a failed Codex installation as complete", () => {
  const items = activityItems([
    event(1, "command_execution", "Install failed", "a", {
      itemId: "install",
      state: "item.completed",
      activity: "dependencies",
      failed: true,
    }),
  ]);
  expect(items[0]).toMatchObject({ text: "Installing project dependencies…", status: "failed" });
});

it("uses matching labels and outcomes for equivalent provider operations", () => {
  const make = (type: string, toolName: string, activity?: "reading" | "editing" | "checking") =>
    activityItems([
      event(1, type, toolName, "a", {
        itemId: "work",
        toolName,
        activity,
        state: "item.completed",
        purpose: "full video generation",
      }),
    ])[0];
  expect(make("tool", "Read", "reading").text).toBe(
    make("command_execution", "Terminal", "reading").text,
  );
  expect(make("tool", "Edit", "editing").text).toBe(
    make("file_change", "Edit files", "editing").text,
  );
  for (const tool of ["read_pool_entry", "search_pool", "prepare_technology"])
    expect(make("tool", `mcp__creative_pool__${tool}`).text).toBe(
      make("mcp_tool_call", `creative_pool: ${tool}`).text,
    );
  expect(make("command_execution", "Terminal", "checking")).toMatchObject({
    text: "Checking project code…",
    status: "complete",
  });
});
