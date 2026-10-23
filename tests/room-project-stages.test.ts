import { expect, it } from "vitest";
import {
  RequestSchema,
  type AgentProgressEvent,
  type GenerationJob,
  type Run,
} from "../src/shared/contracts";
import { isRoomActivityLive, roomActivityContexts } from "../src/client/room/project-stages";
import { roomQuestionScope } from "../src/client/room/question-scope";

const job = (
  id: string,
  kind: "preview" | "full",
  phase: GenerationJob["phase"],
): GenerationJob => ({
  id,
  runId: "project",
  candidateId: "candidate",
  kind,
  phase,
  duration: kind === "preview" ? 3 : 60,
  workspace: "/tmp/example",
  model: "example",
});
const run = (change: Partial<Run> = {}): Run => ({
  id: "project",
  createdAt: "2026-01-01",
  phase: "generating",
  request: RequestSchema.parse({ instructions: "An original story" }),
  candidates: [{ id: "candidate", displayTitle: "Paper city" } as Run["candidates"][number]],
  jobs: [],
  ...change,
});
const event = (
  id: number,
  change: Partial<AgentProgressEvent> & Pick<AgentProgressEvent, "type" | "message">,
): AgentProgressEvent => ({
  id,
  runId: "project",
  time: `2026-01-01T10:0${id}:00.000Z`,
  data: { audience: "customer" },
  ...change,
});
it("keeps project preparation, each preview and each full film as separate recorded contexts", () => {
  const project = run({
    preparation: {
      fingerprint: "x",
      checkpoints: {
        inputs: { state: "completed", completedAt: "now", output: {} },
        brief: { state: "interrupted", finishedAt: "now", errorCode: "GENERATION_INTERRUPTED" },
      },
    },
    jobs: [
      job("a", "preview", "ready"),
      job("b", "preview", "generating"),
      job("f", "full", "rendering"),
    ],
    inputWaits: [{ checkpoint: "generate", jobId: "b" }],
  });
  const contexts = roomActivityContexts(project, [
    event(1, { type: "input", message: "Reading your brief" }),
    event(2, { type: "render_progress", jobId: "f", message: "Rendering frames" }),
    event(3, { type: "input", jobId: "gone", message: "Old work" }),
  ]);
  expect(contexts.map((context) => [context.label, context.status])).toEqual([
    ["Project preparation", "success"],
    ["Preview · Paper city", "success"],
    ["Preview · Paper city", undefined],
    ["Full film · Paper city · version 1", "loading"],
    ["Earlier generation", "success"],
  ]);
  expect(contexts[0].checkpoints.map((step) => [step.title, step.status])).toEqual([
    ["Reference material", "success"],
    ["Brief", "abort"],
  ]);
  expect(contexts[2].summary).toBe("Waiting for your decision");
  expect(contexts[3].items.map((item) => item.jobId)).toEqual(["f"]);
  expect(contexts[0].items.every((item) => !item.jobId)).toBe(true);
  expect(JSON.stringify(contexts)).not.toMatch(/%/);
  expect(isRoomActivityLive(project)).toBe(true);
  expect(isRoomActivityLive(run({ phase: "ready", jobs: [job("a", "preview", "ready")] }))).toBe(
    false,
  );
});
it("shows the latest real step while working and recorded duration once done", () => {
  const working = run({ phase: "preparing" });
  const events = [
    event(1, { type: "input", message: "Reading your brief" }),
    event(3, { type: "ranking", message: "Planning directions" }),
  ];
  const [main] = roomActivityContexts(working, events);
  expect(main.status).toBe("loading");
  expect(main.summary).toBe(main.items.at(-1)!.text);
  const [done] = roomActivityContexts(
    run({ phase: "generating", jobs: [job("a", "preview", "generating")] }),
    events,
  );
  expect(done.status).toBe("success");
  expect(done.summary).toMatch(/^worked for 2m 0s$/);
  expect(roomActivityContexts(run({ phase: "preparing" }), [])[0]).toMatchObject({
    status: "loading",
    summary: "Preparing your project",
  });
});
it("labels question scope as project, preview, or numbered full version", () => {
  const project = run({
    jobs: [job("p", "preview", "ready"), job("f1", "full", "ready"), job("f2", "full", "ready")],
  });
  expect(roomQuestionScope(project)).toBe("Project");
  expect(roomQuestionScope(project, "p")).toBe("Preview · Paper city");
  expect(roomQuestionScope(project, "f2")).toBe("Full film · Paper city · version 2");
  expect(roomQuestionScope(project, "missing")).toBe("Project");
});

