import { beforeEach, vi } from "vitest";

const localFetch = globalThis.fetch;

/** Tests may reach local fixtures; external APIs require an explicit mocked transport. */
function installLocalFetch() {
  vi.stubGlobal("fetch", (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      return Promise.reject(Error("Tests must not call real external APIs. Mock the transport."));
    return localFetch(input, init);
  });
}

installLocalFetch();
beforeEach(installLocalFetch);
