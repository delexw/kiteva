import path from "node:path";
import { expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { Store } from "../src/server/jobs/store";
import { RequestSchema } from "../src/shared/contracts";
import { dataRoot } from "../src/server/runtime/config";
import { startAuthenticationBridge } from "../src/server/agents/capabilities/reference-browser/authentication-bridge";

it("exposes active sign-in requests through the real project API and rejects another project's actions", async () => {
  const { app, store } = await createApp({ store: new Store(":memory:") });
  for (const id of ["authentication-project", "other-project"])
    store.save({
      id,
      createdAt: "2026-01-01",
      phase: "preparing",
      request: RequestSchema.parse({ instructions: "Explain a product" }),
      candidates: [],
      jobs: [],
    });
  const controller = new AbortController();
  const bridge = await startAuthenticationBridge(
    path.join(dataRoot, "runs", "authentication-project", "workspace"),
    controller.signal,
    () => {
      store.emit(
        "authentication-project",
        "reference_authentication",
        "Website sign-in state updated",
      );
    },
  );
  const post = async (route: string, body: object) => {
    const response = await fetch(bridge.url + route, {
      method: "POST",
      headers: { authorization: `Bearer ${bridge.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json();
  };
  try {
    const { id } = (await post("/request", { origin: "https://example.org/protected" })) as {
      id: string;
    };
    const list = await app.inject({ url: "/api/runs/authentication-project/authentication" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([
      { id, origin: "https://example.org", message: expect.stringContaining("paused") },
    ]);
    expect((await app.inject({ url: "/api/runs/other-project/authentication" })).json()).toEqual(
      [],
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/runs/other-project/authentication/${id}`,
          payload: { action: "continue" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/runs/authentication-project/authentication/${id}`,
          payload: { action: "focus" },
        })
      ).statusCode,
    ).toBe(200);
    expect(await post("/action", { id })).toEqual({ action: "focus" });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/runs/authentication-project/authentication/${id}`,
          payload: { action: "continue" },
        })
      ).statusCode,
    ).toBe(200);
    expect(await post("/action", { id })).toEqual({ action: "continue" });
    await post("/status", { id, complete: true });
    expect(
      (await app.inject({ url: "/api/runs/authentication-project/authentication" })).json(),
    ).toEqual([]);
  } finally {
    controller.abort();
    await bridge.close();
    await app.close();
  }
});
