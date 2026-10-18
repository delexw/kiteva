import { beforeEach, expect, it, vi } from "vitest";
vi.mock("node:child_process", () => ({ spawn: vi.fn(() => ({ on: vi.fn() })) }));
import { spawn } from "node:child_process";
import { stopProcessTree } from "../src/server/runtime/process-tree";
beforeEach(() => vi.clearAllMocks());
it("kills only the owned Windows process tree without shell evaluation", () => {
  stopProcessTree(1234, "win32");
  expect(spawn).toHaveBeenCalledWith(
    expect.stringMatching(/System32\\taskkill\.exe$/),
    ["/PID", "1234", "/T", "/F"],
    { stdio: "ignore", windowsHide: true },
  );
});
it("rejects invalid PIDs instead of targeting the current group", () => {
  for (const pid of [undefined, 0, -1, NaN, 1.2]) stopProcessTree(pid, "win32");
  expect(spawn).not.toHaveBeenCalled();
});
it("retains Unix process-group termination", () => {
  const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
  stopProcessTree(2345, "darwin");
  expect(kill).toHaveBeenCalledWith(-2345, "SIGTERM");
  kill.mockRestore();
});
