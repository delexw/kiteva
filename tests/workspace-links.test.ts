import { afterEach, expect, it, vi } from "vitest";
vi.mock("node:fs/promises", () => ({
  copyFile: vi.fn(),
  symlink: vi.fn().mockResolvedValue(undefined),
}));
import { copyFile, symlink } from "node:fs/promises";
import { linkSdkFile, linkWorkspaceDirectory } from "../src/server/runtime/workspace-links";
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
it("uses junctions for Windows workspace dependencies", async () => {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
  await linkWorkspaceDirectory("C:\\app\\node_modules", "C:\\job\\node_modules");
  expect(symlink).toHaveBeenCalledWith(
    "C:\\app\\node_modules",
    "C:\\job\\node_modules",
    "junction",
  );
});
it("refreshes Windows SDK files without symlink privileges", async () => {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
  await linkSdkFile("source", "destination");
  expect(copyFile).toHaveBeenCalledWith("source", "destination");
  expect(symlink).not.toHaveBeenCalled();
});
it("preserves existing Unix links and does not swallow other errors", async () => {
  vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
  vi.mocked(symlink).mockRejectedValueOnce(Object.assign(Error("exists"), { code: "EEXIST" }));
  await expect(linkWorkspaceDirectory("source", "dest")).resolves.toBeUndefined();
  vi.mocked(symlink).mockRejectedValueOnce(Object.assign(Error("denied"), { code: "EPERM" }));
  await expect(linkSdkFile("source", "dest")).rejects.toThrow("denied");
});
