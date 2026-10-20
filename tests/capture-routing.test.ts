import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/jobs/subworkflows/website-reference", async (original) => {
  return original<typeof import("../src/server/jobs/subworkflows/website-reference")>();
});
vi.mock("puppeteer-core", () => ({ default: { launch: vi.fn() } }));
vi.mock("../src/server/runtime/browser", () => ({
  browserExecutablePath: vi.fn(() => "/browser"),
}));
vi.mock("../src/server/capture/worker-client", () => ({ createRemoteReferenceBrowser: vi.fn() }));
import puppeteer from "puppeteer-core";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { createRemoteReferenceBrowser } from "../src/server/capture/worker-client";
import { createReferenceBrowser } from "../src/server/jobs/subworkflows/website-reference";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it("uses a local visible browser for video when no worker URL exists", async () => {
  vi.stubEnv("KITEVA_CAPTURE_WORKER_URL", "");
  vi.stubEnv("KITEVA_CAPTURE_DESKTOP", "");
  vi.mocked(browserExecutablePath).mockReturnValue("/full-browser");
  vi.mocked(puppeteer.launch).mockRejectedValue(Error("fixture stops before launch"));
  await expect(
    createReferenceBrowser(["https://example.com"], new AbortController().signal, "local", true),
  ).rejects.toThrow("fixture stops");
  expect(browserExecutablePath).toHaveBeenCalledWith(true);
  expect(puppeteer.launch).toHaveBeenCalledWith(
    expect.objectContaining({
      headless: false,
      args: expect.arrayContaining(["--app=data:text/html,<title>Capture</title>"]),
      ignoreDefaultArgs: expect.arrayContaining(["about:blank"]),
    }),
  );
  expect(createRemoteReferenceBrowser).not.toHaveBeenCalled();
});
it("keeps screenshot-only inspection headless without a worker", async () => {
  vi.stubEnv("KITEVA_CAPTURE_WORKER_URL", "");
  vi.stubEnv("KITEVA_CAPTURE_DESKTOP", "");
  vi.mocked(browserExecutablePath).mockReturnValue("/headless-browser");
  vi.mocked(puppeteer.launch).mockRejectedValue(Error("fixture stops before launch"));
  await expect(
    createReferenceBrowser(["https://example.com"], new AbortController().signal, "local"),
  ).rejects.toThrow("fixture stops");
  expect(browserExecutablePath).toHaveBeenCalledWith(false);
  expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: "shell" }));
});
it("uses the configured worker and never silently switches to the local desktop after failure", async () => {
  vi.stubEnv("KITEVA_CAPTURE_WORKER_URL", "https://worker.example.com");
  vi.stubEnv("KITEVA_CAPTURE_DESKTOP", "");
  vi.mocked(createRemoteReferenceBrowser).mockRejectedValue(Error("worker offline"));
  await expect(
    createReferenceBrowser(["https://example.com"], new AbortController().signal, "local", true),
  ).rejects.toThrow("worker offline");
  expect(puppeteer.launch).not.toHaveBeenCalled();
});
