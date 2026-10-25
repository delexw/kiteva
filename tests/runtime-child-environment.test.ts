import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { childEnvironment } from "../src/server/runtime/config";

afterEach(() => vi.unstubAllEnvs());

it("keeps package caches inside the job despite inherited host cache settings", () => {
  vi.stubEnv("npm_config_cache", "/host/npm-cache");
  vi.stubEnv("XDG_CACHE_HOME", "/host/cache");
  const workspace = path.resolve("project-workspace");
  expect(childEnvironment(workspace)).toMatchObject({
    npm_config_cache: path.join(workspace, ".cache", "npm"),
    XDG_CACHE_HOME: path.join(workspace, ".cache"),
    NODE_USE_ENV_PROXY: "1",
  });
});

it("passes the research credential without copying arbitrary host environment variables", () => {
  vi.stubEnv("ANYSEARCH_API_KEY", "test-research-credential");
  vi.stubEnv("UNRELATED_HOST_SECRET", "test-host-credential");
  const environment = childEnvironment();
  expect(environment).toMatchObject({ ANYSEARCH_API_KEY: "test-research-credential" });
  expect(environment).not.toHaveProperty("UNRELATED_HOST_SECRET");
  expect(environment).not.toHaveProperty("npm_config_cache");
});
