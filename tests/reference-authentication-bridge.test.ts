import { credentialEnvironmentVariables } from "../src/server/runtime/credential-environment";
import { expect, it, vi } from "vitest";
import {
  startAuthenticationBridge,
  pendingReferenceAuthentications,
  answerReferenceAuthentication,
} from "../src/server/agents/capabilities/reference-browser/authentication-bridge";
import { waitForProjectAuthentication } from "../src/server/agents/capabilities/reference-browser/authentication-client";

it("pauses for any origin, focuses on demand, validates before continuing, and isolates projects", async () => {
  const controller = new AbortController();
  const changes = vi.fn();
  const bridge = await startAuthenticationBridge("/tmp/project-a/run", controller.signal, changes);
  vi.stubEnv("KITEVA_AUTH_BRIDGE_URL", bridge.url);
  vi.stubEnv(credentialEnvironmentVariables.authenticationBridgeToken, bridge.token);
  const focus = vi.fn(async () => {});
  let authenticated = false,
    finished = false;
  const waiting = waitForProjectAuthentication(
    "https://example.com/protected",
    controller.signal,
    focus,
    async () => {
      if (!authenticated) throw Error("Not signed in");
    },
  ).then((value) => {
    finished = true;
    return value;
  });
  try {
    await vi.waitFor(() =>
      expect(pendingReferenceAuthentications("/tmp/project-a")).toHaveLength(1),
    );
    const request = pendingReferenceAuthentications("/tmp/project-a")[0];
    expect(request.origin).toBe("https://example.com");
    expect(finished).toBe(false);
    expect(pendingReferenceAuthentications("/tmp/project")).toEqual([]);
    expect(answerReferenceAuthentication("/tmp/project-b", request.id, "continue")).toBe(false);
    expect(answerReferenceAuthentication("/tmp/project-a", request.id, "focus")).toBe(true);
    await vi.waitFor(() => expect(focus).toHaveBeenCalledOnce());
    answerReferenceAuthentication("/tmp/project-a", request.id, "continue");
    await vi.waitFor(() =>
      expect(pendingReferenceAuthentications("/tmp/project-a")[0].message).toContain(
        "not complete",
      ),
    );
    expect(finished).toBe(false);
    authenticated = true;
    // Completing login itself is not authorization to let the model proceed.
    expect(finished).toBe(false);
    answerReferenceAuthentication("/tmp/project-a", request.id, "continue");
    expect(await waiting).toBe(true);
    expect(pendingReferenceAuthentications("/tmp/project-a")).toEqual([]);
    expect(changes.mock.calls.length).toBeGreaterThanOrEqual(3);
  } finally {
    controller.abort();
    await bridge.close();
    vi.unstubAllEnvs();
  }
});

it("rejects unauthenticated IPC and removes a pending handoff on project cancellation", async () => {
  const controller = new AbortController();
  const bridge = await startAuthenticationBridge(
    "/tmp/project-stop/run",
    controller.signal,
    () => {},
  );
  vi.stubEnv("KITEVA_AUTH_BRIDGE_URL", bridge.url);
  vi.stubEnv(credentialEnvironmentVariables.authenticationBridgeToken, bridge.token);
  try {
    expect((await fetch(bridge.url + "/request", { method: "POST", body: "{}" })).status).toBe(403);
    const waiting = waitForProjectAuthentication(
      "https://example.org",
      controller.signal,
      async () => {},
      async () => {},
    );
    void waiting.catch(() => {});
    await vi.waitFor(() =>
      expect(pendingReferenceAuthentications("/tmp/project-stop")).toHaveLength(1),
    );
    controller.abort(Error("Stop project"));
    await expect(waiting).rejects.toThrow();
    await bridge.close();
    expect(pendingReferenceAuthentications("/tmp/project-stop")).toEqual([]);
    await expect(fetch(bridge.url)).rejects.toThrow();
  } finally {
    controller.abort();
    await bridge.close();
    vi.unstubAllEnvs();
  }
});

it("keeps an unanswered handoff alive with headers and body heartbeats without resuming it", async () => {
  const controller = new AbortController();
  const bridge = await startAuthenticationBridge(
    "/tmp/heartbeat-project",
    controller.signal,
    () => {},
  );
  const post = (route: string, body: object) =>
    fetch(bridge.url + route, {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: `Bearer ${bridge.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const { id } = (await (await post("/request", { origin: "https://example.net" })).json()) as {
      id: string;
    };
    // The request must produce headers before any user action.
    const headerDeadline = setTimeout(
      () => controller.abort(Error("Missing immediate response headers")),
      2000,
    );
    let response: Response;
    try {
      response = await post("/action", { id });
    } finally {
      clearTimeout(headerDeadline);
    }
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("\n");
    expect(first.done).toBe(false);
    expect(pendingReferenceAuthentications("/tmp/heartbeat-project")).toHaveLength(1);
    answerReferenceAuthentication("/tmp/heartbeat-project", id, "continue");
    let text = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    expect(JSON.parse(text)).toEqual({ action: "continue" });
    await post("/status", { id, complete: true });
  } finally {
    controller.abort();
    await bridge.close();
  }
}, 25000);
