import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
}));
vi.mock("../src/server/runtime/browser", () => ({
  browserExecutablePath: () => process.env.VIDEO_BROWSER_PATH || "/browser",
}));
import { readFile, writeFile } from "node:fs/promises";
import {
  assertWindowsRenderReady,
  recordWindowsRenderVerification,
  withWindowsSandboxVerification,
} from "../src/server/rendering/sandbox/readiness";
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("refuses rendering without a matching native verification record", async () => {
  vi.mocked(readFile).mockRejectedValueOnce(Object.assign(Error("missing"), { code: "ENOENT" }));
  await expect(assertWindowsRenderReady()).rejects.toThrow("windows:check");
});
it("keeps diagnostic bypass local to its async context", async () => {
  await expect(
    withWindowsSandboxVerification(() => assertWindowsRenderReady()),
  ).resolves.toBeUndefined();
  vi.mocked(readFile).mockRejectedValueOnce(Error("missing"));
  await expect(assertWindowsRenderReady()).rejects.toThrow("windows:check");
  await expect(recordWindowsRenderVerification()).rejects.toThrow("Only the native diagnostic");
});
it("accepts successful proof and invalidates it after a browser configuration change", async () => {
  vi.stubEnv("VIDEO_BROWSER_PATH", "/browser-one");
  await withWindowsSandboxVerification(() => recordWindowsRenderVerification());
  const contents = vi.mocked(writeFile).mock.calls[0][1] as string;
  vi.mocked(readFile).mockResolvedValue(contents);
  await expect(assertWindowsRenderReady()).resolves.toBeUndefined();
  vi.stubEnv("VIDEO_BROWSER_PATH", "/browser-two");
  await expect(assertWindowsRenderReady()).rejects.toThrow("windows:check");
});