const at = (minute: number) => `2026-01-01T10:${String(minute).padStart(2, "0")}:00.000Z`;
const roundJob = (
  id: string,
  kind: "preview" | "full",
  phase: GenerationJob["phase"],
  candidateId: string,
  minute: number,
): GenerationJob => ({ ...job(id, kind, phase), candidateId, createdAt: at(minute) });
const say = (id: number, minute: number, jobId?: string): AgentProgressEvent =>
  event(id, { type: "agent_message", message: `Step ${id}`, jobId, time: at(minute) });
const completed = (minute: number) => ({
  state: "completed" as const,
  completedAt: at(minute),
  output: {},
});
const regenerated = (change: Partial<Run> = {}) =>
  run({
    createdAt: at(0),
    directionRound: 1,
    candidates: [
      { id: "candidate", displayTitle: "Paper city" },
      { id: "round-1-candidate", displayTitle: "Glass tide" },
    ] as Run["candidates"],
    preparation: {
      fingerprint: "x",
      checkpoints: { inputs: completed(1), proposals: completed(31), selection: completed(32) },
    },
    jobs: [
      roundJob("p0", "preview", "ready", "candidate", 5),
      roundJob("f0", "full", "ready", "candidate", 10),
      roundJob("p1", "preview", "generating", "round-1-candidate", 33),
    ],
    ...change,
  });
const originalEvents = [say(1, 1), say(2, 2), say(3, 5, "p0"), say(4, 8), say(5, 10, "f0")];
const regenerationEvents = [say(6, 30), say(7, 31), say(8, 33, "p1")];
const labels = (contexts: ReturnType<typeof roomActivityContexts>) =>
  contexts.map((context) => [context.key, context.label, context.status]);

it("keeps direction rounds on previews and only version numbers on full films", () => {
  const project = regenerated();
  project.jobs.push(
    roundJob("f1", "full", "ready", "round-1-candidate", 34),
    roundJob("f2", "full", "generating", "round-1-candidate", 35),
  );
  const contexts = roomActivityContexts(project, [...originalEvents, ...regenerationEvents]);
  expect(contexts.find((context) => context.key === "p1")?.label).toBe(
    "Preview · Glass tide · round 2",
  );
  expect(contexts.find((context) => context.key === "f1")?.label).toBe(
    "Full film · Glass tide · version 1",
  );
  expect(contexts.find((context) => context.key === "f2")?.label).toBe(
    "Full film · Glass tide · version 2",
  );
});

it("appends a regeneration after the original preparation, previews and full films", () => {
  const contexts = roomActivityContexts(regenerated(), [...originalEvents, ...regenerationEvents]);
  expect(labels(contexts)).toEqual([
    ["main", "Project preparation", "success"],
    ["p0", "Preview · Paper city", "success"],
    ["f0", "Full film · Paper city · version 1", "success"],
    ["main:round-1", "New directions · round 2", "success"],
    ["p1", "Preview · Glass tide · round 2", "loading"],
  ]);
  expect(contexts[0].items.map((item) => item.id)).toEqual([1, 2, 4]);
  expect(contexts[3].items.map((item) => item.id)).toEqual([6, 7]);
  expect(contexts[0].checkpoints.map((step) => step.key)).toEqual(["inputs"]);
  expect(contexts[3].checkpoints.map((step) => step.key)).toEqual(["proposals", "selection"]);
});

it("keeps finished rounds finished while the new round prepares or waits for a project question", () => {
  const preparing = regenerated({
    phase: "ranking",
    jobs: regenerated().jobs.slice(0, 2),
    candidates: regenerated().candidates.slice(0, 1),
    preparation: { fingerprint: "x", checkpoints: { inputs: completed(1) } },
  });
  const events = [
    ...originalEvents,
    say(6, 30),
    event(7, { type: "ranking", message: "Planning", time: at(31) }),
  ];
  const contexts = roomActivityContexts(preparing, events);
  expect(labels(contexts).map(([, , status]) => status)).toEqual([
    "success",
    "success",
    "success",
    "loading",
  ]);
  expect(contexts[3].summary).toBe("Finding visual Motion Graphics for your idea…");
  const waiting = roomActivityContexts(
    { ...preparing, phase: "ready", inputWaits: [{ checkpoint: "generate" }] },
    events,
  );
  expect(waiting[0]).toMatchObject({
    status: "success",
    summary: expect.not.stringMatching(/decision/),
  });
  expect(waiting[3]).toMatchObject({ status: undefined, summary: "Waiting for your decision" });
});

