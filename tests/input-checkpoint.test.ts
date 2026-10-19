vi.mock("../src/server/agents/authoring-resources", () => ({
  selectAuthoringResources: async () => ({
    source: "jev",
    model: "jev-test",
    selectedIds: ["local_code"],
    decisions: [],
  }),
}));
import { expect, it, vi } from "vitest";
import { Workflow } from "../src/server/jobs/workflow";
import { Store } from "../src/server/jobs/store";
import { loadCatalog } from "../src/server/catalog/catalog";
import { RequestSchema, type Run, type GenerationJob } from "../src/shared/contracts";
import { blockingQuestions, InputRequired } from "../src/shared/input-checkpoint";
import {
  initializePreparation,
  preparationRequest,
} from "../src/server/jobs/preparation-checkpoints";
function fixture(): Run {
  return {
    id: "project",
    createdAt: "2026-01-01",
    phase: "generating",
    request: RequestSchema.parse({ instructions: "An original story" }),
    candidates: [],
    jobs: [
      {
        id: "preview",
        candidateId: "candidate",
        kind: "preview",
        duration: 3,
        runId: "project",
        phase: "queued",
        workspace: "/tmp/example",
        model: "example",
      },
    ],
    assetQuestions: [
      {
        id: "question",
        jobId: "preview",
        state: "open",
        mode: "blocking",
        kind: "reference",
        cause: "tool-capability",
        reason: "Required renderer unavailable",
        question: "Use an approximation?",
        fallback: "Use available rendering",
      },
    ],
  };
}
it("scopes blocking questions without treating legacy optional questions as blockers", () => {
  const run = fixture();
  expect(blockingQuestions(run)).toHaveLength(0);
  expect(blockingQuestions(run, run.jobs[0])).toHaveLength(1);
  run.assetQuestions![0].mode = undefined;
  expect(blockingQuestions(run, run.jobs[0])).toHaveLength(0);
  run.assetQuestions![0].mode = "blocking";
  run.assetQuestions![0].jobId = undefined;
  expect(blockingQuestions(run)).toHaveLength(1);
  expect(blockingQuestions(run, run.jobs[0])).toHaveLength(1);
});
it("pauses a job before taking a worker slot, preserves its checkpoint through recovery, and resumes only once", async () => {
  const store = new Store(":memory:");
  const run = fixture();
  const workflow = new Workflow(store, await loadCatalog());
  await workflow.generate(run, run.jobs[0]);
  expect(run.inputWaits).toEqual([
    { checkpoint: "generate", jobId: "preview", questionIds: ["question"] },
  ]);
  expect(workflow.hasActiveTasks(run)).toBe(false);
  store.recover();
  expect(store.get(run.id)?.jobs[0].phase).toBe("queued");
  let finish!: () => void;
  const generate = vi.spyOn(workflow, "generate").mockImplementation(async (_run, job) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    job.phase = "ready";
  });
  workflow.answerAssetQuestion(run, "question", { answer: "Proceed", assetIds: [] });
  workflow.answerAssetQuestion(run, "question", { answer: "Proceed again", assetIds: [] });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(run.inputWaits).toEqual([]);
  finish();
  await vi.waitFor(() => expect(run.phase).toBe("ready"));
  store.close();
});
it("a blocking project decision gates jobs but does not block unrelated projects", async () => {
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run = fixture();
  run.assetQuestions![0].jobId = undefined;
  expect(() => workflow["inputCheckpoint"](run)).toThrow(InputRequired);
  expect(run.inputWaits).toEqual([{ checkpoint: "prepare", questionIds: ["question"] }]);
  const other = fixture();
  other.id = "other";
  other.assetQuestions = [];
  expect(() => workflow["inputCheckpoint"](other, other.jobs[0])).not.toThrow();
  workflow.cancel(run);
  expect(run.inputWaits).toEqual([]);
  expect(() => workflow.answerAssetQuestion(run, "question", { answer: "Continue" })).toThrow(
    "cancelled",
  );
  store.close();
});
it("retains generated output when pausing at a post-generation checkpoint", async () => {
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run = fixture();
  run.jobs[0].phase = "validating";
  const production = { renderer: "hyperframes" } as unknown as NonNullable<
    Extract<GenerationJob, { duration: number }>["production"]
  >;
  if (run.jobs[0].outputType !== "page") run.jobs[0].production = production;
  expect(() => workflow["inputCheckpoint"](run, run.jobs[0])).toThrow(InputRequired);
  expect(store.get(run.id)?.jobs[0]).toHaveProperty("production", production);
  store.close();
});
it("recovers only the waiting job and interrupts other unfinished work after a restart", () => {
  const store = new Store(":memory:");
  const run = fixture();
  run.jobs.push({ ...run.jobs[0], id: "other", phase: "generating" });
  run.inputWaits = [{ checkpoint: "prepare" }, { checkpoint: "generate", jobId: "preview" }];
  store.save(run);
  store.recover();
  const recovered = store.get(run.id)!;
  expect(recovered.jobs.map((job) => job.phase)).toEqual(["queued", "interrupted"]);
  expect(recovered.phase).toBe("generating");
  store.close();
});
it("resumes a waiting job with the decisions it was waiting for", async () => {
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run = fixture();
  run.assetQuestions!.push({
    ...run.assetQuestions![0],
    id: "earlier",
    state: "answered",
    answer: "An earlier choice",
  });
  await workflow.generate(run, run.jobs[0]);
  expect(run.inputWaits?.[0].questionIds).toEqual(["question"]);
  const generate = vi.spyOn(workflow, "generate").mockResolvedValue();
  workflow.answerAssetQuestion(run, "question", { answer: "Use the approximation", assetIds: [] });
  const decisions = generate.mock.calls[0][3]!;
  expect(decisions).toContain("Use the approximation");
  expect(decisions).not.toContain("An earlier choice");
  await vi.waitFor(() => expect(run.phase).toBe("queued"));
  store.close();
});
it("never pauses finished work and ignores a duplicate start for a running job", async () => {
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run = fixture();
  run.jobs[0].phase = "ready";
  expect(() => workflow["inputCheckpoint"](run, run.jobs[0])).not.toThrow();
  run.jobs[0].phase = "queued";
  workflow["controllers"].set("preview", new AbortController());
  await workflow.generate(run, run.jobs[0]);
  expect(run.inputWaits).toBeUndefined();
  store.close();
});
it("settles the project when a waiting job is cancelled, and that job cannot be resumed", async () => {
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run = fixture();
  run.jobs.push({ ...run.jobs[0], id: "done", candidateId: "other", phase: "ready" });
  await workflow.generate(run, run.jobs[0]);
  workflow.cancel(run, "preview");
  expect(run.inputWaits).toEqual([]);
  expect(run.phase).toBe("ready");
  expect(() => workflow.answerAssetQuestion(run, "question", { answer: "Go" })).toThrow(
    "cancelled",
  );
  store.close();
});
it("keeps the completed brief when a project answer adds a new material", async () => {
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  const run = fixture();
  run.assetQuestions![0].jobId = undefined;
  run.assetQuestions![0].kind = "images";
  store.asset({
    id: "6f1c3a52-6a0b-4a51-9a39-1f6ad3f0c0a1",
    name: "logo.png",
    originalName: "logo.png",
    path: "/tmp/logo.png",
    kind: "image/png",
    bytes: 1000,
  });
  initializePreparation(run, preparationRequest(run));
  run.preparation!.checkpoints.brief = { state: "completed", completedAt: "now", output: {} };
  vi.spyOn(workflow, "prepare").mockResolvedValue();
  workflow.answerAssetQuestion(run, "question", {
    answer: "Use my logo",
    assetIds: ["6f1c3a52-6a0b-4a51-9a39-1f6ad3f0c0a1"],
  });
  expect(run.request.assetIds).toEqual(["6f1c3a52-6a0b-4a51-9a39-1f6ad3f0c0a1"]);
  expect(run.request.requirements?.images.assetIds).toEqual([
    "6f1c3a52-6a0b-4a51-9a39-1f6ad3f0c0a1",
  ]);
  expect(preparationRequest(run).assetIds).toEqual([]);
  initializePreparation(run, preparationRequest(run));
  expect(run.preparation!.checkpoints.brief?.state).toBe("completed");
  store.close();
});
