import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: vi.fn(async () =>
    JSON.stringify({
      schema: "caveman.proxy.run.v1",
      mode: "compress",
      recovery_via_mcp: true,
      port: 4321,
    }),
  ),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("cancels a waiting caller promptly without cancelling shared proxy startup for another caller", async () => {
  vi.resetModules();
  vi.stubEnv("VIDEO_CAVEMAN_ENABLED", "true");
  vi.stubEnv("VIDEO_CAVEMAN_PORT", "4321");
  let ready!: (response: Response) => void;
  const startupProbe = new Promise<Response>((resolve) => {
    ready = resolve;
  });
  const healthy = () => Response.json({ service: "caveman-proxy", ok: true });
  const request = vi
    .fn()
    .mockImplementationOnce(() => startupProbe)
    .mockImplementation(async () => healthy());
  vi.stubGlobal("fetch", request);
  const { cavemanRuntime, stopCaveman } = await import("../src/server/agents/caveman");
  const first = new AbortController();
  const reason = new Error("Cancel only this job");
  const cancelled = cavemanRuntime(first.signal);
  const second = cavemanRuntime(new AbortController().signal);
  const rejected = expect(cancelled).rejects.toBe(reason);
  first.abort(reason);
  await rejected;
  expect(request).toHaveBeenCalledTimes(1);
  ready(healthy());
  expect(await second).toMatchObject({ url: "http://127.0.0.1:4321" });
  await stopCaveman();
});
