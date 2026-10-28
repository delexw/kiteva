import { expect, it } from "vitest";
import { activityBranchPage, activityBranchPageSize } from "../src/shared/activity-branches";
import type { DisplayActivityItem } from "../src/shared/activity-display";
import { Store } from "../src/server/jobs/store";
import { RequestSchema, type Run } from "../src/shared/contracts";
const leaf = (id: number): DisplayActivityItem => ({
  id,
  scope: "job",
  kind: "notice",
  text: `Step ${id}`,
  time: "2026-01-01",
  status: "complete",
});
it("returns immediate children at every level without shipping descendants", () => {
  const tree = [{ ...leaf(1), children: [{ ...leaf(2), children: [leaf(3)] }] }];
  expect(activityBranchPage(tree, []).items).toEqual([
    { ...leaf(1), hasChildren: true, progressPercent: undefined },
  ]);
  expect(activityBranchPage(tree, [1]).items[0]).toMatchObject({ id: 2, hasChildren: true });
  expect(activityBranchPage(tree, [1, 2]).items[0]).toMatchObject({ id: 3, hasChildren: false });
  expect(JSON.stringify(activityBranchPage(tree, []))).not.toContain("children");
  expect(activityBranchPage(tree, [999]).items).toEqual([]);
});
it("pages sibling rows for automatic loading using the same branch function", () => {
  const tree = Array.from({ length: activityBranchPageSize + 2 }, (_, index) => leaf(index));
  const first = activityBranchPage(tree, []);
  expect(first.items).toHaveLength(activityBranchPageSize);
  expect(first.nextOffset).toBe(activityBranchPageSize);
  const next = activityBranchPage(tree, [], first.nextOffset);
  expect(next.items.map((item) => item.id)).toEqual([100, 101]);
  expect(next.nextOffset).toBeUndefined();
});
it("uses the existing grouping rules on the backend and isolates versions", () => {
  const store = new Store(":memory:");
  const run: Run = {
    id: "project",
    phase: "ready",
    createdAt: "2026-01-01",
    jobs: [],
    candidates: [],
    request: RequestSchema.parse({ instructions: "Explain a concept" }),
  };
  try {
    store.emit(run.id, "tool", "Read", "job", {
      purpose: "full video generation",
      invocationId: "build",
      state: "item.completed",
      itemId: "read",
    });
    store.emit(run.id, "tool", "Write", "job", {
      purpose: "full video generation",
      invocationId: "build",
      state: "item.completed",
      itemId: "write",
    });
    store.emit(run.id, "error", "Other job", "other");
    const root = store.activityChildren(run, "job");
    expect(root.items).toHaveLength(1);
    expect(root.items[0].hasChildren).toBe(true);
    expect(JSON.stringify(root)).not.toContain("Other job");
    const nested = store.activityChildren(run, "job", [root.items[0].id]);
    expect(nested.items.length).toBeGreaterThan(0);
    expect(nested.items.every((item) => !("children" in item))).toBe(true);
  } finally {
    store.close();
  }
});

it("serves and validates branch paths through the shared API handler", async () => {
  const { default: Fastify } = await import("fastify");
  const { registerActivityChildrenRoute } = await import("../src/server/jobs/activity-routes");
  const { apiErrorHandler } = await import("../src/server/runtime/api-errors");
  const store = new Store(":memory:");
  const run: Run = {
    id: "project",
    phase: "ready",
    createdAt: "2026-01-01",
    jobs: [],
    candidates: [],
    request: RequestSchema.parse({ instructions: "Explain a concept" }),
  };
  store.save(run);
  store.emit(run.id, "tool", "Read", "job", {
    purpose: "full video generation",
    invocationId: "build",
    state: "item.completed",
    itemId: "read",
  });
  const app = Fastify();
  app.setErrorHandler(apiErrorHandler);
  registerActivityChildrenRoute(app, store);
  try {
    const root = await app.inject({
      method: "GET",
      url: "/api/runs/project/activity/children?jobId=job",
    });
    expect(root.statusCode).toBe(200);
    const parent = root.json().items[0];
    const child = await app.inject({
      method: "GET",
      url: `/api/runs/project/activity/children?jobId=job&path=${parent.id}`,
    });
    expect(child.statusCode).toBe(200);
    expect(child.json().items.length).toBeGreaterThan(0);
    expect(
      (await app.inject({ method: "GET", url: "/api/runs/project/activity/children?path=invalid" }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: "GET", url: "/api/runs/missing/activity/children" })).statusCode,
    ).toBe(404);
    store.emit(run.id, "error", "New failure", "job");
    expect(store.activityChildren(run, "job").lastEventId).toBeGreaterThan(root.json().lastEventId);
  } finally {
    await app.close();
    store.close();
  }
});
it("invalidates cached running rows when their own job finishes, even if the project stays active", () => {
  const store = new Store(":memory:");
  const run: Run = {
    id: "project",
    phase: "generating",
    createdAt: "2026-01-01",
    jobs: [
      {
        id: "job",
        runId: "project",
        candidateId: "direction",
        kind: "preview",
        phase: "generating",
        model: "example",
        duration: 3,
        workspace: "/unused",
      },
    ],
    candidates: [],
    request: RequestSchema.parse({ instructions: "Explain a concept" }),
  };
  try {
    store.emit(run.id, "tool", "Bash", "job", {
      purpose: "preview video generation",
      invocationId: "build",
      state: "item.started",
      itemId: "unfinished",
    });
    const before = store.activityChildren(run, "job");
    expect(before.items[0].status).toBe("running");
    run.jobs[0].phase = "ready";
    const after = store.activityChildren(run, "job");
    expect(after.items[0].status).toBe("stopped");
    expect(after.lastEventId).toBe(before.lastEventId);
  } finally {
    store.close();
  }
});
