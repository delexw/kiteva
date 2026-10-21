import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RequestSchema,
  type Run,
  type AgentProgressEvent,
  type GenerationJob,
} from "../src/shared/contracts";
import {
  projectConversationEntries,
  projectActivityTarget,
} from "../src/client/project-conversation-model";
import { GenerationActivity } from "../src/client/agent-activity";
import { ProjectConversation } from "../src/client/components/project-conversation";
const timestamp = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
const preview: GenerationJob = {
  id: "preview-1",
  runId: "example",
  candidateId: "candidate-1",
  kind: "preview",
  phase: "ready",
  workspace: "/tmp/example",
  model: "example-model",
  duration: 3,
  startedAt: timestamp(10),
  finishedAt: timestamp(30),
};
const full: GenerationJob = {
  ...preview,
  id: "full-1",
  kind: "full",
  duration: 15,
  startedAt: timestamp(40),
  finishedAt: timestamp(60),
};
const run: Run = {
  id: "example",
  createdAt: timestamp(0),
  request: RequestSchema.parse({ instructions: "Explain a connected idea" }),
  phase: "ready",
  candidates: [],
  jobs: [preview, full],
};
const events: AgentProgressEvent[] = [
  {
    id: 1,
    runId: run.id,
    type: "agent_message",
    data: { audience: "customer" },
    message: "Creating a clear story.",
    time: timestamp(5),
  },
  {
    id: 2,
    runId: run.id,
    jobId: preview.id,
    type: "agent_message",
    data: { audience: "customer" },
    message: "Arranging the shapes.",
    time: timestamp(20),
  },
  {
    id: 3,
    runId: run.id,
    jobId: full.id,
    type: "agent_message",
    data: { audience: "customer" },
    message: "Adding the final details.",
    time: timestamp(50),
  },
];
it("uses a stable full card and routes both preview and full logs inside their cards", () => {
  expect(projectConversationEntries(run, events).map((entry) => entry.kind)).toEqual([
    "brief",
    "activity",
    "selection",
    "full",
  ]);
  expect(
    projectActivityTarget(
      run,
      {
        id: 1,
        scope: "example:full-1",
        kind: "notice",
        text: "Check",
        time: timestamp(50),
        jobId: full.id,
      },
      () => "Direction",
    ).targetId,
  ).toBe("generation-full-full-1");
});
const render = (project: Run, progress = events) =>
  renderToStaticMarkup(
    <ProjectConversation
      onRunUpdated={() => {}}
      run={project}
      events={progress}
      now={0}
      titleFor={(job) => job.id}
      controls={null}
      renderPreview={(job, activity) => (
        <article data-preview={job.id}>
          <video src="/preview.mp4" />
          {activity}
          <button>Choose direction</button>
        </article>
      )}
      renderFull={(job, activity) => (
        <article data-full={job.id}>
          <video src="/full.mp4" />
          {activity}
        </article>
      )}
      onCancel={() => {}}
    />,
  );
