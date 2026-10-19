import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { Store } from "../src/server/jobs/store";

it("waits for another process's SQLite write lock before saving render progress", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "store-contention-"));
  const filename = path.join(folder, "jobs.sqlite");
  const store = new Store(filename);
  const writer = new Worker(
    `
    const { DatabaseSync } = require('node:sqlite');
    const { parentPort, workerData } = require('node:worker_threads');
    const db = new DatabaseSync(workerData);
    db.exec('BEGIN IMMEDIATE');
    parentPort.postMessage('locked');
    setTimeout(() => { db.exec('COMMIT'); db.close(); }, 200);
  `,
    { eval: true, workerData: filename },
  );
  try {
    await once(writer, "message");
    const event = store.emit("project", "render_progress", "capture: 2598/10800 frames");
    expect(store.events("project")).toEqual([event]);
    expect(event.type).toBe("render_progress");
  } finally {
    await writer.terminate();
    store.close();
    await rm(folder, { recursive: true, force: true });
  }
});
