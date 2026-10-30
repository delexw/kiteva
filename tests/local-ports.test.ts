import { expect, it } from "vitest";
import {
  DEFAULT_BACKEND_PORT,
  DEFAULT_WEB_PORT,
  resolveLocalPorts,
} from "../src/shared/local-ports";
import configuration from "../vite.config";

it("uses dedicated distinct defaults for both services", () => {
  expect(resolveLocalPorts()).toEqual({ backend: 18417, web: 18419 });
  expect(DEFAULT_BACKEND_PORT).not.toBe(DEFAULT_WEB_PORT);
});

it("only changes ports through the dedicated environment overrides", () => {
  expect(resolveLocalPorts({ PORT: "3000" })).toEqual({
    backend: DEFAULT_BACKEND_PORT,
    web: DEFAULT_WEB_PORT,
  });
  expect(resolveLocalPorts({ VIDEO_AGENT_PORT: "19417", VIDEO_AGENT_WEB_PORT: "19419" })).toEqual({
    backend: 19417,
    web: 19419,
  });
});

it.each(["0", "NaN", "65536", "18417.5"])(
  "rejects invalid port %s without silently picking another",
  (value) => {
    expect(() => resolveLocalPorts({ VIDEO_AGENT_PORT: value })).toThrow();
    expect(() => resolveLocalPorts({ VIDEO_AGENT_WEB_PORT: value })).toThrow();
  },
);

it("rejects colliding frontend and backend ports", () => {
  expect(() =>
    resolveLocalPorts({ VIDEO_AGENT_PORT: "19417", VIDEO_AGENT_WEB_PORT: "19417" }),
  ).toThrow("must differ");
});

it("keeps the development listener strict and its backend proxy aligned", () => {
  const configured = configuration({ command: "serve", mode: "development" });
  expect(configured.server?.strictPort).toBe(true);
  expect(configured.server?.port).toBe(DEFAULT_WEB_PORT);
  expect(configured.server?.proxy).toMatchObject({
    "/api": `http://127.0.0.1:${DEFAULT_BACKEND_PORT}`,
  });
});
