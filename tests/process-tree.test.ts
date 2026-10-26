import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("pidtree", () => ({ default: vi.fn(async () => []) }));
import { spawn } from "node:child_process";
import { terminateProcessTree } from "../src/server/runtime/process-tree";
beforeEach(() => vi.clearAllMocks());
it("kills only the owned Windows process tree without shell evaluation and waits for taskkill", async () => {
  const killer = new EventEmitter();
  vi.mocked(spawn).mockReturnValue(killer as ReturnType<typeof spawn>);
  const stopping = terminateProcessTree(1234, { platform: "win32" });
  await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
  expect(spawn).toHaveBeenCalledWith(
    expect.stringMatching(/System32\\taskkill\.exe$/),
    ["/PID", "1234", "/T", "/F"],
    { stdio: "ignore", windowsHide: true },
  );
  let finished = false;
  void stopping.then(() => {
    finished = true;
  });
  expect(finished).toBe(false);
  killer.emit("close", 0);
  await stopping;
});
it("rejects invalid PIDs instead of targeting the current group", async () => {
  for (const pid of [undefined, 0, -1, NaN, 1.2])
    await terminateProcessTree(pid, { platform: "win32" });
  expect(spawn).not.toHaveBeenCalled();
});
it("retains Unix group termination and escalates only owned processes", async () => {
  const kill = vi.spyOn(process, "kill").mockImplementation((_pid, signal) => {
    if (signal === 0) throw Object.assign(Error("Exited"), { code: "ESRCH" });
    return true;
  });
  try {
    await terminateProcessTree(2345, { processGroup: true, platform: "darwin" });
    expect(kill).toHaveBeenCalledWith(-2345, "SIGTERM");
    expect(kill).toHaveBeenCalledWith(-2345, "SIGKILL");
  } finally {
    kill.mockRestore();
  }
});
