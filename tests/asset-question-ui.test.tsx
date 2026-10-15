import { renderToStaticMarkup } from "react-dom/server";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { expect, it } from "vitest";
import { AssetQuestionCard, AssetQuestions } from "../src/client/components/asset-questions";
it("offers an upload, a reply and a nonblocking alternative using AI Elements", () => {
  const html = renderToStaticMarkup(
    <AssetQuestionCard
      question={{
        id: "question",
        kind: "voice",
        reason: "No speech tool is installed",
        question: "Provide a voice recording or continue with captions?",
        fallback: "Continue with captions",
        state: "open",
      }}
      onAnswer={async () => {}}
    />,
  );
  expect(html).toContain("Provide a voice recording");
  expect(html).toContain("Work continues while you decide");
  expect(html).toContain("Attach reference");
  expect(html).toContain("Continue with alternative");
  expect(html).toContain('accept=".wav,.mp3,.m4a"');
});

it("shows all pending questions inline without a popup and hides answered questions", () => {
  const question = {
    id: "first",
    kind: "voice" as const,
    question: "Upload voice?",
    reason: "Speech tools unavailable",
    fallback: "Use captions",
    state: "open" as const,
  };
  const html = renderToStaticMarkup(
    <AssetQuestions
      run={{
        id: "test",
        phase: "preparing",
        createdAt: "now",
        request: RequestSchema.parse({ instructions: "A generic video" }),
        candidates: [],
        jobs: [],
        assetQuestions: [
          question,
          { ...question, id: "second", question: "Upload audio?" },
          { ...question, id: "answered", question: "Already answered", state: "answered" },
        ],
      }}
      onUpdated={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Project questions"');
  expect(html).toContain("Upload voice?");
  expect(html).toContain("Upload audio?");
  expect(html).not.toContain("Already answered");
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain("A quick question");
});

it("renders questions only in their main, preview or full result scope", () => {
  const question = {
    kind: "reference" as const,
    reason: "Tool unavailable",
    fallback: "Use code",
    state: "open" as const,
  };
  const run: Run = {
    id: "scoped",
    phase: "preparing" as const,
    createdAt: "now",
    request: RequestSchema.parse({ instructions: "An original story" }),
    candidates: [],
    jobs: [],
    assetQuestions: [
      { ...question, id: "main", question: "Main question" },
      { ...question, id: "a", jobId: "preview-a", question: "Preview A question" },
      { ...question, id: "b", jobId: "preview-b", question: "Preview B question" },
      { ...question, id: "full", jobId: "full-a", question: "Full result question" },
    ],
  };
  for (const [jobId, text] of [
    [undefined, "Main question"],
    ["preview-a", "Preview A question"],
    ["preview-b", "Preview B question"],
    ["full-a", "Full result question"],
  ] as const) {
    const html = renderToStaticMarkup(
      <AssetQuestions run={run} jobId={jobId} onUpdated={() => {}} />,
    );
    expect(html).toContain(text);
    for (const other of run.assetQuestions!.filter((q) => q.jobId !== jobId))
      expect(html).not.toContain(other.question);
  }
});