it("separates several recorded rounds and restores the steps each round replaced", () => {
  const project = regenerated({
    directionRound: 2,
    candidates: [
      { id: "candidate", displayTitle: "Paper city" },
      { id: "round-2-candidate", displayTitle: "Night bus" },
    ] as Run["candidates"],
    directionRounds: [
      {
        round: 1,
        startedAt: at(30),
        afterEventId: 5,
        replacedCheckpoints: { proposals: completed(3) },
      },
      {
        round: 2,
        startedAt: at(40),
        afterEventId: 7,
        replacedCheckpoints: {
          proposals: { state: "failed", finishedAt: at(31), errorCode: "VIDEO_GENERATION_FAILED" },
        },
      },
    ],
    jobs: [
      ...regenerated().jobs.slice(0, 2),
      roundJob("p2", "preview", "ready", "round-2-candidate", 42),
    ],
    phase: "ready",
  });
  const contexts = roomActivityContexts(project, [
    ...originalEvents,
    say(6, 30),
    say(7, 31),
    say(8, 40),
    say(9, 42, "p2"),
  ]);
  expect(labels(contexts)).toEqual([
    ["main", "Project preparation", "success"],
    ["p0", "Preview · Paper city", "success"],
    ["f0", "Full film · Paper city · version 1", "success"],
    ["main:round-1", "New directions · round 2", "error"],
    ["main:round-2", "New directions · round 3", "success"],
    ["p2", "Preview · Night bus · round 3", "success"],
  ]);
  expect(contexts[0].checkpoints.map((step) => [step.key, step.status])).toEqual([
    ["inputs", "success"],
    ["proposals", "success"],
  ]);
  expect(contexts[3].checkpoints.map((step) => [step.key, step.status])).toEqual([
    ["proposals", "error"],
  ]);
  expect(contexts[3].summary).toMatch(/^Replaced by new directions/);
  expect(contexts[4].items.map((item) => item.id)).toEqual([8]);
  const late = roomActivityContexts(
    {
      ...project,
      directionRounds: [{ ...project.directionRounds![0], afterEventId: 6 }],
      directionRound: 1,
    },
    [...originalEvents, say(6, 25), say(7, 30)],
  );
  expect(late[0].items.map((item) => item.id)).toEqual([1, 2, 4, 6]);
  expect(
    late.find((context) => context.key === "main:round-1")!.items.map((item) => item.id),
  ).toEqual([7]);
});

it("keeps keys and order stable as events arrive, replay or reconnect out of order", () => {
  const before = roomActivityContexts(regenerated(), originalEvents);
  const after = roomActivityContexts(regenerated(), [
    ...[...regenerationEvents].reverse(),
    ...originalEvents,
    ...originalEvents,
    ...regenerationEvents,
  ]);
  expect(after.slice(0, before.length).map((context) => context.key)).toEqual(
    before.map((context) => context.key),
  );
  expect(after.map((context) => context.key)).toEqual(["main", "p0", "f0", "main:round-1", "p1"]);
  const ids = after.flatMap((context) => context.items.map((item) => item.id));
  expect(ids).toEqual([...new Set(ids)]);
  expect(after[0].items.map((item) => item.id)).toEqual([1, 2, 4]);
});

it("orders groups that share one timestamp by round, preparation first, then job order", () => {
  const same = (id: number, jobId?: string) => ({ ...say(id, 0, jobId), time: at(0) });
  const project = regenerated({
    jobs: regenerated().jobs.map((item) => ({ ...item, createdAt: at(0) })),
    directionRounds: [{ round: 1, startedAt: at(0), afterEventId: 4, replacedCheckpoints: {} }],
  });
  const contexts = roomActivityContexts(project, [
    same(1),
    same(2, "p0"),
    same(3, "f0"),
    same(4),
    same(5),
    same(6, "p1"),
  ]);
  expect(contexts.map((context) => context.key)).toEqual([
    "main",
    "p0",
    "f0",
    "main:round-1",
    "p1",
  ]);
  expect(contexts[3].items.map((item) => item.id)).toEqual([5]);
});

it("does not invent a regeneration round without stored evidence for it", () => {
  const project = run({ phase: "ready", directionRound: 1, jobs: [] });
  const contexts = roomActivityContexts(project, [say(1, 1), say(2, 30)]);
  expect(contexts.map((context) => context.key)).toEqual(["main"]);
  expect(contexts[0].items.map((item) => item.id)).toEqual([1, 2]);
});
