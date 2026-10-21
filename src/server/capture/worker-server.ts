import Fastify from "fastify";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
  };
  const sessions = new Map<string, Session>();
  let starting = false;
  const sessionSchema = z.object({ id: z.string().uuid() });
  async function close(id: string) {
    const session = sessions.get(id);
    if (!session) return;
    sessions.delete(id);
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
      sessions.set(id, {
        browser,
        controller,
        workspace,
        queue: new WorkQueue(1),
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
  app.post("/sessions/:id/actions", { bodyLimit: 112 * 1024 * 1024 }, async (request, reply) => {
    const { id } = sessionSchema.parse(request.params);
    const session = sessions.get(id);
    if (!session) return reply.code(404).send({ error: "Capture session expired" });
    const action = CaptureActionSchema.parse(request.body);
    return session.queue.run(async () => {
      const browser = session.browser;
      switch (action.action) {
        case "browser":
          return browser.perform(
            action.request as import("../requests/reference-tool-registry").BrowserCapabilityRequest,
            session.workspace,
          );
        case "inspect":
          return browser.inspect(action.url);
        case "click":
          return browser.click(action.controlId);
        case "fill":
          return browser.fill(action.controlId, action.value);
        case "upload": {
          const directory = await mkdtemp(path.join(session.workspace, "upload-"));
          try {
            const files = await Promise.all(
              action.files.map(async (file, index) => {
                const folder = path.join(directory, String(index));
                await mkdir(folder);
                const destination = path.join(folder, file.name);
                const bytes = Buffer.from(file.base64, "base64");
                if (bytes.length > 10 * 1024 * 1024) throw Error("Upload exceeds 10 MiB");
                await writeFile(destination, bytes);
                return destination;
              }),
            );
            return await browser.upload(action.controlId, files);
          } finally {
            await rm(directory, { recursive: true, force: true });
          }
        }
        case "scroll":
          return browser.scroll(action.deltaY);
        case "wait":
          await browser.wait(action.milliseconds);
          return { milliseconds: action.milliseconds };
        case "start":
          return { id: await browser.startRecording(session.workspace, action.presentation) };
        case "prepare":
          return browser.prepareRecording(action.recordingId);
        case "edit":
          return browser.editRecording(action.recordingId, action.request);
        case "export":
          return browser.exportRecording(action.recordingId);
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
