import { waitForProjectAuthentication } from "./authentication-client";
import type { Browser, HTTPRequest, Page, Target } from "puppeteer-core";
import { validateReferenceUrl } from "../../../requests/reference-url";
import { configureReferencePermissions, grantAuthenticationNetworkAccess } from "./permissions";

export function isAuthenticationRedirect(value: string) {
  return /(?:^|\/)(?:login|sign[-_]?in|oauth2?|authorize|sso)(?:\/|$)|\/cdn-cgi\/access\//i.test(
    new URL(value).pathname,
  );
}

/** Runs in the page. A standalone password control or Sign in link is not a login wall. */
export function referencePageNeedsAuthentication() {
  return (
    [...document.querySelectorAll('input[type="password"]')].some(
      (element) => element.getClientRects().length > 0 && element.closest("form") !== null,
    ) ||
    (/sign in|log in|login|authenticate/i.test(document.title) &&
      /sign in|log in|login|authenticate/i.test(document.body?.innerText ?? ""))
  );
}

/** Human-only handoff: no inspection, recording or model tool execution during authentication. */
export async function authenticateReferenceBrowser(
  browser: Browser,
  url: string,
  origins: Set<string>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const configured = new Map<Page, (request: HTTPRequest) => void>();
  const setups = new WeakMap<Page, Promise<void>>();
  const permissions = new Map<string, Promise<() => Promise<unknown>>>();
  function configure(page: Page) {
    const existing = setups.get(page);
    if (existing) return existing;
    const listener = (request: HTTPRequest) => {
      void (async () => {
        if (request.isInterceptResolutionHandled()) return;
        try {
          signal.throwIfAborted();
          if (!/^(?:data|blob|about):/.test(request.url()))
            await validateReferenceUrl(request.url(), "local");
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame() &&
            /^https?:/.test(request.url())
          ) {
            const origin = new URL(request.url()).origin;
            let grant = permissions.get(origin);
            if (!grant) {
              grant = grantAuthenticationNetworkAccess(browser.defaultBrowserContext(), origin);
              permissions.set(origin, grant);
            }
            await grant;
          }
          if (!request.isInterceptResolutionHandled()) await request.continue();
        } catch {
          if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => {});
        }
      })();
    };
    configured.set(page, listener);
    page.on("request", listener);
    const setup = page.setRequestInterception(true);
    setups.set(page, setup);
    return setup;
  }
  const onTarget = (target: Target) => {
    void target
      .page()
      .then((page) => page && configure(page))
      .catch(() => {});
  };
  browser.on("targetcreated", onTarget);
  const instructions = await browser.newPage();
  try {
    await instructions.setContent(`<!doctype html><title>Kiteva — Continue after signing in</title>
      <main style="max-width:620px;margin:12vh auto;font:18px system-ui;line-height:1.6">
      <h1>Sign in to your website</h1><p>Complete sign-in in the other tab. Then return here and continue.
      Kiteva is waiting and will not read or record your sign-in.</p>
      <button id="continue" onclick="this.dataset.done='true'" style="font:inherit;padding:12px 24px;cursor:pointer">Continue after signing in</button></main>`);
    const page = await browser.newPage();
    await configure(page);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.bringToFront();
    async function authenticatedPage() {
      signal.throwIfAborted();
      const pages = await browser.pages();
      const authenticated = pages.find(
        (tab) => origins.has(new URL(tab.url()).origin) && !isAuthenticationRedirect(tab.url()),
      );
      if (!authenticated || (await authenticated.evaluate(referencePageNeedsAuthentication)))
        throw Error("Sign-in is not complete. Return to the supplied website before continuing.");
      return authenticated;
    }
    const projectHandoff = await waitForProjectAuthentication(
      url,
      signal,
      () => page.bringToFront(),
      async () => {
        await authenticatedPage();
      },
    );
    if (!projectHandoff)
      await instructions.waitForFunction(
        () => document.getElementById("continue")?.dataset.done === "true",
        { timeout: 480000, signal, polling: "mutation" },
      );
    const authenticated = await authenticatedPage();
    const pages = await browser.pages();
    // Do not expose identity-provider tabs or callback URLs to subsequent agent tools.
    await Promise.all(
      pages
        .filter((tab) => tab !== authenticated && tab !== instructions)
        .map((tab) => tab.close()),
    );
    await authenticated.bringToFront();
    return authenticated;
  } finally {
    browser.off("targetcreated", onTarget);
    for (const [page, listener] of configured) {
      page.off("request", listener);
      if (!page.isClosed()) await page.setRequestInterception(false).catch(() => {});
    }
    await instructions.close().catch(() => {});
    if (browser.connected) {
      for (const grant of permissions.values()) await (await grant)();
      await configureReferencePermissions(browser.defaultBrowserContext(), [...origins], "local");
    }
  }
}
