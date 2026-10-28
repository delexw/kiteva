import { acquireReferenceProfile } from "../../agents/capabilities/reference-browser/profile";
import { launchReferenceBrowser } from "../../agents/capabilities/reference-browser/launch";
import { ReferenceAuthenticationError } from "../../agents/capabilities/reference-browser/authentication-error";
import { prepareProjectRuntime } from "../../runtime/project-files";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createProcessScope } from "../../runtime/process-scope";
import {
  createBrowserCapabilities,
  runWithBrowserDialog,
} from "../../agents/capabilities/reference-browser/runtime";
import type { BrowserCapabilityRequest } from "../../agents/capabilities/reference-browser/tool-registry";
import type { NativeCaptureRequest } from "../../capture/native-editor";
import { configureReferencePermissions } from "../../agents/capabilities/reference-browser/permissions";
import { setTimeout as delay } from "node:timers/promises";
import type { ElementHandle, Frame, Page } from "puppeteer-core";
import { createRemoteReferenceBrowser } from "../../capture/worker-client";
import { startWebsiteCapture } from "./website-capture";
import type { CapturePresentationInput } from "../../capture/presentation";
import {
  inspectReferenceDocument,
  type ReferencePageInspection,
  referencePageHasContent,
} from "../../agents/capabilities/reference-browser/page-inspection";
import { createReferenceNetwork } from "../../agents/capabilities/reference-browser/network";
import { referenceResourceLimits } from "../../requests/reference-resource";
import { validateReferenceUrl } from "../../requests/reference-url";
import { CodedError } from "../../../shared/errors";
import { agentMode } from "../../runtime/config";
import { browserExecutablePath } from "../../runtime/browser";
import {
  authenticateReferenceBrowser,
  isAuthenticationRedirect,
  referencePageNeedsAuthentication,
} from "../../agents/capabilities/reference-browser/authentication";

