import type {
  CDPSession,
  Dialog,
  ElementHandle,
  Frame,
  HTTPResponse,
  KeyInput,
  Page,
} from "puppeteer-core";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BrowserCapabilityRequest, BrowserCapabilityResult } from "./reference-tool-registry";

/** Native input commands can remain pending until a JavaScript dialog is answered. */
export async function runWithBrowserDialog<T>(
  page: Page,
  action: () => Promise<T>,
  pending: (dialog: Dialog) => T,
): Promise<T> {
  let notify: (dialog: Dialog) => void;
  const opened = new Promise<T>((resolve) => {
    notify = (dialog) => resolve(pending(dialog));
  });
  page.once("dialog", notify!);
  try {
    return await Promise.race([action(), opened]);
  } finally {
    page.off("dialog", notify!);
  }
}

export function createBrowserCapabilities(context: {
  page: () => Page;
  frame: () => Frame;
  selectPage: (page: Page) => Promise<void>;
  selectFrame: (frame: Frame) => void;
  configurePage: (page: Page) => Promise<void>;
  inspect: () => Promise<unknown>;
  prepareNavigation: () => void;
  recording: () => boolean;
  move: (x: number, y: number, type?: "arrow" | "pointer" | "text") => Promise<void>;
  click: (
    target: ElementHandle<Element>,
    button?: "left" | "right" | "middle",
    count?: number,
  ) => Promise<void>;
  cursor: (x: number, y: number, kind: "click" | "move") => void;
  configureNetwork: (
    page: Page,
    input: Extract<BrowserCapabilityRequest, { operation: "browser_network" }>,
  ) => { offline: boolean };
  origins: Set<string>;
  signal: AbortSignal;
}) {
  const consoleLog: unknown[] = [],
    errors: string[] = [],
    network: unknown[] = [];
  const responses = new Map<string, HTTPResponse>();
  const pages = new Map<string, Page>();
  const initializedPopups = new WeakSet<Page>();
  const dialogs = new Map<Page, Dialog>();
  const clients = new Map<Page, Promise<CDPSession>>();
  const scriptLists = new Map<Page, unknown[]>();
  const watched = new WeakSet<Page>();
  const downloads = new Map<string, { name: string; state: string; suggestedFilename: string }>();
  let trace: { name: string; page: Page } | undefined;
  const push = <T>(list: T[], value: T) => {
    list.push(value);
    if (list.length > 100) list.shift();
  };
  function watch(page: Page) {
    if (watched.has(page)) return;
    watched.add(page);
    page.on("console", (message) =>
      push(consoleLog, { type: message.type(), text: message.text().slice(0, 4000) }),
    );
    page.on("pageerror", (error) => push(errors, String(error).slice(0, 4000)));
    page.on("dialog", (dialog) => dialogs.set(page, dialog));
    page.on("requestfailed", (request) =>
      push(network, { url: request.url(), failure: request.failure()?.errorText }),
    );
    page.on("response", (response) => {
      const id = randomUUID();
      responses.set(id, response);
      if (responses.size > 100) responses.delete(responses.keys().next().value!);
      push(network, {
        id,
        url: response.url(),
        status: response.status(),
        method: response.request().method(),
      });
    });
  }
  watch(context.page());
  const originAllowed = (url: string) => context.origins.has(new URL(url).origin);
  function requireOrigin(url: string) {
    if (!originAllowed(url)) throw Error("Use a supplied website origin");
  }
  function noRecording() {
    if (context.recording())
      throw Error("Stop the active take before changing tabs, viewport or debugger execution");
  }
  async function client(page = context.page()) {
    if (!clients.has(page))
      clients.set(
        page,
        (async () => {
          const cdp = await page.createCDPSession();
          cdp.on("Network.webSocketCreated", (event) =>
            push(network, {
              kind: "websocket",
              event: "created",
              id: event.requestId,
              url: event.url,
            }),
          );
          cdp.on("Network.webSocketFrameReceived", (event) =>
            push(network, {
              kind: "websocket",
              event: "received",
              id: event.requestId,
              payload: event.response.payloadData.slice(0, 4000),
            }),
          );
          cdp.on("Network.webSocketFrameSent", (event) =>
            push(network, {
              kind: "websocket",
              event: "sent",
              id: event.requestId,
              payload: event.response.payloadData.slice(0, 4000),
            }),
          );
          cdp.on("Network.webSocketFrameError", (event) =>
            push(network, {
              kind: "websocket",
              event: "error",
              id: event.requestId,
              message: event.errorMessage,
            }),
          );
          cdp.on("Network.eventSourceMessageReceived", (event) =>
            push(network, {
              kind: "eventsource",
              id: event.requestId,
              event: event.eventName,
              data: event.data.slice(0, 4000),
            }),
          );
          await cdp.send("Network.enable");
          return cdp;
        })(),
      );
    return clients.get(page)!;
  }
  async function element(selector: string) {
    const handle = await context
      .frame()
      .$(/^\d+$/.test(selector) ? `[data-reference-control="${selector}"]` : selector);
    if (!handle) throw Error("Element not found; inspect again or wait for it");
    return handle;
  }
  async function point(selector: string) {
    const handle = await element(selector);
    const box = await handle.boundingBox();
    if (!box || !(await handle.isIntersectingViewport({ threshold: 1 })))
      throw Error("Element is outside the viewport; scroll it into view first");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  async function jsonArtifact(workspace: string, name: string, data: unknown) {
    await mkdir(path.join(workspace, "assets"), { recursive: true });
    await writeFile(path.join(workspace, "assets", name), JSON.stringify(data));
  }
  async function execute(
    input: BrowserCapabilityRequest,
    workspace: string,
  ): Promise<BrowserCapabilityResult> {
    context.signal.throwIfAborted();
    const page = context.page();
    watch(page);
    let data: unknown;
    let artifact: BrowserCapabilityResult["artifact"];
    switch (input.operation) {
      case "browser_navigate": {
        context.prepareNavigation();
        const cdp = await client();
        if (input.action !== "reload") {
          const history = await cdp.send("Page.getNavigationHistory");
          const entry = history.entries[history.currentIndex + (input.action === "back" ? -1 : 1)];
          if (!entry) throw Error("No history entry in that direction");
          requireOrigin(entry.url);
          await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
            cdp.send("Page.navigateToHistoryEntry", { entryId: entry.id }),
          ]);
        } else {
          requireOrigin(page.url());
          await page.reload({ waitUntil: "domcontentloaded" });
        }
        data = await context.inspect();
        break;
      }
      case "browser_tabs": {
        for (const tab of await page.browser().pages()) {
          await context.configurePage(tab);
          watch(tab);
          if (
            tab !== context.page() &&
            tab.url().startsWith("chrome-error:") &&
            !initializedPopups.has(tab)
          ) {
            // A popup's first request can precede Puppeteer's page event. Initialize
            // its observed target URL only after the validated interceptor is ready.
            initializedPopups.add(tab);
            const observed = tab.target().url();
            if (originAllowed(observed))
              await tab.goto(observed, { waitUntil: "domcontentloaded" });
          }
          if (![...pages.values()].includes(tab)) pages.set(randomUUID(), tab);
        }
        if (input.action !== "list") {
          noRecording();
          if (input.action === "new") {
            if (!input.url) throw Error("New tab requires a supplied-origin URL");
            requireOrigin(input.url);
            const tab = await page.browserContext().newPage();
            await context.configurePage(tab);
            watch(tab);
            await tab.goto(input.url, { waitUntil: "domcontentloaded" });
            pages.set(randomUUID(), tab);
            await context.selectPage(tab);
          } else {
            const tab = input.tabId && pages.get(input.tabId);
            if (!tab || tab.isClosed()) throw Error("Use a tab ID from browser_tabs list");
            if (input.action === "switch") {
              requireOrigin(tab.url());
              await context.configurePage(tab);
              watch(tab);
              await context.selectPage(tab);
            } else {
              const others = [...pages.values()].filter(
                (value) => value !== tab && !value.isClosed() && originAllowed(value.url()),
              );
              if (!others.length) throw Error("Keep at least one supplied-origin tab open");
              if (tab === page) await context.selectPage(others[0]);
              await tab.close();
              pages.delete(input.tabId!);
            }
          }
        }
        data = await Promise.all(
          [...pages.entries()]
            .filter(([, tab]) => !tab.isClosed())
            .map(async ([id, tab]) => ({
              id,
              url: tab.url(),
              title: await tab.title(),
              active: tab === context.page(),
            })),
        );
        break;
      }
      case "browser_frames": {
        const frames = page.frames();
        if (input.action === "main") context.selectFrame(page.mainFrame());
        if (input.action === "select") {
          const frame = frames[Number(input.frameId)];
          if (!frame) throw Error("Use a frame ID from browser_frames list");
          if (!["about:blank", "about:srcdoc", ""].includes(frame.url()))
            requireOrigin(frame.url());
          context.selectFrame(frame);
        }
        data = frames.map((frame, id) => ({
          id: String(id),
          url: frame.url(),
          name: frame.name(),
          selected: frame === context.frame(),
        }));
        break;
      }
      case "browser_element": {
        const target = await element(input.target);
        switch (input.action) {
          case "inspect":
            data = await target.evaluate((el) => ({
              tag: el.tagName,
              text: el.textContent?.slice(0, 4000),
              role: el.getAttribute("role"),
              label: el.getAttribute("aria-label"),
              type: el.getAttribute("type"),
              value:
                "value" in el && el.getAttribute("type") !== "password"
                  ? String(el.value)
                  : undefined,
              checked: "checked" in el ? el.checked : undefined,
              disabled: "disabled" in el ? el.disabled : undefined,
              focused: el === document.activeElement,
              bounds: el.getBoundingClientRect().toJSON(),
              visible:
                el.getBoundingClientRect().width > 0 &&
                getComputedStyle(el).visibility !== "hidden",
            }));
            break;
          case "focus":
            await target.focus();
            break;
          case "hover": {
            const p = await point(input.target);
            await context.move(p.x, p.y, "pointer");
            break;
          }
          case "scroll":
            await target.scrollIntoView();
            break;
          case "select": {
            if (!input.values?.length) throw Error("Select requires values");
            const position = await point(input.target);
            await context.move(position.x, position.y, "pointer");
            const select = await target.toElement("select");
            const values =
              input.selectBy === "label"
                ? await select.evaluate(
                    (el, labels) =>
                      labels.map((label) => {
                        const matches = [...el.options].filter((option) => option.label === label);
                        if (matches.length !== 1) throw Error("Use an unambiguous option label");
                        return matches[0].value;
                      }),
                    input.values,
                  )
                : input.values;
            data = await select.select(...values);
            if ((data as string[]).length !== values.length)
              throw Error("One or more option values were not found");
            break;
          }
          case "check": {
            if (input.checked === undefined) throw Error("Check requires checked");
            const checked = await target.evaluate((el) => {
              if (!(el instanceof HTMLInputElement) || !["checkbox", "radio"].includes(el.type))
                throw Error("Use a checkbox or radio input");
              return el.checked;
            });
            if (checked !== input.checked) await context.click(target);
            break;
          }
          case "fill": {
            if (input.value === undefined) throw Error("Fill requires value");
            await target.evaluate((el) => {
              if (
                !(
                  el instanceof HTMLTextAreaElement ||
                  el instanceof HTMLInputElement ||
                  (el instanceof HTMLElement && el.isContentEditable)
                )
              )
                throw Error("Use an editable element");
              if (
                el instanceof HTMLInputElement &&
                ["password", "file", "hidden", "submit", "button"].includes(el.type)
              )
                throw Error("This input type cannot be filled");
            });
            await context.click(target);
            await target.evaluate((el, value) => {
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                const descriptor = Object.getOwnPropertyDescriptor(
                  el instanceof HTMLInputElement
                    ? HTMLInputElement.prototype
                    : HTMLTextAreaElement.prototype,
                  "value",
                );
                descriptor!.set!.call(el, value);
              } else el.textContent = value;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }, input.value);
            break;
          }
        }
        break;
      }
      case "browser_pointer": {
        const p = input.target ? await point(input.target) : { x: input.x, y: input.y };
        if (p.x !== undefined && p.y !== undefined) {
          const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          if (p.x >= viewport.width || p.y >= viewport.height)
            throw Error("Pointer coordinates must stay inside the viewport");
        }
        if (input.action === "wheel") {
          if (p.x !== undefined && p.y !== undefined) await context.move(p.x, p.y, "pointer");
          await page.mouse.wheel({ deltaX: input.deltaX, deltaY: input.deltaY });
          break;
        }
        if (p.x === undefined || p.y === undefined) throw Error("Provide target or x and y");
        await context.move(p.x, p.y, input.target ? "pointer" : "arrow");
        if (input.action === "click") {
          context.cursor(p.x, p.y, "click");
          await page.mouse.click(p.x, p.y, {
            button: input.button,
            count: input.clickCount,
          });
        }
        if (input.action === "down") await page.mouse.down({ button: input.button });
        if (input.action === "up") await page.mouse.up({ button: input.button });
        if (input.action === "tap") {
          context.cursor(p.x, p.y, "click");
          await page.touchscreen.tap(p.x, p.y);
        }
        if (input.action === "drag") {
          if (!input.destination) throw Error("Drag requires a destination target");
          const end = await point(input.destination);
          await page.mouse.down({ button: input.button });
          try {
            await context.move(end.x, end.y, "pointer");
          } finally {
            await page.mouse.up({ button: input.button });
          }
        }
        break;
      }
      case "browser_keyboard":
        if (input.action === "type" || input.action === "insert") {
          if (input.text === undefined) throw Error("Provide text");
          if (input.action === "type") await page.keyboard.type(input.text);
          else await page.keyboard.sendCharacter(input.text);
        } else {
          if (!input.key) throw Error("Provide a Puppeteer key name");
          await page.keyboard[input.action](input.key as KeyInput);
        }
        break;
      case "browser_dialog": {
        const dialog = dialogs.get(page);
        if (!dialog && input.action !== "inspect") throw Error("No pending JavaScript dialog");
        data = dialog
          ? {
              type: dialog.type(),
              message: dialog.message(),
              defaultValue: dialog.defaultValue(),
            }
          : null;
        if (dialog && input.action !== "inspect") {
          dialogs.delete(page);
          if (input.action === "accept") await dialog.accept(input.text);
          else await dialog.dismiss();
        }
        break;
      }
      case "browser_wait": {
        const selector =
          input.target &&
          (/^\d+$/.test(input.target)
            ? `[data-reference-control="${input.target}"]`
            : input.target);
        if (["visible", "hidden", "enabled"].includes(input.condition)) {
          if (!selector) throw Error("Provide target");
          if (input.condition === "enabled")
            await context.frame().waitForFunction(
              (selector) => {
                const el = document.querySelector(selector);
                return Boolean(el && !el.matches(":disabled"));
              },
              { timeout: input.timeout },
              selector,
            );
          else
            await context.frame().waitForSelector(selector, {
              visible: input.condition === "visible",
              hidden: input.condition === "hidden",
              timeout: input.timeout,
            });
        } else {
          if (!input.value) throw Error("Provide value");
          if (input.condition === "text")
            await context
              .frame()
              .waitForFunction(
                (value) => document.body.innerText.includes(value),
                { timeout: input.timeout },
                input.value,
              );
          if (input.condition === "url")
            await page.waitForFunction(
              (value) => location.href.includes(value),
              { timeout: input.timeout },
              input.value,
            );
          if (input.condition === "request" || input.condition === "response") {
            const found = network.some((entry) => JSON.stringify(entry).includes(input.value!));
            if (!found) {
              if (input.condition === "request")
                await page.waitForRequest((r) => r.url().includes(input.value!), {
                  timeout: input.timeout,
                });
              else
                await page.waitForResponse((r) => r.url().includes(input.value!), {
                  timeout: input.timeout,
                });
            }
          }
        }
        data = { matched: true };
        break;
      }
      case "browser_evaluate":
        data = await context.frame().evaluate(input.expression);
        break;
      case "browser_diagnostics": {
        if (input.action === "console") data = consoleLog;
        if (input.action === "errors") data = errors;
        if (input.action === "network") data = network;
        if (input.action === "metrics") data = await page.metrics();
        if (input.action === "dom") data = await context.frame().content();
        if (input.action === "accessibility") data = await page.accessibility.snapshot();
        if (input.action === "response_body") {
          const response = input.requestId && responses.get(input.requestId);
          if (!response) throw Error("Use an observed response ID");
          data = (await response.text()).slice(0, 64000);
        }
        break;
      }
      case "browser_session": {
        requireOrigin(page.url());
        const browserContext = page.browserContext();
        if (input.action === "cookies")
          data = (await browserContext.cookies()).filter(
            (cookie) => new URL(page.url()).hostname === cookie.domain.replace(/^\./, ""),
          );
        if (input.action === "set_cookie") {
          if (!input.key || input.value === undefined) throw Error("Provide key and value");
          await browserContext.setCookie({
            name: input.key,
            value: input.value,
            domain: new URL(page.url()).hostname,
            path: "/",
          });
        }
        if (input.action === "clear_cookies") {
          for (const cookie of await browserContext.cookies())
            if (new URL(page.url()).hostname === cookie.domain.replace(/^\./, ""))
              await browserContext.deleteCookie(cookie);
        }
        if (["storage", "set_storage", "clear_storage"].includes(input.action))
          data = await context.frame().evaluate(({ action, storage, key, value }) => {
            const store = storage === "local" ? localStorage : sessionStorage;
            if (action === "set_storage") {
              if (!key || value === undefined) throw Error("Provide key and value");
              store.setItem(key, value);
            }
            if (action === "clear_storage") store.clear();
            return Object.fromEntries(
              Array.from({ length: store.length }, (_, i) => {
                const k = store.key(i)!;
                return [k, store.getItem(k)];
              }),
            );
          }, input);
        if (input.action === "permission") {
          if (!input.permission || !input.state) throw Error("Provide permission and state");
          await (
            await client()
          ).send("Browser.setPermission", {
            origin: new URL(page.url()).origin,
            permission: { name: input.permission },
            setting: input.state,
          });
        }
        break;
      }
      case "browser_network": {
        const network = context.configureNetwork(page, input);
        if (input.action === "offline") await page.setOfflineMode(Boolean(input.enabled));
        if (input.action === "throttle")
          await page.emulateNetworkConditions({
            offline: network.offline,
            download: input.enabled === false ? -1 : (input.download ?? -1),
            upload: input.enabled === false ? -1 : (input.upload ?? -1),
            latency: input.enabled === false ? 0 : (input.latency ?? 0),
          });
        if (input.action === "cache") await page.setCacheEnabled(Boolean(input.enabled));
        if (input.action === "service_workers") await page.setBypassServiceWorker(!input.enabled);
        if (input.action === "block")
          await (await client()).send("Network.setBlockedURLs", { urls: input.patterns ?? [] });
        if (input.action === "headers") {
          if (
            Object.keys(input.headers ?? {}).some((key) =>
              /authorization|cookie|proxy|host/i.test(key),
            )
          )
            throw Error("Credential and routing headers are not permitted");
          await page.setExtraHTTPHeaders(input.headers ?? {});
        }
        break;
      }
      case "browser_emulate": {
        if (input.action === "viewport") {
          noRecording();
          if (!input.width || !input.height) throw Error("Provide width and height");
          await page.setViewport({
            width: input.width,
            height: input.height,
            deviceScaleFactor: input.deviceScaleFactor,
            isMobile: input.mobile,
            hasTouch: input.touch,
            isLandscape: input.landscape,
          });
        }
        if (input.action === "user_agent") {
          if (!input.value) throw Error("Provide user-agent value");
          await page.setUserAgent(input.value);
        }
        if (input.action === "timezone") await page.emulateTimezone(input.value);
        if (input.action === "locale") {
          if (!input.value) throw Error("Provide locale");
          await page.emulateLocale(input.value);
        }
        if (input.action === "geolocation") {
          if (input.latitude === undefined || input.longitude === undefined)
            throw Error("Provide latitude and longitude");
          await page.setGeolocation({ latitude: input.latitude, longitude: input.longitude });
        }
        if (input.action === "media") {
          if (input.value) {
            if (!["screen", "print"].includes(input.value))
              throw Error("Media type must be screen or print");
            await page.emulateMediaType(input.value);
          }
          await page.emulateMediaFeatures([
            ...(input.colourScheme
              ? [{ name: "prefers-color-scheme", value: input.colourScheme }]
              : []),
            ...(input.reducedMotion === undefined
              ? []
              : [
                  {
                    name: "prefers-reduced-motion",
                    value: input.reducedMotion ? "reduce" : "no-preference",
                  },
                ]),
          ]);
        }
        if (input.action === "cpu") await page.emulateCPUThrottling(input.rate);
        if (input.action === "vision") {
          if (
            ![
              "none",
              "achromatopsia",
              "blurredVision",
              "deuteranopia",
              "protanopia",
              "tritanopia",
            ].includes(input.value ?? "")
          )
            throw Error("Use a supported vision deficiency");
          await page.emulateVisionDeficiency(
            input.value as Parameters<Page["emulateVisionDeficiency"]>[0],
          );
        }
        break;
      }
      case "browser_capture": {
        const name = `browser-${randomUUID()}.${input.format}`;
        await mkdir(path.join(workspace, "assets"), { recursive: true });
        const destination = path.join(workspace, "assets", name);
        if (input.format === "pdf") await page.pdf({ path: destination, printBackground: true });
        else if (input.target)
          await (await element(input.target)).screenshot({ path: destination, type: "png" });
        else await page.screenshot({ path: destination, type: "png", fullPage: input.fullPage });
        artifact = { name, mimeType: input.format === "pdf" ? "application/pdf" : "image/png" };
        break;
      }
      case "browser_media": {
        data = await (
          await element(input.target)
        ).evaluate(async (el, input) => {
          if (!(el instanceof HTMLMediaElement)) throw Error("Use a video or audio element");
          if (input.action === "play") await el.play();
          if (input.action === "pause") el.pause();
          if (input.action === "seek") {
            if (input.seconds === undefined) throw Error("Provide seconds");
            el.currentTime = input.seconds;
          }
          if (input.action === "rate") {
            if (input.rate === undefined) throw Error("Provide rate");
            el.playbackRate = input.rate;
          }
          if (input.action === "mute") {
            if (input.muted === undefined) throw Error("Provide muted");
            el.muted = input.muted;
          }
          return {
            currentTime: el.currentTime,
            duration: Number.isFinite(el.duration) ? el.duration : null,
            paused: el.paused,
            ended: el.ended,
            muted: el.muted,
            playbackRate: el.playbackRate,
          };
        }, input);
        break;
      }
      case "browser_debug": {
        const cdp = await client();
        if (input.action === "trace_start") {
          if (trace) throw Error("Trace already running");
          const name = `browser-${randomUUID()}.json`;
          await mkdir(path.join(workspace, "assets"), { recursive: true });
          await page.tracing.start({ path: path.join(workspace, "assets", name) });
          trace = { name, page };
        }
        if (input.action === "trace_stop") {
          if (!trace || trace.page !== page) throw Error("Start tracing on this tab first");
          await page.tracing.stop();
          artifact = { name: trace.name, mimeType: "application/json" };
          trace = undefined;
        }
        if (input.action === "coverage_start")
          await Promise.all([page.coverage.startJSCoverage(), page.coverage.startCSSCoverage()]);
        if (input.action === "coverage_stop") {
          const name = `browser-${randomUUID()}.json`;
          await jsonArtifact(workspace, name, {
            javascript: await page.coverage.stopJSCoverage(),
            css: await page.coverage.stopCSSCoverage(),
          });
          artifact = { name, mimeType: "application/json" };
        }
        if (input.action === "heap") {
          const name = `browser-${randomUUID()}.heapsnapshot`;
          await mkdir(path.join(workspace, "assets"), { recursive: true });
          await page.captureHeapSnapshot({ path: path.join(workspace, "assets", name) });
          artifact = { name, mimeType: "application/json" };
        }
        if (
          ["scripts", "breakpoint", "pause", "step_over", "step_into", "step_out"].includes(
            input.action,
          )
        ) {
          noRecording();
          if (!scriptLists.has(page)) {
            const list: unknown[] = [];
            scriptLists.set(page, list);
            cdp.on("Debugger.scriptParsed", (script) =>
              push(list, {
                scriptId: script.scriptId,
                url: script.url,
                startLine: script.startLine,
                endLine: script.endLine,
              }),
            );
            await cdp.send("Debugger.enable");
          }
        }
        if (input.action === "scripts") data = scriptLists.get(page);
        if (input.action === "breakpoint") {
          if (!input.url || input.line === undefined)
            throw Error("Provide script url and zero-based line");
          data = await cdp.send("Debugger.setBreakpointByUrl", {
            url: input.url,
            lineNumber: input.line,
          });
        }
        if (input.action === "remove_breakpoint") {
          if (!input.breakpointId) throw Error("Provide breakpointId");
          await cdp.send("Debugger.removeBreakpoint", { breakpointId: input.breakpointId });
        }
        if (input.action === "pause") await cdp.send("Debugger.pause");
        if (input.action === "resume") await cdp.send("Debugger.resume");
        if (input.action === "step_over") await cdp.send("Debugger.stepOver");
        if (input.action === "step_into") await cdp.send("Debugger.stepInto");
        if (input.action === "step_out") await cdp.send("Debugger.stepOut");
        break;
      }
      case "browser_downloads": {
        const cdp = await client();
        if (input.action === "enable") {
          await mkdir(path.join(workspace, "assets"), { recursive: true });
          cdp.removeAllListeners("Browser.downloadWillBegin");
          cdp.removeAllListeners("Browser.downloadProgress");
          cdp.on("Browser.downloadWillBegin", (event) =>
            downloads.set(event.guid, {
              name: `browser-${event.guid}.bin`,
              state: "inProgress",
              suggestedFilename: event.suggestedFilename,
            }),
          );
          cdp.on("Browser.downloadProgress", (event) => {
            const download = downloads.get(event.guid);
            if (!download) return;
            if (event.state === "completed")
              void rename(
                path.join(workspace, "assets", event.guid),
                path.join(workspace, "assets", download.name),
              )
                .then(() => {
                  download.state = "completed";
                })
                .catch(() => {
                  download.state = "failed";
                });
            else download.state = event.state;
          });
          await cdp.send("Browser.setDownloadBehavior", {
            behavior: "allowAndName",
            downloadPath: path.join(workspace, "assets"),
            eventsEnabled: true,
          });
        }
        if (input.action === "disable")
          await cdp.send("Browser.setDownloadBehavior", { behavior: "deny" });
        if (input.action === "get") {
          const download = input.id && downloads.get(input.id);
          if (!download || download.state !== "completed")
            throw Error("Use a completed download ID");
          artifact = { name: download.name, mimeType: "application/octet-stream" };
        }
        data = [...downloads.entries()].map(([id, value]) => ({ id, ...value }));
        break;
      }
    }
    if (data === undefined) data = { ok: true };
    const serialized = JSON.stringify(data);
    if (serialized.length > 64000) data = { truncated: true, text: serialized.slice(0, 64000) };
    return {
      kind: "browser_action",
      operation: input.operation,
      data,
      ...(artifact ? { artifact } : {}),
    };
  }
  return {
    ready: () => client(),
    pendingDialog: () => {
      const dialog = dialogs.get(context.page());
      return dialog ? { type: dialog.type(), message: dialog.message() } : undefined;
    },
    perform: (input: BrowserCapabilityRequest, workspace: string) =>
      runWithBrowserDialog<BrowserCapabilityResult>(
        context.page(),
        () => execute(input, workspace),
        (dialog) => ({
          kind: "browser_action",
          operation: input.operation,
          data: { dialogPending: true, type: dialog.type(), message: dialog.message() },
        }),
      ),
  };
}
