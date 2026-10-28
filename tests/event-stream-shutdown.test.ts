vi.mock("../src/server/jev/strategies/visual-authoring", () => ({
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

it.each([false, true])(
  "replays history with batching=%s and resumes live events after the cursor",
  async (batch) => {
    const { app, store } = await createApp({ store: new Store(":memory:") });
    store.save({
      id: "project",
      createdAt: "2026-01-01",
      phase: "ready",
      request: RequestSchema.parse({ instructions: "An original story" }),
      candidates: [],
      jobs: [],
    });
    const history = Array.from({ length: 1002 }, (_, index) =>
      store.emit("project", "state", `saved-${index}`),
    );
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    try {
      const frames = await new Promise<string[]>((resolve, reject) => {
        let received = "",
          liveSent = false;
        const client = request(
          {
            host: "127.0.0.1",
            port,
            path: `/api/runs/project/events?batch=${batch ? 1 : 0}&after=1`,
            headers: { "Last-Event-ID": String(history[1].id) },
          },
          (response) => {
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              received += chunk;
              if (!liveSent && received.includes("saved-1001")) {
                liveSent = true;
                store.emit("project", "state", "live-update");
              }
              if (received.includes("live-update")) {
                client.destroy();
                resolve(received.trim().split("\n\n"));
              }
            });
          },
        );
        client.on("error", reject);
        client.end();
      });
      const values = frames.map((frame) => JSON.parse(frame.split("\ndata: ")[1]));
      expect(values.slice(0, -1).flat()).toEqual(history.slice(2));
      expect(values.at(-1)).toMatchObject({ message: "live-update" });
      expect(frames.filter((frame) => frame.includes("event: history")).length).toBe(batch ? 2 : 0);
      expect(frames.at(-2)).toContain(`id: ${history.at(-1)!.id}\n`);
    } finally {
      await app.close();
    }
  },
);

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

it.each(["cancel", "delete"])(
  "%s waits for project dependency cleanup before returning",
  async (action) => {
    const { randomUUID } = await import("node:crypto");
    const { app, store, workflow } = await createApp({ store: new Store(":memory:") });
    const run: Run = {
      id: randomUUID(),
      createdAt: "2026-01-01",
      phase: "generating",
      request: RequestSchema.parse({ instructions: "Animate a shape" }),
      candidates: [],
      jobs: [],
    };
    const job: GenerationJob = {
      id: randomUUID(),
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
    let signal: AbortSignal | undefined;
    workflow["setup"] = vi.fn(async (_run, _job, callerSignal) => {
      signal = callerSignal;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const generating = workflow.generate(run, job);
    try {
      await vi.waitFor(() => expect(signal).toBeDefined());
      let returned = false;
      const stopping = app
        .inject({
          method: action === "delete" ? "DELETE" : "POST",
          url: `/api/runs/${run.id}${action === "cancel" ? "/cancel" : ""}`,
        })
        .then((reply) => {
          returned = true;
          return reply;
        });
      await vi.waitFor(() => expect(signal!.aborted).toBe(true));
      expect(returned).toBe(false);
      expect(store.get(run.id)).toBeDefined();
      release();
      const reply = await stopping;
      expect(reply.statusCode).toBe(200);
      await generating;
      expect(workflow.hasActiveTasks(run)).toBe(false);
      if (action === "delete") expect(store.get(run.id)).toBeUndefined();
      else expect(store.get(run.id)?.phase).toBe("cancelled");
    } finally {
      release?.();
      await generating;
      await app.close();
    }
  },
);

it("project stop includes auxiliary dependencies and preserves another project's caller", async () => {
  const { app, workflow } = await createApp({ store: new Store(":memory:") });
  const project = (id: string): Run => ({
    id,
    createdAt: "2026-01-01",
    phase: "ready",
    request: RequestSchema.parse({ instructions: "Animate a shape" }),
    candidates: [],
    jobs: [],
  });
  const first = project("first"),
    second = project("second");
  const signals: AbortSignal[] = [];
  const releases: Array<() => void> = [];
  const work = async (signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve) => releases.push(resolve));
  };
  const a = workflow.projectDependency(first, new AbortController().signal, work);
  const b = workflow.projectDependency(second, new AbortController().signal, work);
  try {
    expect(workflow.hasActiveTasks(first)).toBe(true);
    let stopped = false;
    const stopping = workflow.stop(first).then(() => {
      stopped = true;
    });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(stopped).toBe(false);
    releases[0]();
    await stopping;
    expect(workflow.hasActiveTasks(first)).toBe(false);
    expect(workflow.hasActiveTasks(second)).toBe(true);
    expect(signals[1].aborted).toBe(false);
  } finally {
    releases.forEach((release) => release());
    await Promise.all([a, b]);
    await app.close();
  }
});

it.each(["cancel", "delete"])(
  "%s returns only after the real owned dependency process is dead",
  async (action) => {
    const { randomUUID } = await import("node:crypto");
    const { command } = await import("../src/server/runtime/process");
    const { appRoot } = await import("../src/server/runtime/config");
    const { app, store, workflow } = await createApp({ store: new Store(":memory:") });
    const run: Run = {
      id: randomUUID(),
      createdAt: "2026-01-01",
      phase: "ready",
      request: RequestSchema.parse({ instructions: "Animate a shape" }),
      candidates: [],
      jobs: [],
    };
    store.save(run);
    let pid: number | undefined;
    const running = workflow.projectDependency(run, new AbortController().signal, (signal) =>
      command(
        process.execPath,
        ["-e", "process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)"],
        appRoot,
        signal,
        () => {},
        10000,
        false,
        (text) => {
          pid = Number(text.trim());
        },
      ),
    );
    const rejected = expect(running).rejects.toThrow("Cancelled");
    try {
      await vi.waitFor(() => expect(pid).toBeGreaterThan(0));
      const reply = await app.inject({
        method: action === "delete" ? "DELETE" : "POST",
        url: `/api/runs/${run.id}${action === "cancel" ? "/cancel" : ""}`,
      });
      expect(reply.statusCode).toBe(200);
      await rejected;
      expect(() => process.kill(pid!, 0)).toThrow();
      expect(workflow.hasActiveTasks(run)).toBe(false);
    } finally {
      await workflow.stop(run);
      await running.catch(() => {});
      await app.close();
    }
  },
  15000,
);

it("retains a project when a dependency reports unsuccessful cleanup", async () => {
  const { randomUUID } = await import("node:crypto");
  const { DependencyCleanupError } = await import("../src/server/runtime/process-tree");
  const { app, store, workflow } = await createApp({ store: new Store(":memory:") });
  const run: Run = {
    id: randomUUID(),
    createdAt: "2026-01-01",
    phase: "ready",
    request: RequestSchema.parse({ instructions: "Animate a shape" }),
    candidates: [],
    jobs: [],
  };
  store.save(run);
  try {
    await expect(
      workflow.projectDependency(run, new AbortController().signal, async () => {
        throw new DependencyCleanupError(Error("Cleanup denied"));
      }),
    ).rejects.toMatchObject({ code: "DEPENDENCY_CLEANUP_FAILED" });
    const reply = await app.inject({ method: "DELETE", url: `/api/runs/${run.id}` });
    expect(reply.statusCode).toBe(409);
    expect(reply.json().code).toBe("DEPENDENCY_CLEANUP_FAILED");
    expect(store.get(run.id)).toBeDefined();
  } finally {
    await app.close();
  }
});

it("keeps activity history paged and diagnostic bodies out of both UI transports", async () => {
  const { app, store } = await createApp({ store: new Store(":memory:") });
  store.save({
    id: "project",
    createdAt: "2026-01-01",
    phase: "ready",
    request: RequestSchema.parse({ instructions: "An original story" }),
    candidates: [],
    jobs: [],
  });
  for (let i = 0; i < 1100; i++)
    store.emit("project", "tool_result", "Large internal output", undefined, {
      results: [{ itemId: `tool-${i}`, failed: false, output: "private".repeat(10000) }],
      prompt: "private",
    });
  try {
    const response = await app.inject({ method: "GET", url: "/api/runs/project/activity" });
    expect(response.statusCode).toBe(200);
    const page = response.json();
    expect(page.events).toHaveLength(500);
    expect(page.hasOlder).toBe(true);
    expect(response.body).not.toContain("private");
    expect(response.body.length).toBeLessThan(200000);
    expect(store.allEvents("project").at(-1)?.data).toHaveProperty("prompt", "private");
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    const history = await new Promise<string>((resolve, reject) => {
      const client = request(
        { host: "127.0.0.1", port, path: "/api/runs/project/events?batch=1&view=summary" },
        (response) => {
          let text = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            text += chunk;
            if (text.includes("\n\n")) {
              client.destroy();
              resolve(text);
            }
          });
        },
      );
      client.on("error", reject);
      client.end();
    });
    expect(history).toContain("event: history");
    expect(history).not.toContain("private");
    expect(JSON.parse(history.split("data: ")[1].trim())).toHaveLength(500);
  } finally {
    await app.close();
  }
});