it("replaces full progress with the finished card in the same timeline slot", () => {
  const pending = { ...full, phase: "generating" as const, finishedAt: undefined };
  const active = render({ ...run, jobs: [preview, pending] });
  expect(active).toContain("generation-full-full-1");
  expect(active).toContain("Building your full video");
  expect(active).toContain("Adding the final details");
  expect(active).toContain("Full video activity");
  expect(active).toContain("Cancel</span>");
  const finished = render(run);
  expect(finished).toContain("generation-full-full-1");
  expect(finished.match(/data-full="full-1"/g)).toHaveLength(1);
  expect(finished).not.toContain("Completed · result below");
  expect(finished).toContain("Your finished video");
  expect(finished).toContain("Adding the final details");
  expect(projectConversationEntries(run, events).find((entry) => entry.kind === "full")?.id).toBe(
    projectConversationEntries({ ...run, jobs: [preview, pending] }, events).find(
      (entry) => entry.kind === "full",
    )?.id,
  );
});
it("keeps previews solely in the side panel after starting a full build", () => {
  const second = { ...preview, id: "preview-2", candidateId: "candidate-2" };
  const html = render({ ...run, jobs: [preview, second, full] });
  const main = html.slice(html.indexOf('aria-label="Project activity"'), html.indexOf("<aside"));
  expect(main).not.toContain("data-preview");
  expect(main).not.toContain("Choose another direction");
  expect(html.match(/data-preview="preview-1"/g)).toHaveLength(1);
  expect(html.match(/data-preview="preview-2"/g)).toHaveLength(1);
  expect(html).toContain('<aside class="project-preview-panel"');
  expect(html).toContain("Arranging the shapes");
  expect(html).not.toContain("All directions built");
});
it("retains failed full attempts and a separate card for retries without repeating previews", () => {
  const retry = {
    ...full,
    id: "full-2",
    phase: "generating" as const,
    startedAt: timestamp(70),
    finishedAt: undefined,
  };
  const project = { ...run, jobs: [preview, { ...full, phase: "failed" as const }, retry] };
  expect(
    projectConversationEntries(project, events).filter((entry) => entry.kind === "full"),
  ).toHaveLength(2);
  expect(render(project)).toContain("Build needs attention");
  expect(render(project).match(/data-preview="preview-1"/g)).toHaveLength(1);
});
it("keeps the original preview workflow before any full build starts", () => {
  const pending = {
    ...preview,
    id: "preview-2",
    phase: "generating" as const,
    finishedAt: undefined,
  };
  const project = { ...run, jobs: [preview, pending] };
  expect(
    projectConversationEntries(project, events).filter((entry) => entry.kind === "previews"),
  ).toHaveLength(1);
  const html = render(project);
  expect(html).toContain("Creating your previews");
  expect(html).toContain("generation-preview-preview-2");
  expect(html).not.toContain("project-preview-panel");
  expect(html).toContain("Cancel</span>");
});
it("isolates and merges consecutive updates within each full job", () => {
  const progress = [1, 2, 3].map((id): AgentProgressEvent => ({
    id,
    runId: run.id,
    jobId: full.id,
    type: "tool",
    message: "Bash",
    time: timestamp(40 + id),
    data: { itemId: `tool-${id}`, state: "item.completed" },
  }));
  const html = render(
    { ...run, jobs: [preview, { ...full, phase: "generating", finishedAt: undefined }] },
    progress,
  );
  expect(html).not.toContain("3 updates");
  expect(html.match(/Working on your project/g)).toHaveLength(1);
});
it("does not expose internal narration or cross-job messages in a generation log", () => {
  const scoped = [
    ...events,
    {
      ...events[2]!,
      id: 9,
      data: { audience: "internal" },
      message: "Private implementation details",
    },
  ];
  const html = renderToStaticMarkup(
    <GenerationActivity
      events={scoped}
      jobId={full.id}
      title="Direction"
      label="Full video"
      completed={false}
    />,
  );
  expect(html).toContain("Adding the final details");
  expect(html).not.toContain("Arranging the shapes");
  expect(html).not.toContain("Private implementation details");
});
it("announces all directions built in the panel only when every preview has a successful full version", () => {
  expect(render(run)).toContain("All directions built");
  const pending = { ...preview, id: "preview-2", candidateId: "candidate-2" };
  expect(render({ ...run, jobs: [...run.jobs, pending] })).not.toContain("All directions built");
});

it("shows the complete saved brief with separate requirement prompts and source URLs", () => {
  const request = RequestSchema.parse({
    instructions: "The main story prompt.",
    requirements: {
      main: { instructions: "Additional main constraints", assetIds: [] },
      music: { instructions: "Driving instrumental music\nNo vocals", assetIds: [] },
      images: { instructions: "Preserve readable product text", assetIds: [] },
      urls: { instructions: "Capture the editor view" },
    },
    urls: ["https://example.com/product"],
  });
  const html = render({ ...run, request });
  for (const text of [
    request.instructions,
    request.requirements!.main.instructions,
    request.requirements!.music.instructions,
    request.requirements!.images.instructions,
    request.requirements!.urls.instructions,
    request.urls[0],
  ])
    expect(html).toContain(text);
  expect(html).toContain("Music / instrumental requirements");
  expect(html).toContain("Image requirements");
  expect(html).toContain("URL requirements");
});
it("keeps legacy main prompts and omits empty optional requirements", () => {
  const html = render({
    ...run,
    request: RequestSchema.parse({ instructions: "Original standalone prompt" }),
  });
  expect(html).toContain("Original standalone prompt");
  expect(html).not.toContain("Music / instrumental requirements");
  expect(html).not.toContain("Website URLs");
});

