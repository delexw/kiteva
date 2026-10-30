import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_BACKEND_PORT, DEFAULT_WEB_PORT } from "../src/shared/local-ports";
import {
  cavemanSettings,
  codexCavemanProvider,
  cavemanRuntime,
} from "../src/server/agents/caveman";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("enables app-local compression by default and provides an explicit comparison off switch", () => {
  expect(cavemanSettings({})).toMatchObject({
    enabled: true,
    port: 4321,
    url: "http://127.0.0.1:4321",
  });
  expect(cavemanSettings({ VIDEO_CAVEMAN_ENABLED: "false" }).enabled).toBe(false);
});
it.each([String(DEFAULT_BACKEND_PORT), String(DEFAULT_WEB_PORT), "5173", "0", "NaN", "65536"])(
  "rejects unsafe or invalid port %s",
  (port) => {
    expect(() => cavemanSettings({ VIDEO_CAVEMAN_PORT: port })).toThrow("VIDEO_CAVEMAN_PORT");
  },
);
it("rejects compression ports that collide with explicit application overrides", () => {
  expect(() => cavemanSettings({ VIDEO_AGENT_PORT: "19417", VIDEO_CAVEMAN_PORT: "19417" })).toThrow(
    "VIDEO_CAVEMAN_PORT",
  );
  expect(() =>
    cavemanSettings({ VIDEO_AGENT_WEB_PORT: "19419", VIDEO_CAVEMAN_PORT: "19419" }),
  ).toThrow("VIDEO_CAVEMAN_PORT");
});
it("preserves Codex subscription and API-key authentication routes without exposing credentials", () => {
  expect(codexCavemanProvider("http://127.0.0.1:4321", { auth_mode: "chatgpt" }).base_url).toBe(
    "http://127.0.0.1:4321/chatgpt",
  );
  expect(codexCavemanProvider("http://127.0.0.1:4321", { tokens: {} }).base_url).toContain(
    "/chatgpt",
  );
  expect(
    codexCavemanProvider("http://127.0.0.1:4321", { auth_mode: "apikey", tokens: {} }).base_url,
  ).toContain("/w/codex/v1");
  expect(codexCavemanProvider("http://127.0.0.1:4321", {}).wire_api).toBe("responses");
});
it("does not contact or start a proxy when explicitly disabled", async () => {
  vi.stubEnv("VIDEO_CAVEMAN_ENABLED", "false");
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  expect(await cavemanRuntime(new AbortController().signal)).toBeUndefined();
  expect(request).not.toHaveBeenCalled();
});
it("rejects an unrelated listener rather than sending model traffic through it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ service: "other" }) }),
  );
  await expect(cavemanRuntime(new AbortController().signal)).rejects.toThrow(
    "not the app-local compression runtime",
  );
});
