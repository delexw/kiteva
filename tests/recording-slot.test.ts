import { mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { acquireRecordingSlot } from "../src/server/capture/recording-slot";

it("serializes five separate recording processes sharing the same host slot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recording-slot-"));
  try {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        promisify(execFile)(
          process.execPath,
          [
            "--import",
            "tsx",
            fileURLToPath(new URL("./fixtures/recording-slot-worker.ts", import.meta.url)),
            path.join(root, "slot"),
            path.join(root, "active"),
          ],
          { timeout: 15000 },
        ),
      ),
    );
    const intervals = results
      .map((r) => JSON.parse(r.stdout) as { started: number; stopped: number })
      .sort((a, b) => a.started - b.started);
    for (let index = 1; index < intervals.length; index++)
      expect(intervals[index].started).toBeGreaterThanOrEqual(intervals[index - 1].stopped);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("cancels a queued request without releasing another recording's slot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recording-cancel-"));
  const file = path.join(root, "slot");
  const first = await acquireRecordingSlot(new AbortController().signal, file);
  try {
    const controller = new AbortController();
    const waiting = acquireRecordingSlot(controller.signal, file);
    const rejected = expect(waiting).rejects.toThrow();
    controller.abort(Error("Cancelled queued recording"));
    await rejected;
    await first.release();
    await first.release();
    const next = await acquireRecordingSlot(new AbortController().signal, file);
    await next.release();
  } finally {
    await first.release();
    await rm(root, { recursive: true, force: true });
  }
});
