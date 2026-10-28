import { expect, it, vi } from "vitest";
import { mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { jobVersions, preserveJobVersions, reserveJobVersion } from "../src/shared/job-versions";
import { availableRefinementInstructions } from "../src/shared/refinement-history";
import { deleteVideoVersion } from "../src/server/domains/video/delete-version";
import { dataRoot } from "../src/server/runtime/config";
import { Workflow } from "../src/server/jobs/workflow";
import { Store } from "../src/server/jobs/store";
import { loadCatalog } from "../src/server/catalog/catalog";

function project(): Run {
  const id = randomUUID();
  const base = {
    runId: id,
    candidateId: "direction",
    kind: "full" as const,
    phase: "ready" as const,
    model: "example",
    duration: 30,
    sessionId: "builder",
  };
  return {
    id,
    createdAt: new Date().toISOString(),
    phase: "ready",
    request: RequestSchema.parse({ instructions: "Explain the product", duration: 30 }),
    candidates: [],
    jobs: [1, 2, 3].map((n) => ({
      ...base,
      id: `version-${n}`,
      workspace: path.join(dataRoot, "runs", id, `version-${n}`),
      ...(n > 1 ? { refinementPrompt: `Request ${n}` } : {}),
    })),
  };
}

it("preserves legacy numbers and allocates above the deleted highest version, even with no surviving jobs", () => {
  const run = project();
  preserveJobVersions(run);
  run.jobs.pop();
  expect([...jobVersions(run.jobs).values()]).toEqual([1, 2]);
  expect(reserveJobVersion(run, "direction")).toBe(4);
  run.jobs = [];
  expect(reserveJobVersion(run, "direction")).toBe(5);
  expect(reserveJobVersion(run, "other-direction")).toBe(1);
});

it("keeps numbering gaps and excludes deleted requests carried in later snapshots", async () => {
  const run = project();
  const deleted = run.jobs[1];
  const descendant = run.jobs[2];
  if (descendant.outputType === "page") throw Error("video expected");
  descendant.refinementHistory = [{ jobId: deleted.id, prompt: "Request 2" }];
  await mkdir(deleted.workspace, { recursive: true });
  await writeFile(path.join(deleted.workspace, "index.html"), "version 2");
  await mkdir(descendant.workspace, { recursive: true });
  await writeFile(path.join(descendant.workspace, "index.html"), "version 3");
  try {
    const persist = vi.fn();
    const next = await deleteVideoVersion({
      run,
      jobId: deleted.id,
      signal: new AbortController().signal,
      persist,
    });
    expect(persist).toHaveBeenCalledWith(next);
    expect(run.jobs).toHaveLength(3);
    expect([...jobVersions(next.jobs).values()]).toEqual([1, 3]);
    expect(next.deletedVersions?.[0]).toMatchObject({ id: deleted.id, version: 2 });
    expect(availableRefinementInstructions(next, "direction").map((entry) => entry.prompt)).toEqual(
      ["Request 3"],
    );
    await expect(access(deleted.workspace)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(descendant.workspace, "index.html"), "utf8")).toBe("version 3");
    expect(reserveJobVersion(next, "direction")).toBe(4);
  } finally {
    await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
  }
});

it("rolls back workspace removal if saving fails and rejects unsafe or active versions", async () => {
  const run = project();
  const job = run.jobs[0];
  await mkdir(job.workspace, { recursive: true });
  await writeFile(path.join(job.workspace, "index.html"), "keep");
  const input = {
    run,
    jobId: job.id,
    signal: new AbortController().signal,
    persist: () => {
      throw Error("save failed");
    },
  };
  try {
    await expect(deleteVideoVersion(input)).rejects.toThrow("save failed");
    expect(await readFile(path.join(job.workspace, "index.html"), "utf8")).toBe("keep");
    job.phase = "rendering";
    await expect(deleteVideoVersion(input)).rejects.toMatchObject({ code: "PROJECT_ACTIVE" });
    job.phase = "ready";
    job.workspace = path.join(dataRoot, "runs", "other-project", job.id);
    await expect(deleteVideoVersion(input)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    job.workspace = path.join(dataRoot, "runs", run.id, job.id);
    const aborted = AbortSignal.abort();
    await expect(deleteVideoVersion({ ...input, signal: aborted })).rejects.toThrow();
    expect(await readFile(path.join(job.workspace, "index.html"), "utf8")).toBe("keep");
  } finally {
    await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
  }
});

it("rejects version deletion while the project is building", async () => {
  const run = project();
  run.phase = "rendering";
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  try {
    await expect(workflow.deleteVideoVersion(run, run.jobs[0].id)).rejects.toMatchObject({
      code: "PROJECT_ACTIVE",
    });
  } finally {
    await workflow.shutdown();
    store.close();
  }
});

it("deletes through the API and persists counters across reloading the saved project", async () => {
  const { createApp } = await import("../src/server/app");
  const store = new Store(":memory:");
  const run = project();
  store.save(run);
  const { app } = await createApp({ store });
  try {
    const response = await app.inject({
      method: "DELETE",
      url: `/api/runs/${run.id}/versions/version-3`,
    });
    expect(response.statusCode).toBe(200);
    const saved = store.get(run.id)!;
    expect(saved.jobs).toHaveLength(2);
    expect(saved.revisionCounters).toEqual({ direction: 3 });
    expect(reserveJobVersion(saved, "direction")).toBe(4);
    const repeated = await app.inject({
      method: "DELETE",
      url: `/api/runs/${run.id}/versions/version-3`,
    });
    expect(repeated.statusCode).toBe(400);
  } finally {
    await app.close();
    await rm(path.join(dataRoot, "runs", run.id), { recursive: true, force: true });
  }
});
