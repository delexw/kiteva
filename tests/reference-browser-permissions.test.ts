import { afterEach, expect, it, vi } from "vitest";
import type { BrowserContext } from "puppeteer-core";
import { lookup } from "node:dns/promises";
import { configureReferencePermissions } from "../src/server/requests/reference-browser-permissions";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
afterEach(() => vi.resetAllMocks());

function context() {
  const setPermission = vi.fn().mockResolvedValue(undefined);
  return { setPermission } as unknown as BrowserContext;
}

it("pre-grants only loopback access to deduplicated supplied localhost origins", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
  const browser = context();
  await configureReferencePermissions(
    browser,
    ["http://localhost:4320/a", "http://localhost:4320/b"],
    "local",
  );
  expect(browser.setPermission).toHaveBeenNthCalledWith(
    1,
    "*",
    { permission: { name: "local-network" }, state: "denied" },
    { permission: { name: "loopback-network" }, state: "denied" },
  );
  expect(browser.setPermission).toHaveBeenNthCalledWith(2, "http://localhost:4320", {
    permission: { name: "loopback-network" },
    state: "granted",
  });
  expect(browser.setPermission).toHaveBeenCalledTimes(2);
});

it.each(["local", "hosted"] as const)(
  "does not grant public pages local network access in %s mode",
  async (mode) => {
    vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const browser = context();
    await configureReferencePermissions(browser, ["https://example.com"], mode);
    expect(browser.setPermission).toHaveBeenCalledTimes(1);
  },
);

it("rejects private network origins instead of suppressing prompts by granting them", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "192.168.1.2", family: 4 }] as never);
  const browser = context();
  await expect(
    configureReferencePermissions(browser, ["http://192.168.1.2"], "local"),
  ).rejects.toThrow("Private-network URL is not allowed");
  expect(browser.setPermission).toHaveBeenCalledTimes(1);
});

it("fails setup if Chrome cannot apply permission decisions", async () => {
  const browser = context();
  vi.mocked(browser.setPermission).mockRejectedValue(Error("Permission API unavailable"));
  await expect(
    configureReferencePermissions(browser, ["https://example.com"], "local"),
  ).rejects.toThrow("Permission API unavailable");
});
