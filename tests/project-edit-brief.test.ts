import { expect, it } from "vitest";
import { projectEditBrief } from "../src/shared/project-edit-brief";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { RoomDraftSchema } from "../src/shared/room";
import { roomEditDraft } from "../src/client/room/onboarding";
import { projectSettingsDraft } from "../src/client/lib/project-settings";

function project(): Run {
  return {
    id: "example",
    createdAt: "2026-01-01",
    phase: "ready",
    request: RequestSchema.parse({ instructions: "Original idea\nPreserve these exact words." }),
    candidates: [],
    jobs: [
      {
        id: "original",
        runId: "example",
        candidateId: "direction",
        kind: "full",
        phase: "ready",
        model: "example",
        workspace: "/unused",
        duration: 20,
      },
      {
        id: "second",
        runId: "example",
        candidateId: "direction",
        kind: "full",
        phase: "failed",
        model: "example",
        workspace: "/unused",
        duration: 20,
        createdAt: "2026-02-01",
        refinementPrompt: "Second displayed revision",
      },
      {
        id: "third",
        runId: "example",
        candidateId: "direction",
        kind: "full",
        phase: "queued",
        model: "example",
        workspace: "/unused",
        duration: 20,
        createdAt: "2026-01-01",
        refinementPrompt: "Third displayed revision",
      },
    ],
    assetQuestions: [
      {
        id: "q1",
        kind: "reference",
        reason: "Clarify",
        question: "First displayed question?",
        fallback: "Use available evidence",
        state: "answered",
        answer: "First displayed answer",
      },
      {
        id: "q2",
        kind: "reference",
        reason: "Clarify",
        question: "Second displayed question?",
        fallback: "Approved alternative",
        state: "answered",
      },
      {
        id: "q3",
        kind: "reference",
        reason: "Clarify",
        question: "Unanswered question?",
        fallback: "Wait",
        state: "open",
      },
    ],
  };
}
it("appends the original idea, answered pairs and fine-tunes in timestamp order", () => {
  const run = project(),
    before = structuredClone(run);
  const result = projectEditBrief(run);
  expect(result.instructions.startsWith(run.request.instructions + "\n\n")).toBe(true);
  const snippets = [
    "First displayed question?",
    "First displayed answer",
    "Second displayed question?",
    "Approved alternative",
    "Third displayed revision",
    "Second displayed revision",
  ];
  expect(snippets.map((text) => result.instructions.indexOf(text))).toEqual(
    snippets.map((text) => result.instructions.indexOf(text)).sort((a, b) => a - b),
  );
  expect(result.instructions).not.toContain("Unanswered question?");
  expect(run).toEqual(before);
  expect(
    projectSettingsDraft({ ...run.request, instructions: result.instructions }).instructions,
  ).toBe(result.instructions);
});
it("orders answered pairs by answer time and preserves fallback display order for older records", () => {
  const run = project();
  run.assetQuestions![0].createdAt = "2026-01-02T00:00:00Z";
  run.assetQuestions![0].answeredAt = "2026-03-01T00:00:00Z";
  const result = projectEditBrief(run).instructions;
  expect(result.indexOf("Second displayed revision")).toBeLessThan(
    result.indexOf("First displayed question?"),
  );
  run.jobs.forEach((job) => {
    job.createdAt = undefined;
  });
  run.assetQuestions!.forEach((question) => {
    question.createdAt = undefined;
    question.answeredAt = undefined;
  });
  const legacy = projectEditBrief(run).instructions;
  expect(legacy.indexOf("First displayed question?")).toBeLessThan(
    legacy.indexOf("Second displayed question?"),
  );
  expect(legacy.indexOf("Second displayed revision")).toBeLessThan(
    legacy.indexOf("Third displayed revision"),
  );
});
it("preserves local edits, avoids duplicates on reopen and inserts new pairs in display order", () => {
  const run = project();
  const draft = roomEditDraft(run, []);
  draft.request.instructions = "Edited introduction\n" + draft.request.instructions;
  const saved = RoomDraftSchema.parse(draft);
  const reopened = roomEditDraft(run, [], saved);
  expect(reopened.request.instructions).toBe(saved.request.instructions);
  run.assetQuestions!.push({
    id: "new",
    kind: "reference",
    reason: "Clarify",
    question: "New displayed question?",
    fallback: "Proceed",
    answer: "New answer",
    state: "answered",
  });
  const updated = roomEditDraft(run, [], reopened);
  const text = String(updated.request.instructions);
  expect(text.startsWith("Edited introduction\n")).toBe(true);
  expect(text.indexOf("New displayed question?")).toBeLessThan(
    text.indexOf("Second displayed revision"),
  );
  expect(text.match(/Second displayed revision/g)).toHaveLength(1);
  expect(roomEditDraft(run, [], updated).request.instructions).toBe(text);
});
it("leaves a project without conversation history unchanged", () => {
  const run = project();
  run.assetQuestions = [];
  run.jobs = [];
  expect(projectEditBrief(run).instructions).toBe(run.request.instructions);
});
it("preserves manual edits inside imported history instead of replacing user text", () => {
  const run = project(),
    draft = roomEditDraft(run, []);
  draft.request.instructions = String(draft.request.instructions).replace(
    "Second displayed revision",
    "My corrected instruction",
  );
  run.jobs.push({ ...run.jobs[2], id: "fourth", refinementPrompt: "Newest revision" });
  const updated = roomEditDraft(run, [], draft);
  expect(updated.request.instructions).toContain("My corrected instruction");
  expect(updated.request.instructions).toContain("Newest revision");
  expect(String(updated.request.instructions).match(/Third displayed revision/g)).toHaveLength(1);
});
