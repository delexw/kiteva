import { afterEach, expect, it, vi } from "vitest";
import puppeteer from "puppeteer-core";
import { launchReferenceBrowser } from "../src/server/agents/capabilities/reference-browser/launch";

afterEach(() => vi.restoreAllMocks());
it("shares responsive window, profile, environment and defaults between recording and sign-in", async () => {
  const launch = vi.spyOn(puppeteer, "launch").mockRejectedValue(Error("Launch intercepted"));
  const input = {
    executablePath: "/example/chrome",
    workspace: "/tmp/example-project",
    profile: "/tmp/example-profile",
    signal: new AbortController().signal,
    mode: "local" as const,
  };
  for (const presentation of ["capture", "sign-in"] as const)
    await expect(launchReferenceBrowser({ ...input, presentation })).rejects.toThrow(
      "Launch intercepted",
    );
  const capture = launch.mock.calls[0][0]!;
  const signIn = launch.mock.calls[1][0]!;
  for (const options of [capture, signIn]) {
    expect(options).toMatchObject({
      headless: false,
      defaultViewport: null,
      userDataDir: input.profile,
      executablePath: input.executablePath,
      signal: input.signal,
      timeout: 10000,
    });
    expect(options.args).toContain("--window-size=1440,1000");
  }
  expect(capture.env).toEqual(signIn.env);
  expect(capture.args?.filter((argument) => !argument.startsWith("--app="))).toEqual(signIn.args);
  expect(capture.ignoreDefaultArgs).toEqual(["about:blank"]);
  expect(signIn.ignoreDefaultArgs).toBeUndefined();
});
it("retains headless and hosted network configuration in the shared launcher", async () => {
  const launch = vi.spyOn(puppeteer, "launch").mockRejectedValue(Error("Launch intercepted"));
  await expect(
    launchReferenceBrowser({
      executablePath: "/example/chrome",
      signal: new AbortController().signal,
      presentation: "headless",
      mode: "hosted",
    }),
  ).rejects.toThrow("Launch intercepted");
  const options = launch.mock.calls[0][0]!;
  expect(options.headless).toBe("shell");
  expect(options.defaultViewport).toBeUndefined();
  expect(options.args).toContain("--proxy-server=http://127.0.0.1:9");
  expect(options.args).not.toContain("--window-size=1440,1000");
});
