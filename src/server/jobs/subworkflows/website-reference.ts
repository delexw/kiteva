import type { NativeCaptureRequest } from "../../capture/native-editor";
import { configureReferencePermissions } from "../../requests/reference-browser-permissions";
import { setTimeout as delay } from "node:timers/promises";
import type { ElementHandle } from "puppeteer-core";
import { createRemoteReferenceBrowser } from "../../capture/worker-client";
import puppeteer from "puppeteer-core";
import { startWebsiteCapture } from "./website-capture";
import type { CapturePresentationInput } from "../../capture/presentation";
import {
  inspectReferenceDocument,
  referencePageHasContent,
} from "../../requests/reference-page-inspection";
import { referenceResource, referenceResourceLimits } from "../../requests/reference-resource";
import { validateReferenceUrl } from "../../requests/reference-url";
import { CodedError } from "../../../shared/errors";
import { agentMode } from "../../runtime/config";
import { browserExecutablePath } from "../../runtime/browser";

export async function createLocalReferenceBrowser(
  origins: string[],
  signal: AbortSignal,
  mode: "local" | "hosted" = agentMode,
  desktop = process.env.KITEVA_CAPTURE_DESKTOP === "1",
) {
  const allowedOrigins = new Set(origins.map((url) => new URL(url).origin));
  const executablePath = browserExecutablePath(desktop);
  if (!executablePath)
    throw new CodedError(
      "REFERENCE_CAPTURE_FAILED",
      desktop
        ? "OpenScreen recording requires full Chrome or Chromium; configure VIDEO_BROWSER_PATH"
        : "Screenshot browser unavailable",
    );
  const browser = await puppeteer
    .launch({
      executablePath,
      headless: desktop ? false : "shell",
      ...(desktop
        ? {
            defaultViewport: null,
            // Puppeteer's extra startup tab opens a normal window alongside --app.
            ignoreDefaultArgs: ["about:blank"],
          }
        : {}),
      timeout: 10000,
      args: [
        ...(desktop
          ? ["--app=data:text/html,<title>Capture</title>", "--window-size=1440,1000"]
          : []),
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
  let recording: Awaited<ReturnType<typeof startWebsiteCapture>> | undefined;
  const editable = new Map<string, Awaited<ReturnType<typeof startWebsiteCapture>>>();
  const stop = () => {
    void (async () => {
      await recording?.close().catch(() => {});
      await browser.close().catch(() => {});
    })();
  };
  signal.addEventListener("abort", stop, { once: true });
  let requests = 0;
  let bytes = 0;
  let navigationError: unknown;
  const loadingErrors: string[] = [];
  try {
    signal.throwIfAborted();
    await configureReferencePermissions(browser.defaultBrowserContext(), origins, mode);
    signal.throwIfAborted();
    const page = desktop
      ? ((await browser.pages())[0] ?? (await browser.newPage()))
      : await browser.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => {
      loadingErrors.push(error instanceof Error ? error.message : String(error));
      if (loadingErrors.length > 5) loadingErrors.shift();
    });
    if (!desktop) await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
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
          if (
            ++requests > referenceResourceLimits.requests ||
            !["GET", "HEAD"].includes(request.method())
          )
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
          const response = await referenceResource(
            request.url(),
            signal,
            mode,
            request.headers(),
            (chunkBytes) => {
              bytes += chunkBytes;
              if (bytes > referenceResourceLimits.sessionBytes)
                throw Error(
                  `Reference session exceeds ${referenceResourceLimits.sessionBytes / 1_000_000} MB`,
                );
            },
          );
          await request.respond(response);
        } catch (error) {
          loadingErrors.push(
            `${request.resourceType()} ${new URL(request.url()).pathname}: ${error instanceof Error ? error.message : String(error)}`,
          );
          if (loadingErrors.length > 5) loadingErrors.shift();
          if (request.isNavigationRequest() && request.frame() === page.mainFrame())
            navigationError = error;
          if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => {});
        }
      })().catch(() => {});
    });
    async function settle() {
      signal.throwIfAborted();
      try {
        await page.waitForFunction(() => document.fonts.status === "loaded", { timeout: 5000 });
      } catch {
        signal.throwIfAborted();
        throw new CodedError(
          "REFERENCE_CAPTURE_FAILED",
          "Reference page fonts did not finish loading within 5 seconds.",
        );
      }
      if (navigationError) throw navigationError;
      try {
        await page.waitForFunction(referencePageHasContent, { timeout: 5000 });
      } catch {
        signal.throwIfAborted();
        throw new CodedError(
          "REFERENCE_CAPTURE_FAILED",
          `Reference page rendered no visible content. ${loadingErrors.join("; ") || "The application did not mount within 5 seconds."}`,
        );
      }
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
    let pointer = { x: 20, y: 20 };
    async function pointAndClick(target: ElementHandle<Element>) {
      if (!(await target.isIntersectingViewport({ threshold: 1 })))
        throw Error(
          "Control is outside the visible viewport; use scroll_page explicitly before interacting",
        );
      const box = await target.boundingBox();
      if (!box) throw Error("Control is not visible");
      const destination = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const cursorType = await target.evaluate((element) => {
        if (element.matches("input, textarea, [contenteditable=true]")) return "text";
        if (
          getComputedStyle(element).cursor === "pointer" ||
          element.closest("button, a[href], [role=button]")
        )
          return "pointer";
        return "arrow";
      });
      const origin = pointer;
      for (let step = 1; step <= 12; step++) {
        const x = origin.x + ((destination.x - origin.x) * step) / 12;
        const y = origin.y + ((destination.y - origin.y) * step) / 12;
        await page.mouse.move(x, y);
        recording?.cursor(x, y, "move", step === 12 ? cursorType : "arrow");
        if (recording) await delay(16, undefined, { signal });
      }
      pointer = destination;
      await page.mouse.click(pointer.x, pointer.y);
      recording?.cursor(pointer.x, pointer.y, "click", cursorType);
    }
    return {
      inspect,
      async click(controlId: string) {
        if (!/^\d+$/.test(controlId)) throw Error("Use a control ID from the latest inspection");
        const target = await page.$(`[data-reference-control="${controlId}"]`);
        if (!target) throw Error("Control was not found; inspect again");
        await pointAndClick(target);
        return inspect();
      },
      async fill(controlId: string, value: string) {
        if (!/^\d+$/.test(controlId)) throw Error("Use a control ID from the latest inspection");
        const target = await page.$(`[data-reference-control="${controlId}"]`);
        if (
          !target ||
          !(await target.evaluate(
            (element) =>
              element instanceof HTMLTextAreaElement ||
              (element instanceof HTMLInputElement &&
                ["text", "search", "url"].includes(element.type)),
          ))
        )
          throw Error(
            "Only ordinary text, search and URL fields can be filled; credentials are prohibited",
          );
        await pointAndClick(target);
        await target.evaluate((element) => {
          (element as HTMLInputElement | HTMLTextAreaElement).select();
        });
        await page.keyboard.type(value, { delay: 15 });
        return inspect();
      },
      async scroll(deltaY: number) {
        await page.mouse.wheel({ deltaY });
        return inspect();
      },
      async wait(milliseconds: number) {
        await delay(milliseconds, undefined, { signal });
      },
      async startRecording(
        workspace: string,
        presentation?: CapturePresentationInput,
      ): Promise<string> {
        if (recording) throw Error("Stop the current recording before starting another");
        if (!allowedOrigins.has(new URL(page.url()).origin))
          throw Error("Inspect a supplied website first");
        await settle();
        recording = await startWebsiteCapture(page, workspace, signal, desktop, presentation);
        return recording.id;
      },
      async prepareRecording(id: string) {
        if (!recording || recording.id !== id) throw Error("Use the active recording ID");
        const current = recording;
        recording = undefined;
        try {
          const take = await current.prepare();
          editable.set(id, current);
          return take;
        } catch (error) {
          await current.close().catch(() => {});
          throw error;
        }
      },
      async editRecording(id: string, request: NativeCaptureRequest) {
        const take = editable.get(id);
        if (!take) throw Error("Use a stopped take from this browser session");
        return take.edit(request);
      },
      async exportRecording(id: string) {
        const take = editable.get(id);
        if (!take) throw Error("Use a stopped take from this browser session");
        return take.export();
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
        await recording?.close().catch(() => {});
        await Promise.all([...editable.values()].map((take) => take.close().catch(() => {})));
        await browser.close();
      },
    };
  } catch (error) {
    signal.removeEventListener("abort", stop);
    await browser.close();
    throw error;
  }
}

/** A configured worker takes priority; otherwise recording uses the current desktop. */
export async function createReferenceBrowser(
  origins: string[],
  signal: AbortSignal,
  mode: "local" | "hosted" = agentMode,
  enableVideoCapture = false,
) {
  if (process.env.KITEVA_CAPTURE_WORKER_URL && process.env.KITEVA_CAPTURE_DESKTOP !== "1")
    return createRemoteReferenceBrowser(origins, signal, mode);
  return createLocalReferenceBrowser(
    origins,
    signal,
    mode,
    enableVideoCapture || process.env.KITEVA_CAPTURE_DESKTOP === "1",
  );
}
