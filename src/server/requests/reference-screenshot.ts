import { inspectReferenceDocument } from "./reference-page-inspection";
import http from "node:http";
import https from "node:https";
import puppeteer from "puppeteer-core";
import { CodedError } from "../../shared/errors";
import { agentMode } from "../runtime/config";
import { browserExecutablePath } from "../runtime/browser";
import { validateReferenceUrl } from "./reference-url";

// Chromium receives responses through Node so DNS stays pinned to validated addresses.
// Its proxy has no upstream: traffic that bypasses interception cannot reach a website.
export async function referenceResource(
  value: string,
  signal: AbortSignal,
  mode: "local" | "hosted",
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const { url, addresses } = await validateReferenceUrl(value, mode);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const get = url.protocol === "https:" ? https.get : http.get;
    const request = get(
      url,
      {
        signal,
        timeout: 10000,
        headers: {
          accept: headers.accept || "*/*",
          "accept-encoding": "identity",
          ...(headers["user-agent"] ? { "user-agent": headers["user-agent"] } : {}),
          ...(headers.cookie ? { cookie: headers.cookie } : {}),
        },
        lookup: ((_host, _options, callback) =>
          callback(null, addresses)) as http.RequestOptions["lookup"],
      },
      (response) => {
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 10_000_000) request.destroy(Error("Reference resource exceeds 10 MB"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          const responseHeaders: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            if (
              value !== undefined &&
              !["transfer-encoding", "connection", "content-length"].includes(name)
            )
              responseHeaders[name] = Array.isArray(value) ? value.join("\n") : value;
          }
          resolve({
            status: response.statusCode || 502,
            headers: responseHeaders,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    request.on("error", reject);
    request.on("timeout", () => request.destroy(Error("Reference resource timed out")));
  });
}

export async function createReferenceBrowser(
  origins: string[],
  signal: AbortSignal,
  mode: "local" | "hosted" = agentMode,
) {
  const allowedOrigins = new Set(origins.map((url) => new URL(url).origin));
  const executablePath = browserExecutablePath();
  if (!executablePath)
    throw new CodedError("REFERENCE_CAPTURE_FAILED", "Screenshot browser unavailable");
  const browser = await puppeteer
    .launch({
      executablePath,
      headless: "shell",
      timeout: 10000,
      args: [
        "--proxy-server=http://127.0.0.1:9",
        "--proxy-bypass-list=<-loopback>",
        "--disable-quic",
        "--disable-background-networking",
      ],
    })
    .catch((error: unknown) => {
      throw new CodedError(
        "REFERENCE_CAPTURE_FAILED",
        error instanceof Error ? error.message : "Browser launch failed",
      );
    });
  const stop = () => {
    void browser.close().catch(() => {});
  };
  signal.addEventListener("abort", stop, { once: true });
  let requests = 0;
  let bytes = 0;
  let navigationError: unknown;
  try {
    signal.throwIfAborted();
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void (async () => {
        if (request.isInterceptResolutionHandled()) return;
        if (request.url().startsWith("data:") || request.url().startsWith("blob:")) {
          await request.continue();
          return;
        }
        try {
          if (++requests > 500 || !["GET", "HEAD"].includes(request.method()))
            throw Error("Read-only browser request rejected");
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame() &&
            !allowedOrigins.has(new URL(request.url()).origin)
          )
            throw new CodedError(
              "PUBLIC_URL_REQUIRED",
              "Navigation must stay on supplied website origins",
            );
          const response = await referenceResource(request.url(), signal, mode, request.headers());
          bytes += response.body.length;
          if (bytes > 80_000_000) throw Error("Reference session exceeds 80 MB");
          await request.respond(response);
        } catch (error) {
          if (request.isNavigationRequest() && request.frame() === page.mainFrame())
            navigationError = error;
          if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => {});
        }
      })().catch(() => {});
    });
    async function settle() {
      signal.throwIfAborted();
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      if (navigationError) throw navigationError;
    }
    async function inspect(url?: string) {
      if (url) {
        if (!allowedOrigins.has(new URL(url).origin))
          throw new CodedError(
            "PUBLIC_URL_REQUIRED",
            "Navigation must stay on supplied website origins",
          );
        await validateReferenceUrl(url, mode);
        navigationError = undefined;
        const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
        if (navigationError) throw navigationError;
        if (!response || response.status() >= 400)
          throw Error("Reference page could not be opened");
      }
      await settle();
      return page.evaluate(inspectReferenceDocument);
    }
    return {
      inspect,
      async click(controlId: string) {
        if (!/^\d+$/.test(controlId)) throw Error("Use a control ID from the latest inspection");
        await page.click(`[data-reference-control="${controlId}"]`);
        return inspect();
      },
      async capture(screenshotPath: string, selector?: string) {
        if (!allowedOrigins.has(new URL(page.url()).origin))
          throw Error("Inspect a supplied website before capturing it");
        await settle();
        const target = selector ? await page.$(selector) : page;
        if (!target) throw Error("Screenshot section was not found; inspect the page again");
        await target.screenshot({ path: screenshotPath, type: "png" });
        return {
          title: await page.title(),
          url: page.url(),
          text: await page.evaluate(() => document.body.innerText.slice(0, 16000)),
        };
      },
      async close() {
        signal.removeEventListener("abort", stop);
        await browser.close();
      },
    };
  } catch (error) {
    signal.removeEventListener("abort", stop);
    await browser.close();
    throw error;
  }
}

export async function captureReferencePage(
  value: string,
  screenshotPath: string,
  signal: AbortSignal,
  mode: "local" | "hosted" = agentMode,
) {
  await validateReferenceUrl(value, mode);
  signal.throwIfAborted();
  const browser = await createReferenceBrowser(
    [value],
    AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    mode,
  );
  try {
    await browser.inspect(value);
    return await browser.capture(screenshotPath);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof CodedError) throw error;
    throw new CodedError(
      "REFERENCE_CAPTURE_FAILED",
      error instanceof Error ? error.message : "Capture failed",
    );
  } finally {
    await browser.close();
  }
}
