import http from "node:http";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("puppeteer-core", () => ({ default: { launch: vi.fn() } }));
vi.mock("../src/server/runtime/browser", () => ({ browserExecutablePath: () => "/browser" }));
import { referenceResource } from "../src/server/requests/reference-resource";
import { lookup } from "node:dns/promises";
import puppeteer from "puppeteer-core";
import { captureReferencePage } from "../src/server/requests/reference-screenshot";

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
it("uses a fresh native local browser and closes it after navigation failure", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
  const page = {
    browser: () => browser,
    createCDPSession: vi.fn(async () => ({ on: vi.fn(), send: vi.fn(async () => {}) })),
    setDefaultTimeout: vi.fn(),
    setViewport: vi.fn(),
    setBypassServiceWorker: vi.fn(),
    setCacheEnabled: vi.fn(),
    setRequestInterception: vi.fn(),
    on: vi.fn(),
    goto: vi.fn().mockRejectedValue(Error("Navigation failed")),
  };
  const browser = {
    on: vi.fn(),
    newPage: vi.fn().mockResolvedValue(page),
    defaultBrowserContext: () => ({ setPermission: vi.fn() }),
    close: vi.fn(),
  };
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
      args: expect.not.arrayContaining(["--proxy-bypass-list=<-loopback>"]),
    }),
  );
  expect(page.setRequestInterception).toHaveBeenCalledWith(true);
  expect(page.setBypassServiceWorker).toHaveBeenCalledWith(true);
  expect(browser.close).toHaveBeenCalled();
});

it.each([
  {
    mode: "local" as const,
    address: "127.0.0.1",
    contentType: "text/javascript",
    size: 11_000_000,
    limit: undefined,
  },
  {
    mode: "local" as const,
    address: "127.0.0.1",
    contentType: "image/png",
    size: 11_000_000,
    limit: undefined,
  },
  {
    mode: "hosted" as const,
    address: "93.184.216.34",
    contentType: "application/javascript",
    size: 11_000_000,
    limit: undefined,
  },
  {
    mode: "hosted" as const,
    address: "93.184.216.34",
    contentType: "image/png",
    size: 33_000_000,
    limit: 32,
  },
  {
    mode: "local" as const,
    address: "127.0.0.1",
    contentType: "application/javascript",
    size: 33_000_000,
    limit: 32,
  },
])(
  "bounds resource size for $mode $contentType at $size bytes",
  async ({ mode, address, contentType, size, limit }) => {
    vi.mocked(lookup).mockResolvedValue([{ address, family: 4 }] as never);
    vi.spyOn(http, "get").mockImplementation(((
      _url: URL,
      _options: http.RequestOptions,
      callback: (response: IncomingMessage) => void,
    ) => {
      const response = new IncomingMessage(new Socket());
      response.statusCode = 200;
      response.headers = { "content-type": contentType };
      const emitter = new EventEmitter();
      const request = Object.assign(emitter, {
        destroy(error: Error) {
          emitter.emit("error", error);
          return emitter;
        },
      });
      queueMicrotask(() => {
        callback(response);
        response.push(Buffer.alloc(size));
        response.push(null);
      });
      return request as unknown as http.ClientRequest;
    }) as typeof http.get);
    const result = referenceResource(
      "http://example.com/app.js",
      new AbortController().signal,
      mode,
    );
    if (limit) await expect(result).rejects.toThrow(`exceeds ${limit} MB`);
    else expect((await result).body.length).toBe(size);
  },
);

it("rejects blank captures with useful JavaScript diagnostics and closes the browser", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
  const page = {
    browser: () => browser,
    createCDPSession: vi.fn(async () => ({ on: vi.fn(), send: vi.fn(async () => {}) })),
    setDefaultTimeout: vi.fn(),
    setViewport: vi.fn(),
    setBypassServiceWorker: vi.fn(),
    setCacheEnabled: vi.fn(),
    setRequestInterception: vi.fn(),
    on: vi.fn((name, callback) => {
      if (name === "pageerror") callback(Error("Application module failed to load"));
    }),
    goto: vi.fn(async () => ({ status: () => 200 })),
    waitForNetworkIdle: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(),
    waitForFunction: vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(Error("Still blank")),
    screenshot: vi.fn(),
  };
  const browser = {
    on: vi.fn(),
    newPage: vi.fn().mockResolvedValue(page),
    defaultBrowserContext: () => ({ setPermission: vi.fn() }),
    close: vi.fn(),
  };
  vi.mocked(puppeteer.launch).mockResolvedValue(browser as never);
  await expect(
    captureReferencePage(
      "http://localhost:4317/",
      "/tmp/blank.png",
      new AbortController().signal,
      "local",
    ),
  ).rejects.toThrow("Application module failed to load");
  expect(page.screenshot).not.toHaveBeenCalled();
  expect(browser.close).toHaveBeenCalled();
});

it("accounts concurrent response chunks before buffering and stops downloads when the shared budget rejects them", async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
  let received = 0;
  const consumed: number[] = [];
  const consumeBytes = (bytes: number) => {
    consumed.push(bytes);
    received += bytes;
    if (received > 6) throw Error("Shared session budget reached");
  };
  vi.spyOn(http, "get").mockImplementation(((
    _url: URL,
    _options: http.RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => {
    const response = new IncomingMessage(new Socket());
    response.statusCode = 200;
    response.headers = { "content-type": "application/octet-stream" };
    const emitter = new EventEmitter();
    const request = Object.assign(emitter, {
      destroy(error: Error) {
        emitter.emit("error", error);
        return emitter;
      },
    });
    queueMicrotask(() => {
      callback(response);
      response.push(Buffer.alloc(4));
      response.push(null);
    });
    return request as unknown as http.ClientRequest;
  }) as typeof http.get);
  const outcomes = await Promise.allSettled(
    [1, 2].map((index) =>
      referenceResource(
        `http://localhost/${index}`,
        new AbortController().signal,
        "local",
        {},
        consumeBytes,
      ),
    ),
  );
  expect(consumed).toEqual([4, 4]);
  expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((outcome) => outcome.status === "rejected")).toEqual([
    {
      status: "rejected",
      reason: expect.objectContaining({ message: "Shared session budget reached" }),
    },
  ]);
});
