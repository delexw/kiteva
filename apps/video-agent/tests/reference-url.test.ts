import { afterEach, expect, it, vi } from "vitest";
import http from "node:http";
import { EventEmitter } from "node:events";
import { Socket } from "node:net";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
import { lookup } from "node:dns/promises";
import { isLoopbackAddress, readReferenceUrl } from "../src/server/requests/inputs";
import { customerErrorMessage } from "../src/client/customer-messages";
afterEach(() => vi.restoreAllMocks());
it.each(["127.0.0.1", "127.0.0.2", "::1", "::ffff:127.0.0.1"])(
  "recognises loopback %s",
  (address) => expect(isLoopbackAddress(address)).toBe(true),
);
it.each(["10.0.0.1", "169.254.169.254", "1.1.1.1", "invalid"])(
  "does not treat %s as localhost",
  (address) => expect(isLoopbackAddress(address)).toBe(false),
);
it("reads local development ports and pins the resolved address", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
  const get = vi.spyOn(http, "get").mockImplementation(((
    url: URL,
    options: http.RequestOptions,
    callback: (res: http.IncomingMessage) => void,
  ) => {
    expect(url.port).toBe("4317");
    expect(options.lookup).toBeTypeOf("function");
    const response = new http.IncomingMessage(new Socket());
    response.statusCode = 200;
    response.headers = { "content-type": "text/html" };
    queueMicrotask(() => {
      callback(response);
      response.push("<h1>Local reference</h1><script>private implementation</script>");
      response.push(null);
    });
    return new EventEmitter() as http.ClientRequest;
  }) as typeof http.get);
  expect(
    await readReferenceUrl("http://localhost:4317/", new AbortController().signal, "local"),
  ).toBe(" Local reference ");
  expect(get).toHaveBeenCalledOnce();
});
it("rejects localhost in hosted mode before any connection", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
  const get = vi.spyOn(http, "get");
  await expect(
    readReferenceUrl("http://localhost:4317/", new AbortController().signal, "hosted"),
  ).rejects.toMatchObject({ code: "LOCAL_URL_REQUIRES_LOCAL_AGENT" });
  expect(get).not.toHaveBeenCalled();
  expect(customerErrorMessage("LOCAL_URL_REQUIRES_LOCAL_AGENT")).toContain("local agent");
});
it("keeps other private networks blocked even in local mode", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "169.254.169.254", family: 4 }] as never);
  await expect(
    readReferenceUrl("http://169.254.169.254/", new AbortController().signal, "local"),
  ).rejects.toMatchObject({ code: "PUBLIC_URL_REQUIRED" });
});
it("enforces hosted mode again after a public URL redirects to localhost", async () => {
  vi.mocked(lookup)
    .mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }] as never)
    .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as never);
  const get = vi.spyOn(http, "get").mockImplementation(((
    _url: URL,
    _options: http.RequestOptions,
    callback: (res: http.IncomingMessage) => void,
  ) => {
    const response = new http.IncomingMessage(new Socket());
    response.statusCode = 302;
    response.headers = { location: "http://localhost:4317/" };
    queueMicrotask(() => {
      callback(response);
      response.push(null);
    });
    return new EventEmitter() as http.ClientRequest;
  }) as typeof http.get);
  await expect(
    readReferenceUrl("http://example.com/", new AbortController().signal, "hosted"),
  ).rejects.toMatchObject({ code: "LOCAL_URL_REQUIRES_LOCAL_AGENT" });
  expect(get).toHaveBeenCalledOnce();
});