export async function createLocalReferenceBrowser(
  origins: string[],
  signal: AbortSignal,
  mode: "local" | "hosted" = agentMode,
  desktop = process.env.KITEVA_CAPTURE_DESKTOP === "1",
  workspace?: string,
) {
  signal.throwIfAborted();
  const allowedOrigins = new Set(origins.map((url) => new URL(url).origin));
  const executablePath = browserExecutablePath(desktop);
  if (!executablePath)
    throw new CodedError(
      "REFERENCE_CAPTURE_FAILED",
      desktop
        ? "OpenScreen recording requires full Chrome or Chromium; configure VIDEO_BROWSER_PATH"
        : "Screenshot browser unavailable",
    );
  const files = workspace ? prepareProjectRuntime(workspace, "browser") : undefined;
  const persistent =
    workspace && mode === "local" ? await acquireReferenceProfile(workspace, signal) : undefined;
  const temporaryDirectory = files ? await mkdtemp(path.join(files.tmp, "session-")) : undefined;
  const profile =
    persistent?.profile ??
    (temporaryDirectory ? path.join(temporaryDirectory, "profile") : undefined);
  signal = persistent?.signal ?? signal;
  const releaseProfile = async () => {
    try {
      if (persistent) await persistent.release();
      else if (profile) await rm(profile, { recursive: true, force: true });
    } finally {
      if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    }
  };
  let processScope: ReturnType<typeof createProcessScope>;
  try {
    processScope = createProcessScope(signal);
  } catch (error) {
    await releaseProfile();
    throw error;
  }
  let useWindowViewport = desktop;
  let browser = await processScope
    .run(async (signal) =>
      launchReferenceBrowser({
        executablePath,
        signal,
        workspace,
        profile,
        temporaryDirectory,
        presentation: desktop ? "capture" : "headless",
        mode,
      }),
    )
    .catch(async (error: unknown) => {
      try {
        await processScope.close();
      } finally {
        await releaseProfile();
      }
      throw new CodedError(
        "REFERENCE_CAPTURE_FAILED",
        error instanceof Error ? error.message : "Browser launch failed",
      );
    });
  let recording: Awaited<ReturnType<typeof startWebsiteCapture>> | undefined;
  const editable = new Map<string, Awaited<ReturnType<typeof startWebsiteCapture>>>();
  const stop = () => {
    void (async () => {
      try {
        await recording?.close().catch(() => {});
        await processScope.close();
      } finally {
        await releaseProfile();
      }
    })().catch(() => {});
  };
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  let requests = 0;
  let bytes = 0;
  const network = createReferenceNetwork({
    mode,
    signal,
    consumeBytes: (chunkBytes) => {
      bytes += chunkBytes;
      if (bytes > referenceResourceLimits.sessionBytes)
        throw Error(
          `Reference session exceeds ${referenceResourceLimits.sessionBytes / 1_000_000} MB`,
        );
    },
  });
  let navigationError: unknown;
  let authenticationRequired = false;
  const loadingErrors: string[] = [];
  try {
    signal.throwIfAborted();
    await persistent?.restore(browser);
    await configureReferencePermissions(browser.defaultBrowserContext(), origins, mode);
    signal.throwIfAborted();
    let page = desktop
      ? ((await browser.pages())[0] ?? (await browser.newPage()))
      : await browser.newPage();
    let selectedFrame: Frame | undefined;
    const currentFrame = () =>
      selectedFrame && !selectedFrame.detached ? selectedFrame : page.mainFrame();
    const configuredPages = new WeakMap<Page, Promise<void>>();
    async function configurePage(targetPage: Page) {
      const configured = configuredPages.get(targetPage);
      if (configured) return configured;
      const setup = (async () => {
        targetPage.setDefaultTimeout(10000);
        targetPage.on("pageerror", (error) => {
          loadingErrors.push(error instanceof Error ? error.message : String(error));
          if (loadingErrors.length > 5) loadingErrors.shift();
        });
        targetPage.on("response", (response) => {
          if (
            response.request().isNavigationRequest() &&
            response.request().frame() === targetPage.mainFrame() &&
            (response.headers()["www-authenticate"] || response.status() === 401)
          )
            authenticationRequired = true;
        });
        if (!useWindowViewport)
          await targetPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
        await targetPage.setBypassServiceWorker(true);
        await targetPage.setCacheEnabled(false);
        await targetPage.setRequestInterception(true);
        targetPage.on("request", (request) => {
          void (async () => {
            if (request.isInterceptResolutionHandled()) return;
            if (request.url().startsWith("data:") || request.url().startsWith("blob:")) {
              await request.continue();
              return;
            }
            try {
              if (
                request.isNavigationRequest() &&
                request.frame() === targetPage.mainFrame() &&
                !allowedOrigins.has(new URL(request.url()).origin)
              ) {
                if (mode === "local" && isAuthenticationRedirect(request.url()))
                  authenticationRequired = true;
                throw new CodedError(
                  "PUBLIC_URL_REQUIRED",
                  "Navigation must stay on supplied website origins",
                );
              }
              if (mode === "local") {
                network.checkRequest(targetPage, request.url());
                await validateReferenceUrl(request.url(), mode);
                await request.continue();
                return;
              }
              if (
                ++requests > referenceResourceLimits.requests ||
                !["GET", "HEAD"].includes(request.method())
              )
                throw Error("Hosted read-only browser request rejected");
              const response = await network.resource(targetPage, request);
              await request.respond(response);
            } catch (error) {
              loadingErrors.push(
                `${request.resourceType()} ${new URL(request.url()).pathname}: ${error instanceof Error ? error.message : String(error)}`,
              );
              if (loadingErrors.length > 5) loadingErrors.shift();
              if (
                targetPage === page &&
                request.isNavigationRequest() &&
                request.frame() === targetPage.mainFrame()
              )
                navigationError = error;
              if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => {});
            }
          })().catch(() => {});
        });
      })();
      configuredPages.set(targetPage, setup);
      return setup;
    }
    await configurePage(page);
    const configurePopups = () =>
      browser.on("targetcreated", (target) => {
        void target
          .page()
          .then(async (tab) => {
            if (tab) await configurePage(tab);
          })
          .catch(() => {});
      });
    configurePopups();
    async function signIn(url: string) {
      if (mode !== "local") throw Error("Sign-in requires a local reference browser");
      if (recording) throw Error("Complete website sign-in before starting a recording");
      const executable =
        process.env.VIDEO_AUTH_BROWSER_PATH ||
        browserExecutablePath(true, { fallbackFromHeadlessShell: true });
      if (!executable) throw Error("Website sign-in requires full Chrome or Chromium");
      try {
        await persistent?.save(browser);
        await browser.close();
        browser = await processScope.run((signal) =>
          launchReferenceBrowser({
            executablePath: executable,
            signal,
            workspace,
            profile,
            presentation: "sign-in",
            mode,
          }),
        );
        await persistent?.restore(browser);
        useWindowViewport = true;
        await configureReferencePermissions(browser.defaultBrowserContext(), origins, mode);
        page = await authenticateReferenceBrowser(browser, url, allowedOrigins, signal);
        await persistent?.save(browser);
        authenticationRequired = false;
        navigationError = undefined;
        selectedFrame = undefined;
        lastInspection = undefined;
        await configurePage(page);
        configurePopups();
      } catch (error) {
        signal.throwIfAborted();
        throw new ReferenceAuthenticationError(error);
      }
    }
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
    let lastInspection: ReferencePageInspection | undefined;
    async function inspect(url?: string, requestSignIn = false): Promise<ReferencePageInspection> {
      const dialog = capabilities.pendingDialog();
      if (dialog && lastInspection) return { ...lastInspection, dialog };
      if (url) {
        selectedFrame = undefined;
        if (!allowedOrigins.has(new URL(url).origin))
          throw new CodedError(
            "PUBLIC_URL_REQUIRED",
            "Navigation must stay on supplied website origins",
          );
        await validateReferenceUrl(url, mode);
        navigationError = undefined;
        authenticationRequired = false;
        try {
          const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
          if (navigationError) throw navigationError;
          if (!response || response.status() >= 400)
            throw Error("Reference page could not be opened");
        } catch (error) {
          if (!authenticationRequired && !requestSignIn) throw error;
        }
      }
      const referenceUrl = url ?? lastInspection?.url ?? (requestSignIn ? origins[0] : undefined);
      if (
        mode === "local" &&
        referenceUrl &&
        (requestSignIn ||
          authenticationRequired ||
          (await page.evaluate(referencePageNeedsAuthentication)) === true)
      )
        await signIn(referenceUrl);
      await settle();
      lastInspection = await currentFrame().evaluate(inspectReferenceDocument);
      return lastInspection;
    }
    let pointer = { x: 20, y: 20 };
    async function movePointer(
      x: number,
      y: number,
      _cursorType: "arrow" | "pointer" | "text" = "arrow",
    ) {
      await page.mouse.move(x, y);
      pointer = { x, y };
    }

    async function pointAndClick(
      target: ElementHandle<Element>,
      button: "left" | "right" | "middle" = "left",
      clickCount = 1,
    ) {
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
      await movePointer(destination.x, destination.y, cursorType);
      await runWithBrowserDialog(
        page,
        () => page.mouse.click(pointer.x, pointer.y, { button, count: clickCount }),
        () => undefined,
      );
    }
    const capabilities = createBrowserCapabilities({
      page: () => page,
      frame: currentFrame,
      selectFrame: (frame) => {
        lastInspection = undefined;
        selectedFrame = frame;
      },
      selectPage: async (tab) => {
        lastInspection = undefined;
        navigationError = undefined;
        page = tab;
        selectedFrame = undefined;
        pointer = { x: 20, y: 20 };
        await tab.bringToFront();
      },
      configurePage,
      inspect,
      prepareNavigation: () => {
        selectedFrame = undefined;
        navigationError = undefined;
        lastInspection = undefined;
      },
      recording: () => Boolean(recording),
      move: movePointer,
      click: pointAndClick,
      configureNetwork: network.configure,
      origins: allowedOrigins,
      signal,
    });
    await capabilities.ready();
    return {
      perform: (request: BrowserCapabilityRequest, workspace: string) =>
        capabilities.perform(request, workspace),
      inspect,
      async click(controlId: string) {
        if (!/^\d+$/.test(controlId)) throw Error("Use a control ID from the latest inspection");
        const target = await currentFrame().$(`[data-reference-control="${controlId}"]`);
        if (!target) throw Error("Control was not found; inspect again");
        await pointAndClick(target);
        return inspect();
      },
      async fill(controlId: string, value: string) {
        if (!/^\d+$/.test(controlId)) throw Error("Use a control ID from the latest inspection");
        const target = await currentFrame().$(`[data-reference-control="${controlId}"]`);
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
      async upload(controlId: string, files: string[]) {
        if (!/^\d+$/.test(controlId)) throw Error("Use a control ID from the latest inspection");
        const handle = await currentFrame().$(
          `input[type="file"][data-reference-control="${controlId}"]`,
        );
        if (!handle) throw Error("File input was not found; inspect again");
        const target = await handle.toElement("input");
        if (
          await target.evaluate(
            (element, count) => element.disabled || (!element.multiple && count > 1),
            files.length,
          )
        )
          throw Error("File input is disabled or does not accept multiple files");
        await target.uploadFile(...files);
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
        try {
          try {
            if (browser.connected) await persistent?.save(browser);
          } finally {
            await browser.close();
          }
        } finally {
          try {
            await processScope.close();
          } finally {
            await releaseProfile();
          }
        }
      },
    };
  } catch (error) {
    signal.removeEventListener("abort", stop);
    try {
      await processScope.close();
    } finally {
      try {
        await browser.close();
      } finally {
        await releaseProfile();
      }
    }
    throw error;
  }
}

/** A configured worker takes priority; otherwise recording uses the current desktop. */
export async function createReferenceBrowser(
  origins: string[],
  signal: AbortSignal,
  mode: "local" | "hosted" = agentMode,
  enableVideoCapture = false,
  workspace?: string,
) {
  if (process.env.KITEVA_CAPTURE_WORKER_URL && process.env.KITEVA_CAPTURE_DESKTOP !== "1")
    return createRemoteReferenceBrowser(origins, signal, mode);
  return createLocalReferenceBrowser(
    origins,
    signal,
    mode,
    enableVideoCapture || process.env.KITEVA_CAPTURE_DESKTOP === "1",
    workspace,
  );
}
