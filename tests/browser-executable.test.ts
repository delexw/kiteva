import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("node:fs", () => ({ existsSync: vi.fn(), readdirSync: vi.fn() }));
import { existsSync, readdirSync } from "node:fs";
import { browserExecutablePath } from "../src/server/runtime/browser";

it("can find full Chrome for human sign-in when screenshot configuration points to headless shell", () => {
  vi.stubEnv("VIDEO_BROWSER_PATH", "/browser/chrome-headless-shell");
  vi.stubEnv("HYPERFRAMES_BROWSER_PATH", "/browser/chrome-headless-shell");
  vi.stubEnv("PUPPETEER_CACHE_DIR", "/managed/browsers");
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readdirSync).mockReturnValue(["mac/browser/Google Chrome for Testing"] as never);
  expect(browserExecutablePath(true)).toBeUndefined();
  expect(browserExecutablePath(true, { fallbackFromHeadlessShell: true })).toBe(
    path.join("/managed/browsers/chrome", "mac/browser/Google Chrome for Testing"),
  );
});
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
  vi.stubEnv("PUPPETEER_CACHE_DIR", "");
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
it("finds a native Windows headless shell using USERPROFILE without HOME", () => {
  vi.stubEnv("HYPERFRAMES_BROWSER_PATH", "");
  vi.stubEnv("VIDEO_BROWSER_PATH", "");
  vi.stubEnv("PUPPETEER_CACHE_DIR", "");
  vi.stubEnv("HOME", "");
  vi.stubEnv("USERPROFILE", "C:\\Users\\Creator");
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readdirSync).mockReturnValue([
    "win64-151\\chrome-headless-shell-win64\\chrome-headless-shell.exe",
  ] as never);
  expect(browserExecutablePath()).toBe(
    path.join(
      "C:\\Users\\Creator",
      ".cache",
      "puppeteer",
      "chrome-headless-shell",
      "win64-151\\chrome-headless-shell-win64\\chrome-headless-shell.exe",
    ),
  );
});
it("honors a shared Puppeteer cache directory", () => {
  vi.stubEnv("HYPERFRAMES_BROWSER_PATH", "");
  vi.stubEnv("VIDEO_BROWSER_PATH", "");
  vi.stubEnv("PUPPETEER_CACHE_DIR", "/managed/browsers");
  vi.mocked(existsSync).mockImplementation(
    (folder) => !String(folder).endsWith("chrome-headless-shell"),
  );
  vi.mocked(readdirSync).mockReturnValue(["win64-151/chrome-win64/chrome.exe"] as never);
  expect(browserExecutablePath()).toBe(
    path.join("/managed/browsers", "chrome", "win64-151/chrome-win64/chrome.exe"),
  );
});
