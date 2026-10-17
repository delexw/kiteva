import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestSchema, type GenerationJob, type Run } from "../src/shared/contracts";
import {
  RoomActivity,
  RoomActivityNow,
  RoomActivityTab,
  roomActivityStep,
} from "../src/client/room/room-activity";

const job: GenerationJob = {
  id: "preview",
  runId: "project",
  candidateId: "candidate",
  kind: "preview",
  phase: "generating",
  duration: 3,
  workspace: "/tmp/example",
  model: "example",
};
const run: Run = {
  id: "project",
  createdAt: "2026-01-01",
  phase: "generating",
  request: RequestSchema.parse({ instructions: "An original story" }),
  candidates: [{ id: "candidate", displayTitle: "Paper city" } as Run["candidates"][number]],
  jobs: [job],
};

const events = [
  { id: 1, runId: "project", type: "input", time: "2026-01-01T10:00:00Z", message: "" },
  {
    id: 2,
    runId: "project",
    jobId: "preview",
    type: "render_progress",
    time: "2026-01-01T10:01:00Z",
    message: "",
  },
];

it("shows an explicit neutral icon for updates without inventing a successful outcome", () => {
  const base = {
    id: 1,
    scope: "project",
    kind: "notice" as const,
    text: "Rendering your video…",
    time: "2026-01-01T10:00:00Z",
  };
  const update = roomActivityStep(base);
  expect(update.status).toBeUndefined();
  expect(renderToStaticMarkup(<>{update.icon}</>)).toContain('aria-label="Progress update"');
  for (const [status, expected] of [
    ["complete", "success"],
    ["failed", "error"],
    ["running", "loading"],
    ["stopped", "abort"],
  ] as const) {
    const step = roomActivityStep({ ...base, status });
    expect(step.status).toBe(expected);
    expect(step.icon).toBeUndefined();
  }
});

it("keeps live work to one line above the tabs, with the crew on set", () => {
  const html = renderToStaticMarkup(
    <RoomActivityNow run={run} events={events} onOpen={() => {}} />,
  );
  expect(html).toContain('role="status"');
  expect(html).toContain("manga-crew-director");
  expect(html).toContain("Preview · Paper city");
  expect(html).toContain("Rendering your video…");
  expect(html).toMatch(/<button[^>]*>.*See activity/);
  expect(
    renderToStaticMarkup(
      <RoomActivityNow
        run={{ ...run, phase: "ready", jobs: [{ ...job, phase: "ready" }] }}
        events={events}
        onOpen={() => {}}
      />,
    ),
  ).toBe("");
});

it("lists every context as a keyboard-openable line with status and time, steps folded away", () => {
  const html = renderToStaticMarkup(<RoomActivity run={run} events={events} />);
  expect(html).toContain("Project preparation");
  expect(html).toContain("Preview · Paper city");
  expect(html.match(/role="button"[^>]*aria-expanded="false"/g)).toHaveLength(2);
  expect(html.match(/tabindex="0"/g)?.length).toBeGreaterThanOrEqual(2);
  expect(html).toContain('aria-label="Working"');
  expect(html).toContain('aria-label="Done"');
  expect(html).toContain('dateTime="2026-01-01T10:01:00Z"');
  expect(html).not.toContain("Reading your reference material…");
});

it("says where activity will appear before anything has been recorded", () => {
  expect(renderToStaticMarkup(<RoomActivity run={{ ...run, jobs: [] }} events={[]} />)).toContain(
    "Activity appears here",
  );
});

it("marks the activity tab while working and clears it after work ends", () => {
  expect(renderToStaticMarkup(<RoomActivityTab run={run} />)).toContain("Working");
  for (const phase of ["ready", "failed", "cancelled", "interrupted"] as const) {
    const html = renderToStaticMarkup(
      <RoomActivityTab run={{ ...run, phase, jobs: [{ ...job, phase }] }} />,
    );
    expect(html).toContain("Activity");
    expect(html).not.toContain("Working");
  }
});

it("shows preparation immediately before any event or checkpoint arrives", () => {
  const preparing = { ...run, phase: "preparing" as const, jobs: [] };
  expect(renderToStaticMarkup(<RoomActivity run={preparing} events={[]} />)).toContain(
    "Preparing your project",
  );
  expect(
    renderToStaticMarkup(<RoomActivityNow run={preparing} events={[]} onOpen={() => {}} />),
  ).toContain('role="status"');
});
