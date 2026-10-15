import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { Store } from "../src/server/jobs/store";
import { RequestSchema } from "../src/shared/contracts";

it("closes the backend even while a browser is still listening to project events", async () => {
  const { app, store } = await createApp({ store: new Store(":memory:") });
  store.save({
    id: "project",
    createdAt: "2026-01-01",
    phase: "ready",
    request: RequestSchema.parse({ instructions: "An original story" }),
    candidates: [],
    jobs: [],
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as AddressInfo;
  let opened!: () => void;
  const open = new Promise<void>((resolve) => (opened = resolve));
  const ended = new Promise<number>((resolve, reject) => {
    request({ host: "127.0.0.1", port, path: "/api/runs/project/events" }, (response) => {
      opened();
      response.resume();
      response.on("end", () => resolve(response.statusCode || 0));
    })
      .on("error", reject)
      .end();
  });
  await open;
  await app.close();
  expect(await ended).toBe(200);
});
