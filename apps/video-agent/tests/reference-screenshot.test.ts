import http from "node:http";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("puppeteer-core", () => ({ default: { launch: vi.fn() } }));
vi.mock("../src/server/runtime/browser", () => ({ browserExecutablePath: () => "/browser" }));
import { lookup } from "node:dns/promises";
import puppeteer from "puppeteer-core";
import {
  captureReferencePage,
  referenceResource,
} from "../src/server/requests/reference-screenshot";

afterEach(() => vi.restoreAllMocks());
it("pins screenshot resource connections to validated DNS and preserves binary responses", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
  const body = Buffer.from([137, 80, 78, 71, 0, 255]);
  vi.spyOn(http, "get").mockImplementation(((
    _url: URL,
    options: http.RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => {
    expect(options.lookup).toBeTypeOf("function");
    expect(options.headers).toMatchObject({ "accept-encoding": "identity" });
    const response = new IncomingMessage(new Socket());
    response.statusCode = 200;
    response.headers = {
      "content-type": "image/png",
      "content-length": "6",
      "transfer-encoding": "chunked",
    };
    queueMicrotask(() => {
      callback(response);
      response.push(body);
      response.push(null);
    });
    return new EventEmitter() as http.ClientRequest;
  }) as typeof http.get);
  const result = await referenceResource(
    "http://localhost:4317/image.png",
    new AbortController().signal,
    "local",
  );
  expect(result.body).toEqual(body);
  expect(result.headers).toEqual({ "content-type": "image/png" });
});
it("rejects a hosted redirect or subresource targeting localhost before connecting", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "::1", family: 6 }] as never);
  const get = vi.spyOn(http, "get");
  await expect(
    referenceResource("http://localhost:4317/private", new AbortController().signal, "hosted"),
  ).rejects.toMatchObject({ code: "LOCAL_URL_REQUIRES_LOCAL_AGENT" });
  expect(get).not.toHaveBeenCalled();
});
it.each(["10.0.0.1", "169.254.169.254"])(
  "blocks private subresources at %s in local mode",
  async (address) => {
    vi.mocked(lookup).mockResolvedValue([{ address, family: 4 }] as never);
    await expect(
      referenceResource(`http://${address}/`, new AbortController().signal, "local"),
    ).rejects.toMatchObject({ code: "PUBLIC_URL_REQUIRED" });
  },
);
it("never launches the capture browser for hosted localhost references", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
  vi.mocked(puppeteer.launch).mockClear();
  await expect(
    captureReferencePage(
      "http://localhost:4317/",
      "/tmp/reference.png",
      new AbortController().signal,
      "hosted",
    ),
  ).rejects.toMatchObject({ code: "LOCAL_URL_REQUIRES_LOCAL_AGENT" });
  expect(puppeteer.launch).not.toHaveBeenCalled();
});
it("uses a fresh proxied browser, waits for the rendered page, and closes it after failure", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
  const page = {
    setDefaultTimeout: vi.fn(),
    setViewport: vi.fn(),
    setBypassServiceWorker: vi.fn(),
    setRequestInterception: vi.fn(),
    on: vi.fn(),
    goto: vi.fn().mockRejectedValue(Error("Navigation failed")),
  };
  const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
  vi.mocked(puppeteer.launch).mockResolvedValue(browser as never);
  await expect(
    captureReferencePage(
      "http://localhost:4317/",
      "/tmp/reference.png",
      new AbortController().signal,
      "local",
    ),
  ).rejects.toMatchObject({ code: "REFERENCE_CAPTURE_FAILED" });
  expect(puppeteer.launch).toHaveBeenLastCalledWith(
    expect.objectContaining({
      executablePath: "/browser",
      headless: "shell",
      args: expect.arrayContaining(["--proxy-bypass-list=<-loopback>"]),
    }),
  );
  expect(page.setRequestInterception).toHaveBeenCalledWith(true);
  expect(page.setBypassServiceWorker).toHaveBeenCalledWith(true);
  expect(browser.close).toHaveBeenCalled();
});
