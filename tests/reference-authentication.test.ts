import { credentialEnvironmentVariables } from "../src/server/runtime/credential-environment";
import {
  startAuthenticationBridge,
  pendingReferenceAuthentications,
  answerReferenceAuthentication,
} from "../src/server/agents/capabilities/reference-browser/authentication-bridge";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { expect, it, vi } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { createLocalReferenceBrowser } from "../src/server/jobs/subworkflows/website-reference";
import { isAuthenticationRedirect } from "../src/server/agents/capabilities/reference-browser/authentication";

it("recognizes authentication paths without treating ordinary redirects as sign-in", () => {
  for (const url of [
    "https://example.com/login",
    "https://example.com/oauth2/authorize",
    "https://example.com/cdn-cgi/access/login/app",
  ])
    expect(isAuthenticationRedirect(url)).toBe(true);
  expect(isAuthenticationRedirect("https://example.com/articles/login-guide")).toBe(false);
  expect(isAuthenticationRedirect("https://example.com/home")).toBe(false);
});

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

it
  .skipIf(!browserExecutablePath(true))
  .each(["complete", "cancel", "premature", "project", "manual", "public-password"])(
  "handles a human sign-in handoff: %s",
  async (action) => {
    const project = action === "project" || action === "manual";
    const workspace = await mkdtemp(path.join(os.tmpdir(), "reference-auth-"));
    let origin = "",
      loginOrigin = "";
    const site = createServer((req, res) => {
      if (action === "public-password") {
        res.end(
          '<!doctype html><title>Product controls</title><h1>Public interface</h1><input type="password" aria-label="Example secret control">',
        );
        return;
      }
      if (req.url === "/complete" && req.method === "POST") {
        res
          .writeHead(302, { "set-cookie": "fixture_login=yes; Path=/; HttpOnly", location: "/" })
          .end();
      } else if (req.headers.cookie?.includes("fixture_login=yes")) {
        res.end(
          "<!doctype html><title>Private reference</title><h1>Authenticated reference content</h1>",
        );
      } else
        res
          .writeHead(302, {
            location: loginOrigin + (action === "manual" ? "/checkpoint" : "/login"),
            ...(action === "manual" ? {} : { "www-authenticate": "fixture" }),
          })
          .end();
    });
    const identity = createServer((_req, res) =>
      res.end(
        `<!doctype html><title>${action === "manual" ? "Welcome" : "Sign in"}</title><form method="post" action="${origin}/complete"><button>Sign in</button></form>`,
      ),
    );
    origin = await listen(site);
    loginOrigin = await listen(identity);
    const launch = puppeteer.launch.bind(puppeteer);
    let handoff: Browser | undefined;
    const permissionChanges: Array<{ origin: string; states: string[] }> = [];
    const launches = vi.spyOn(puppeteer, "launch").mockImplementation(async (options) => {
      const browser = await launch({
        ...options,
        executablePath: browserExecutablePath(true),
        headless: true,
      });
      if (options?.headless === false) {
        handoff = browser;
        const context = browser.defaultBrowserContext();
        const setPermission = context.setPermission.bind(context);
        vi.spyOn(context, "setPermission").mockImplementation(async (origin, ...permissions) => {
          permissionChanges.push({
            origin,
            states: permissions.map((permission) => permission.state),
          });
          return setPermission(origin, ...permissions);
        });
      }
      return browser;
    });
    const controller = new AbortController();
    const bridge = project
      ? await startAuthenticationBridge(workspace, controller.signal, () => {})
      : undefined;
    if (bridge) {
      vi.stubEnv("KITEVA_AUTH_BRIDGE_URL", bridge.url);
      vi.stubEnv(credentialEnvironmentVariables.authenticationBridgeToken, bridge.token);
    }
    let session: Awaited<ReturnType<typeof createLocalReferenceBrowser>> | undefined;
    try {
      session = await createLocalReferenceBrowser(
        [origin],
        controller.signal,
        "local",
        false,
        workspace,
      );
      if (action === "public-password") {
        expect((await session.inspect(origin)).text).toContain("Public interface");
        expect(handoff).toBeUndefined();
        expect(launches).toHaveBeenCalledOnce();
        return;
      }
      let finished = false;
      const inspecting = session.inspect(origin, action === "manual").then((result) => {
        finished = true;
        return result;
      });
      void inspecting.catch(() => {});
      await vi.waitFor(() => expect(handoff).toBeDefined(), { timeout: 20000 });
      let loginPage: Awaited<ReturnType<Browser["newPage"]>> | undefined;
      await vi.waitFor(
        async () => {
          loginPage = (await handoff!.pages()).find((page) => page.url().startsWith(loginOrigin));
          expect(loginPage).toBeDefined();
        },
        { timeout: 10000 },
      );
      expect(finished).toBe(false);
      await vi.waitFor(
        () =>
          expect(permissionChanges).toContainEqual({
            origin: loginOrigin,
            states: ["granted", "granted"],
          }),
        { timeout: 10000 },
      );

      if (action === "cancel") {
        controller.abort(Error("Stop project"));
        await expect(inspecting).rejects.toThrow();
        expect(finished).toBe(false);
        return;
      }
      if (project) {
        await vi.waitFor(() => expect(pendingReferenceAuthentications(workspace)).toHaveLength(1));
        const request = pendingReferenceAuthentications(workspace)[0];
        answerReferenceAuthentication(workspace, request.id, "continue");
        await vi.waitFor(() =>
          expect(pendingReferenceAuthentications(workspace)[0].message).toContain("not complete"),
        );
        expect(finished).toBe(false);
      }
      if (action === "complete" || project) {
        await loginPage!.evaluate(() => document.querySelector("form")!.requestSubmit());
        await loginPage!.waitForFunction(
          () => document.body.innerText.includes("Authenticated reference content"),
          { timeout: 5000 },
        );
      }
      expect(finished).toBe(false);
      const confirmation = (await handoff!.pages()).find(
        (page) => page !== loginPage && page.url() === "about:blank" && !page.isClosed(),
      );
      // The instructions page is identified by its own title, not tab order.
      // Identity-provider pages can still be navigating; inspect only our stable instruction tab.
      const pages = (await handoff!.pages()).filter((page) => page.url() === "about:blank");
      // An unrelated blank tab may begin redirecting after pages() returns.
      const titles = await Promise.all(pages.map((page) => page.title().catch(() => "")));
      const instructions =
        pages[titles.findIndex((title) => title.includes("Continue after signing in"))];
      expect(confirmation).toBeDefined();
      await instructions.bringToFront();
      await instructions.evaluate(() => document.getElementById("continue")!.click());
      if (project) {
        expect(finished).toBe(false);
        const request = pendingReferenceAuthentications(workspace)[0];
        expect(request).toBeDefined();
        answerReferenceAuthentication(workspace, request.id, "continue");
      }
      if (action === "premature") {
        await expect(inspecting).rejects.toThrow("Sign-in is not complete");
        expect(permissionChanges).toContainEqual({
          origin: loginOrigin,
          states: ["denied", "denied"],
        });
        expect(finished).toBe(false);
        return;
      }
      expect((await inspecting).text).toContain("Authenticated reference content");
      expect(permissionChanges).toContainEqual({
        origin: loginOrigin,
        states: ["denied", "denied"],
      });
      expect((await session.inspect(origin)).text).toContain("Authenticated reference content");
      await expect(session.inspect(loginOrigin)).rejects.toThrow("supplied website origins");
      const signedIn = (await handoff!.pages()).find((page) => page.url().startsWith(origin))!;
      expect(launches.mock.calls[1][0]?.defaultViewport).toBeNull();
      expect(launches.mock.calls[1][0]?.args).toContain("--window-size=1440,1000");
      expect(signedIn.viewport()).toBeNull();
      const protocol = await signedIn.createCDPSession();
      const { windowId } = await protocol.send("Browser.getWindowForTarget");
      await protocol.send("Browser.setWindowBounds", {
        windowId,
        bounds: { width: 1000, height: 700 },
      });
      await vi.waitFor(async () =>
        expect(await signedIn.evaluate(() => window.innerWidth)).toBeLessThan(1100),
      );
      expect(signedIn.viewport()).toBeNull();
      await protocol.detach();
      expect(launches).toHaveBeenCalledTimes(2);
      expect(launches.mock.calls[1][0]?.userDataDir).toBe(launches.mock.calls[0][0]?.userDataDir);
      if (action === "complete") {
        await session.close();
        session = await createLocalReferenceBrowser(
          [origin],
          controller.signal,
          "local",
          false,
          workspace,
        );
        expect((await session.inspect(origin)).text).toContain("Authenticated reference content");
        expect(launches).toHaveBeenCalledTimes(3);
        expect(launches.mock.calls[2][0]?.userDataDir).toBe(launches.mock.calls[0][0]?.userDataDir);
      }
    } finally {
      controller.abort();
      await session?.close();
      await bridge?.close();
      vi.unstubAllEnvs();
      launches.mockRestore();
      await Promise.all(
        [site, identity].map(
          (server) =>
            new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            ),
        ),
      );
      await rm(workspace, { recursive: true, force: true });
    }
  },
  60000,
);