it("collapses adjacent progress into stable groups without hiding customer messages or merging different steps", () => {
  const progress: AgentProgressEvent[] = [
    {
      id: 11,
      runId: run.id,
      type: "tool",
      message: "Read",
      data: { itemId: "read-1", toolName: "Read" },
      time: timestamp(1),
    },
    {
      id: 12,
      runId: run.id,
      type: "tool",
      message: "Read",
      data: { itemId: "read-2", toolName: "Read" },
      time: timestamp(2),
    },
    {
      id: 13,
      runId: run.id,
      type: "tool",
      message: "StructuredOutput",
      data: { itemId: "output", toolName: "StructuredOutput" },
      time: timestamp(3),
    },
    {
      id: 14,
      runId: run.id,
      type: "agent_message",
      data: { audience: "customer" },
      message: "Your brief is ready.",
      time: timestamp(4),
    },
    {
      id: 15,
      runId: run.id,
      type: "tool",
      message: "Read",
      data: { itemId: "read-3", toolName: "Read" },
      time: timestamp(5),
    },
  ];
  const project = { ...run, jobs: [] };
  const entries = projectConversationEntries(project, progress);
  expect(entries.map((entry) => entry.kind)).toEqual(["brief", "progress", "activity", "progress"]);
  const first = entries[1];
  if (first.kind !== "progress") throw Error("Expected progress group");
  // The project is finished but these tools have no result events. Preserve their
  // individual stopped outcomes rather than merging them into a successful step.
  expect(first.items).toHaveLength(3);
  expect(first.items.every((item) => item.status === "stopped")).toBe(true);
  expect(first.items[0].text).not.toBe(first.items[2].text);
  const html = render(project, progress);
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Your brief is ready.");
  expect(html).not.toContain("Reading project content");
  expect(html).not.toContain("3 updates");
  const additional = {
    id: 16,
    runId: run.id,
    type: "tool",
    message: "Grep",
    data: { itemId: "read-4", toolName: "Grep" },
    time: timestamp(6),
  };
  expect(projectConversationEntries(project, [...progress, additional])[3].id).toBe(entries[3].id);
});

it("places selected settings below the conversation heading and before the activity", () => {
  const html = render(run);
  expect(html.indexOf("Project conversation</h2>")).toBeLessThan(
    html.indexOf('aria-label="Selected project settings"'),
  );
  expect(html.indexOf('aria-label="Selected project settings"')).toBeLessThan(
    html.indexOf('aria-label="Project activity"'),
  );
  expect(html).not.toContain('aria-label="Result summary"');
});

it("places follow-up questions inside the corresponding preview and full-result containers", () => {
  const base = {
    kind: "reference" as const,
    reason: "Renderer unavailable",
    fallback: "Use code",
    state: "open" as const,
  };
  const html = render({
    ...run,
    jobs: [preview, full],
    assetQuestions: [
      { ...base, id: "preview-question", jobId: preview.id, question: "Preview-specific question" },
      { ...base, id: "full-question", jobId: full.id, question: "Full-specific question" },
    ],
  });
  const previewStart = html.indexOf(`id="generation-preview-${preview.id}"`);
  const fullStart = html.indexOf(`id="generation-full-${full.id}"`);
  expect(previewStart).toBeGreaterThan(-1);
  expect(fullStart).toBeGreaterThan(-1);
  expect(html.slice(fullStart)).toContain("Full-specific question");
  expect(html.slice(previewStart)).toContain("Preview-specific question");
  expect(html).not.toContain("Main progress questions");
  expect(html.match(/Preview-specific question/g)).toHaveLength(1);
  expect(html.match(/Full-specific question/g)).toHaveLength(1);
});

it("places main progress questions after the original brief and before preparation activity", () => {
  const html = render({
    ...run,
    assetQuestions: [
      {
        id: "main-question",
        kind: "reference",
        reason: "Missing reference",
        fallback: "Use code",
        state: "open",
        question: "Main project question",
      },
    ],
  });
  expect(html.indexOf("Main prompt</h3>")).toBeGreaterThan(-1);
  expect(html.indexOf("Main progress questions")).toBeGreaterThan(
    html.indexOf("Explain a connected idea"),
  );
  expect(html.indexOf("Main project question")).toBeLessThan(
    html.indexOf("Creating a clear story"),
  );
});
