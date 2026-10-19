import { createRemoteReferenceBrowser } from "../../capture/worker-client";
import puppeteer from "puppeteer-core";
import { startWebsiteCapture } from "./website-capture";
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
      ...(desktop ? { defaultViewport: null } : {}),
      timeout: 10000,
      args: [
        ...(desktop ? ["--app=about:blank", "--window-size=1440,1000"] : []),
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
  const stop = () => {
    void (async () => {
      await recording?.discard().catch(() => {});
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
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});
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
    return {
      inspect,
      async click(controlId: string) {
        if (!/^\d+$/.test(controlId)) throw Error("Use a control ID from the latest inspection");
        const target = await page.$(`[data-reference-control="${controlId}"]`);
        if (!target) throw Error("Control was not found; inspect again");
        await target.scrollIntoView();
        const box = await target.boundingBox();
        if (!box) throw Error("Control is not visible");
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y, { steps: 8 });
        recording?.cursor(x, y, "move");
        await page.mouse.click(x, y);
        recording?.cursor(x, y, "click");
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
        await target.focus();
        await target.evaluate((element) => {
          const field = element as HTMLInputElement | HTMLTextAreaElement;
          field.select();
        });
        await page.keyboard.type(value, { delay: 15 });
        return inspect();
      },
      async scroll(deltaY: number) {
        await page.mouse.wheel({ deltaY });
        return inspect();
      },
      async startRecording(workspace: string): Promise<string> {
        if (recording) throw Error("Stop the current recording before starting another");
        if (!allowedOrigins.has(new URL(page.url()).origin))
          throw Error("Inspect a supplied website first");
        await settle();
        recording = await startWebsiteCapture(page, workspace, signal, desktop);
        return recording.id;
      },
      async stopRecording(id: string) {
        if (!recording || recording.id !== id) throw Error("Use the active recording ID");
        const current = recording;
        recording = undefined;
        return current.save();
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
        await recording?.discard().catch(() => {});
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
