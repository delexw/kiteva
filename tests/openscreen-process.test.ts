import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("node:fs", () => ({ existsSync: () => false }));
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs/promises", () => ({ access: vi.fn() }));
vi.mock("../src/server/runtime/process-tree", () => ({ stopProcessTree: vi.fn() }));
import { spawn } from "node:child_process";
import { stopProcessTree } from "../src/server/runtime/process-tree";
import { startOpenScreen } from "../src/server/capture/openscreen";

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
function processFixture(ready = true, valid = true) {
  vi.stubEnv("OPENSCREEN_EXECUTABLE", "/worker/OpenScreen");
  const child = Object.assign(new EventEmitter(), {
    pid: 1234,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
      final(done) {
        queueMicrotask(() => {
          if (valid)
            child.stdout.write(
              JSON.stringify({
                event: "done",
                success: true,
                screenVideoPath: "/recordings/take.mp4",
                durationMs: 1200,
              }) + "\n",
            );
          child.emit("close", valid ? 0 : 1);
        });
        done();
      },
    }),
  });
  vi.mocked(spawn).mockImplementation(() => {
    if (ready)
      queueMicrotask(() => child.stdout.write('{"event":"log","message":"Recording started"}\n'));
    return child as unknown as ChildProcess;
  });
  return child;
}
it("records only the uniquely named window with OpenScreen and gracefully stops through stdin", async () => {
  processFixture();
  const recorder = await startOpenScreen("Kiteva capture unique-id", new AbortController().signal);
  expect(spawn).toHaveBeenCalledWith(
    "/worker/OpenScreen",
    ["record", "--window", "Kiteva capture unique-id", "--cursor", "editable-overlay", "--json"],
    expect.objectContaining({ windowsHide: true }),
  );
  expect(await recorder.stop()).toMatchObject({
    screenVideoPath: "/recordings/take.mp4",
    durationMs: 1200,
  });
  expect(stopProcessTree).not.toHaveBeenCalled();
});
it("rejects cancellation even if OpenScreen finishes saving a valid take", async () => {
  processFixture();
  const controller = new AbortController();
  const recorder = await startOpenScreen("Kiteva capture unique-id", controller.signal);
  controller.abort();
  await expect(recorder.stop()).rejects.toThrow();
});
it("does not accept a recorder exit without a valid completion event", async () => {
  processFixture(true, false);
  const recorder = await startOpenScreen("Kiteva capture unique-id", new AbortController().signal);
  await expect(recorder.stop()).rejects.toThrow("valid recording");
});
it("bounds startup and stops a process that never reports recording readiness", async () => {
  vi.useFakeTimers();
  processFixture(false);
  const pending = startOpenScreen("Kiteva capture unique-id", new AbortController().signal);
  const rejection = expect(pending).rejects.toThrow("30 seconds");
  await vi.advanceTimersByTimeAsync(30000);
  await rejection;
});
it("refuses to select a substitute recorder when OpenScreen is not configured", async () => {
  vi.stubEnv("OPENSCREEN_EXECUTABLE", "");
  await expect(
    startOpenScreen("Kiteva capture unique-id", new AbortController().signal),
  ).rejects.toThrow("OPENSCREEN_EXECUTABLE");
  expect(spawn).not.toHaveBeenCalled();
});
