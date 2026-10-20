import { afterEach, expect, it, vi } from "vitest";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { createLocalReferenceBrowser } from "../src/server/jobs/subworkflows/website-reference";
import { createCaptureWorker } from "../src/server/capture/worker-server";
import { createRemoteReferenceBrowser } from "../src/server/capture/worker-client";

const token = "generic-worker-test-token-at-least-32-characters";
afterEach(() => {
  vi.unstubAllEnvs();
});
function fixtureBrowser() {
  const inspection = {
    title: "Example",
    text: "Example page",
    url: "https://example.com/",
    controls: [],
    sections: [],
  };
  let workspace = "";
  const recordingId = randomUUID();
  const name = `website-video-${randomUUID()}`;
  const browser: Awaited<ReturnType<typeof createLocalReferenceBrowser>> = {
    inspect: vi.fn(async () => inspection),
    click: vi.fn(async () => inspection),
    fill: vi.fn(async () => inspection),
    wait: vi.fn(async () => {}),
    scroll: vi.fn(async () => inspection),
    capture: vi.fn(async (destination) => {
      await writeFile(destination, "PNG fixture");
      return inspection;
    }),
    startRecording: vi.fn(async (destination) => {
      workspace = destination;
      return recordingId;
    }),
    exportRecording: vi.fn(async () => {
      await writeFile(path.join(workspace, "assets", `${name}.webm`), "OpenScreen fixture footage");
      await writeFile(path.join(workspace, "assets", `${name}.cursor.json`), "{}");
      return {
        assetPath: `assets/${name}.webm`,
        cursorPath: `assets/${name}.cursor.json`,
        url: inspection.url,
        duration: 2,
        width: 1440,
        height: 900,
        fps: 30 as const,
        silent: true as const,
      };
    }),
    prepareRecording: vi.fn(async () => ({
      kind: "editable_capture" as const,
      recordingId,
      duration: 2,
      tools: [],
    })),
    editRecording: vi.fn(async () => ({ kind: "native_capture" as const, content: [], data: {} })),
    close: vi.fn(async () => {}),
  };
  return browser;
}
it("authenticates sessions, isolates files, rejects traversal and closes owned browsers", async () => {
  const browser = fixtureBrowser();
  const app = createCaptureWorker(token, async () => browser);
  const headers = { authorization: `Bearer ${token}` };
  try {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/sessions",
          payload: { urls: ["https://example.com"], mode: "local" },
        })
      ).statusCode,
    ).toBe(401);
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      headers,
      payload: { urls: ["https://example.com"], mode: "local" },
    });
    const { id } = created.json();
    expect(created.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/sessions/${id}/actions`,
          headers,
          payload: { action: "wait", milliseconds: 1200 },
        })
      ).statusCode,
    ).toBe(200);
    expect(browser.wait).toHaveBeenCalledWith(1200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/sessions",
          headers,
          payload: { urls: ["https://example.com"], mode: "local" },
        })
      ).statusCode,
    ).toBe(429);
    expect(
      (await app.inject({ method: "GET", url: `/sessions/${id}/assets/secret.txt`, headers }))
        .statusCode,
    ).toBe(500);
    await app.inject({ method: "DELETE", url: `/sessions/${id}`, headers });
    expect(browser.close).toHaveBeenCalledOnce();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/sessions/${id}/actions`,
          headers,
          payload: { action: "inspect" },
        })
      ).statusCode,
    ).toBe(404);
  } finally {
    await app.close();
  }
});
it("transfers worker artifacts over HTTP and keeps interaction and recording in the same session", async () => {
  const browser = fixtureBrowser();
  const app = createCaptureWorker(token, async () => browser);
  const workspace = await mkdtemp(path.join(os.tmpdir(), "worker-client-"));
  const controller = new AbortController();
  await app.listen({ host: "127.0.0.1", port: 0 });
  vi.stubEnv("KITEVA_CAPTURE_WORKER_URL", app.listeningOrigin);
  vi.stubEnv("KITEVA_CAPTURE_WORKER_TOKEN", token);
  const client = await createRemoteReferenceBrowser(
    ["https://example.com"],
    controller.signal,
    "local",
  );
  try {
    expect((await client.inspect("https://example.com")).title).toBe("Example");
    const id = await client.startRecording(workspace, {
      cursorTheme: "glass-lens",
      cursorSize: 1.8,
      framing: { padding: 30, aspectRatio: "16:9" },
    });
    expect(browser.startRecording).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cursorTheme: "glass-lens",
        cursorSize: 1.8,
        framing: { padding: 30, aspectRatio: "16:9" },
      }),
    );
    await client.fill("1", "sample");
    await client.click("2");
    const take = await client.prepareRecording(id);
    expect(take).toMatchObject({ kind: "editable_capture", recordingId: id });
    expect(browser.exportRecording).not.toHaveBeenCalled();
    const nativeRequest = { operation: "getFrames" as const, arguments: { count: 2 } };
    expect(await client.editRecording(id, nativeRequest)).toMatchObject({ kind: "native_capture" });
    expect(browser.editRecording).toHaveBeenCalledWith(id, nativeRequest);
    const recording = await client.exportRecording(id);
    expect(await readFile(path.join(workspace, recording.assetPath), "utf8")).toBe(
      "OpenScreen fixture footage",
    );
    const screenshot = path.join(workspace, "screen.png");
    await client.capture(screenshot);
    expect(await readFile(screenshot, "utf8")).toBe("PNG fixture");
    expect(browser.prepareRecording).toHaveBeenCalledWith(id);
    expect(browser.exportRecording).toHaveBeenCalledWith(id);
    controller.abort();
    await vi.waitFor(() => expect(browser.close).toHaveBeenCalledOnce());
  } finally {
    await client.close();
    await app.close();
    await rm(workspace, { recursive: true, force: true });
  }
});
it("rejects an unencrypted remote worker or an absent authentication token", async () => {
  vi.stubEnv("KITEVA_CAPTURE_WORKER_URL", "http://example.com");
  await expect(
    createRemoteReferenceBrowser(["https://example.com"], new AbortController().signal, "local"),
  ).rejects.toThrow("HTTPS");
  vi.stubEnv("KITEVA_CAPTURE_WORKER_URL", "http://127.0.0.1:4330");
  vi.stubEnv("KITEVA_CAPTURE_WORKER_TOKEN", "");
  await expect(
    createRemoteReferenceBrowser(["https://example.com"], new AbortController().signal, "local"),
  ).rejects.toThrow("authentication token");
});
it("reserves worker capacity while the desktop browser is starting", async () => {
  let release!: () => void;
  const browser = fixtureBrowser();
  const create = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return browser;
  });
  const app = createCaptureWorker(token, create);
  const request = {
    method: "POST" as const,
    url: "/sessions",
    headers: { authorization: `Bearer ${token}` },
    payload: { urls: ["https://example.com"], mode: "local" },
  };
  try {
    const first = app.inject(request).then((response) => response);
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect((await app.inject(request)).statusCode).toBe(429);
    release();
    expect((await first).statusCode).toBe(200);
  } finally {
    release?.();
    await app.close();
  }
});
