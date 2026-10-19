vi.mock("../src/server/agents/authoring-resources", () => ({
  selectAuthoringResources: async () => ({
    source: "jev",
    model: "jev-test",
    selectedIds: ["local_code"],
    decisions: [],
  }),
}));
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it, vi } from "vitest";
import { createApp } from "../src/server/app";
import { Store } from "../src/server/jobs/store";
import { RequestSchema, type Run, type GenerationJob } from "../src/shared/contracts";

it("closes the backend even while a browser is still listening to project events", async () => {
  const { app, store } = await createApp({ store: new Store(":memory:") });
  store.save({
    id: "project",
    createdAt: "2026-01-01",
    phase: "ready",
    request: RequestSchema.parse({ instructions: "An original story" }),
    candidates: [],
    jobs: [],
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as AddressInfo;
  let opened!: () => void;
  const open = new Promise<void>((resolve) => (opened = resolve));
  const ended = new Promise<number>((resolve, reject) => {
    request({ host: "127.0.0.1", port, path: "/api/runs/project/events" }, (response) => {
      opened();
      response.resume();
      response.on("end", () => resolve(response.statusCode || 0));
    })
      .on("error", reject)
      .end();
  });
  await open;
  await app.close();
  expect(await ended).toBe(200);
});

it("waits for cancelled job cleanup before closing storage and refuses work after shutdown", async () => {
  const { app, store, workflow } = await createApp({ store: new Store(":memory:") });
  const run: Run = {
    id: "shutdown-project",
    createdAt: "2026-01-01",
    phase: "generating",
    request: RequestSchema.parse({ instructions: "Animate a shape" }),
    candidates: [],
    jobs: [],
  };
  const job: GenerationJob = {
    id: "shutdown-job",
    runId: run.id,
    candidateId: "direction",
    kind: "preview",
    phase: "queued",
    workspace: "/unused-job",
    model: "test",
    duration: 3,
  };
  run.jobs.push(job);
  store.save(run);
  let release!: () => void;
  const setupPending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const setup = vi.fn(async () => setupPending);
  workflow["setup"] = setup;
  const generating = workflow.generate(run, job);
  await vi.waitFor(() => expect(setup).toHaveBeenCalledOnce());
  let closed = false;
  const closing = app.close().then(() => {
    closed = true;
  });
  await vi.waitFor(() => expect(workflow["controllers"].get(job.id)?.signal.aborted).toBe(true));
  expect(closed).toBe(false);
  expect(store.get(run.id)?.jobs[0].phase).toBe("generating");
  release();
  await Promise.all([generating, closing]);
  expect(job.phase).toBe("cancelled");
  expect(workflow.hasActiveTasks(run)).toBe(false);
  expect(closed).toBe(true);
  await workflow.generate(run, job);
  await workflow.prepare(run);
  expect(setup).toHaveBeenCalledOnce();
});
