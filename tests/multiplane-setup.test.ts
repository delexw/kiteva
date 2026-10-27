import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { appRoot } from "../src/server/runtime/config";
vi.mock("../src/server/runtime/process", () => ({ command: vi.fn(async () => "") }));
vi.mock("../src/server/rendering/multiplane", async (load) => ({
  ...(await load<typeof import("../src/server/rendering/multiplane")>()),
  runMultiplane: vi.fn(async () => ({ type: "result", ok: true })),
}));
import { command } from "../src/server/runtime/process";
import { runMultiplane, multiplaneEnvironment } from "../src/server/rendering/multiplane";
import { setupMultiplane } from "../scripts/setup-multiplane";
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());
it("installs the renderer's exact Playwright browser before doctor using the same environment", async () => {
  const signal = new AbortController().signal;
  vi.stubEnv("PLAYWRIGHT_BROWSERS_PATH", "/example/cache");
  await setupMultiplane(signal);
  const rendererRequire = createRequire(path.join(appRoot, "node_modules/multiplane/package.json"));
  const expectedCli = path.join(
    path.dirname(rendererRequire.resolve("playwright/package.json")),
    "cli.js",
  );
  expect(command).toHaveBeenCalledWith(
    process.execPath,
    [expectedCli, "install", "chromium"],
    expect.any(String),
    signal,
    expect.any(Function),
    600000,
    false,
    expect.any(Function),
    multiplaneEnvironment(),
  );
  expect(runMultiplane).toHaveBeenCalledWith(
    "doctor",
    expect.arrayContaining(["doctor", "--json"]),
    expect.any(String),
    signal,
    expect.any(Function),
    60000,
  );
  expect(vi.mocked(command).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(runMultiplane).mock.invocationCallOrder[0],
  );
});
it("propagates failed installation without claiming readiness or starting doctor", async () => {
  vi.mocked(command).mockRejectedValueOnce(Error("Browser download failed"));
  await expect(setupMultiplane()).rejects.toThrow("Browser download failed");
  expect(runMultiplane).not.toHaveBeenCalled();
});
it("propagates failed doctor and respects cancellation", async () => {
  vi.mocked(runMultiplane).mockRejectedValueOnce(Error("Browser launch failed"));
  await expect(setupMultiplane()).rejects.toThrow("Browser launch failed");
  vi.clearAllMocks();
  const controller = new AbortController();
  controller.abort(Error("Stopped"));
  await expect(setupMultiplane(controller.signal)).rejects.toThrow("Stopped");
  expect(command).not.toHaveBeenCalled();
});
