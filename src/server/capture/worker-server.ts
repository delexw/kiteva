import { videoRenderTimeoutMs } from "../rendering/timeouts";
import Fastify from "fastify";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { WorkQueue } from "../jobs/queue";
import { createLocalReferenceBrowser } from "../jobs/subworkflows/website-reference";
import {
  CaptureActionSchema,
  CaptureSessionSchema,
  WorkerAssetNameSchema,
} from "./worker-contract";

/** Run only inside a dedicated, logged-in desktop VM, never the user's main desktop. */
export function createCaptureWorker(token: string, createBrowser = createLocalReferenceBrowser) {
  if (token.length < 32) throw Error("The capture worker needs a token of at least 32 characters");
  const app = Fastify({ bodyLimit: 16000 });
  type Session = {
    browser: Awaited<ReturnType<typeof createBrowser>>;
    controller: AbortController;
    workspace: string;
    queue: WorkQueue;
    timer: NodeJS.Timeout;
    calls: number;
  };
  const sessions = new Map<string, Session>();
  let starting = false;
  const sessionSchema = z.object({ id: z.string().uuid() });
  async function close(id: string) {
    const session = sessions.get(id);
    if (!session) return;
    sessions.delete(id);
    clearTimeout(session.timer);
    session.controller.abort();
    try {
      await session.browser.close();
    } finally {
      await rm(session.workspace, { recursive: true, force: true });
    }
  }
  app.addHook("onRequest", async (request, reply) => {
    const supplied = Buffer.from(request.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return reply.code(401).send({ error: "Capture worker authentication required" });
  });
  app.post("/sessions", async (request, reply) => {
    if (starting || sessions.size >= 1)
      return reply.code(429).send({ error: "Capture worker is busy" });
    const input = CaptureSessionSchema.parse(request.body);
    const controller = new AbortController();
    starting = true;
    let workspace: string | undefined;
    try {
      workspace = await mkdtemp(path.join(os.tmpdir(), "kiteva-desktop-"));
      await mkdir(path.join(workspace, "assets"));
      const browser = await createBrowser(input.urls, controller.signal, input.mode);
      const id = randomUUID();
      const timer = setTimeout(() => {
        void close(id).catch(() => {});
      }, videoRenderTimeoutMs + 180000);
      timer.unref();
      sessions.set(id, {
        browser,
        controller,
        workspace,
        queue: new WorkQueue(1),
        timer,
        calls: 0,
      });
      return { id };
    } catch (error) {
      controller.abort();
      if (workspace) await rm(workspace, { recursive: true, force: true });
      throw error;
    } finally {
      starting = false;
    }
  });
  app.post("/sessions/:id/actions", async (request, reply) => {
    const { id } = sessionSchema.parse(request.params);
    const session = sessions.get(id);
    if (!session) return reply.code(404).send({ error: "Capture session expired" });
    const action = CaptureActionSchema.parse(request.body);
    session.timer.refresh();
    return session.queue.run(async () => {
      if (++session.calls > 80 && action.action !== "stop")
        throw Error("Capture session call limit reached");
      const browser = session.browser;
      switch (action.action) {
        case "inspect":
          return browser.inspect(action.url);
        case "click":
          return browser.click(action.controlId);
        case "fill":
          return browser.fill(action.controlId, action.value);
        case "scroll":
          return browser.scroll(action.deltaY);
        case "wait":
          await browser.wait(action.milliseconds);
          return { milliseconds: action.milliseconds };
        case "start":
          return { id: await browser.startRecording(session.workspace, action.presentation) };
        case "stop":
          return browser.stopRecording(action.recordingId);
        case "capture": {
          const name = `website-reference-${randomUUID()}.png`;
          return {
            ...(await browser.capture(
              path.join(session.workspace, "assets", name),
              action.selector,
            )),
            name,
          };
        }
      }
    });
  });
  app.get("/sessions/:id/assets/:name", async (request, reply) => {
    const { id, name } = sessionSchema
      .extend({ name: WorkerAssetNameSchema })
      .parse(request.params);
    const session = sessions.get(id);
    if (!session) return reply.code(404).send({ error: "Capture session expired" });
    return reply
      .type("application/octet-stream")
      .send(createReadStream(path.join(session.workspace, "assets", name)));
  });
  app.delete("/sessions/:id", async (request) => {
    await close(sessionSchema.parse(request.params).id);
    return { closed: true };
  });
  app.addHook("onClose", async () => {
    await Promise.all([...sessions.keys()].map(close));
  });
  return app;
}
