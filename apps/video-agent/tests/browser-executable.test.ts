import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("node:fs", () => ({ existsSync: vi.fn(), readdirSync: vi.fn() }));
import { existsSync, readdirSync } from "node:fs";
import { browserExecutablePath } from "../src/server/runtime/browser";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("shares the rendering browser overrides with reference capture", () => {
  vi.mocked(existsSync).mockReturnValue(false);
  vi.stubEnv("VIDEO_BROWSER_PATH", "/configured-browser");
  vi.stubEnv("HYPERFRAMES_BROWSER_PATH", "/render-browser");
  expect(browserExecutablePath()).toBe("/render-browser");
  vi.stubEnv("HYPERFRAMES_BROWSER_PATH", "");
  expect(browserExecutablePath()).toBe("/configured-browser");
});
it("finds an installed headless shell without downloading a second browser", () => {
  vi.stubEnv("HYPERFRAMES_BROWSER_PATH", "");
  vi.stubEnv("VIDEO_BROWSER_PATH", "");
  vi.stubEnv("HOME", "/test-home");
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readdirSync).mockReturnValue([
    "mac_arm-150/browser/chrome-headless-shell",
    "mac_arm-151/browser/chrome-headless-shell",
    "mac_arm-151/browser/resources.pak",
  ] as never);
  expect(browserExecutablePath()).toBe(
    path.join(
      "/test-home/.cache/puppeteer/chrome-headless-shell",
      "mac_arm-151/browser/chrome-headless-shell",
    ),
  );
});
it("returns no browser when neither overrides nor a cached installation exist", () => {
  vi.stubEnv("HYPERFRAMES_BROWSER_PATH", "");
  vi.stubEnv("VIDEO_BROWSER_PATH", "");
  vi.mocked(existsSync).mockReturnValue(false);
  expect(browserExecutablePath()).toBeUndefined();
});
