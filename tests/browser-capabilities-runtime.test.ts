import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { createLocalReferenceBrowser } from "../src/server/jobs/subworkflows/website-reference";
import { browserExecutablePath } from "../src/server/runtime/browser";
import {
  BrowserCapabilityRequestSchema,
  browserCapabilities,
  type BrowserCapabilityRequest,
} from "../src/server/agents/capabilities/reference-browser/tool-registry";

const recording = vi.hoisted(() => ({
  id: "00000000-0000-4000-8000-000000000001",
  close: vi.fn(async () => {}),
  prepare: vi.fn(async () => ({
    kind: "editable_capture",
    recordingId: "00000000-0000-4000-8000-000000000001",
    duration: 1,
    tools: [],
  })),
}));
vi.mock("../src/server/jobs/subworkflows/website-capture", async (original) => ({
  ...(await original<typeof import("../src/server/jobs/subworkflows/website-capture")>()),
  startWebsiteCapture: vi.fn(async () => recording),
}));

it("validates every published capability and its argument limits", () => {
  expect(Object.keys(browserCapabilities)).toHaveLength(17);
  expect(
    BrowserCapabilityRequestSchema.safeParse({
      operation: "browser_wait",
      condition: "text",
      value: "ready",
      timeout: 30001,
    }).success,
  ).toBe(false);
  expect(
    BrowserCapabilityRequestSchema.safeParse({
      operation: "browser_pointer",
      action: "wheel",
      deltaY: 1801,
    }).success,
  ).toBe(false);
  expect(BrowserCapabilityRequestSchema.safeParse({ operation: "unknown" }).success).toBe(false);
});

it.skipIf(!browserExecutablePath())(
  "runs the expanded browser capabilities in the isolated browser",
  async () => {
    let cacheRequests = 0;
    const server = createServer((request, response) => {
      if (request.url === "/cache") {
        response.setHeader("content-type", "application/json");
        response.setHeader("cache-control", "max-age=60");
        response.end(JSON.stringify({ count: ++cacheRequests }));
        return;
      }
      if (request.url === "/headers") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(request.headers));
        return;
      }
      if (request.url === "/download") {
        response.writeHead(200, {
          "content-type": "application/octet-stream",
          "content-disposition": 'attachment; filename="sample.txt"',
        });
        response.end("sample download");
        return;
      }
      response.setHeader("content-type", "text/html");
      if (request.url === "/frame") {
        response.end("<h1>Embedded page</h1><button>Frame action</button>");
        return;
      }
      response.end(`<!doctype html><title>Capability fixture</title><h1>Browser example</h1>
      <input id="text" aria-label="Title"><input id="date" type="date"><input id="number" type="number"><input id="secret" type="password"><input id="check" type="checkbox">
      <select id="select"><option value="first">First</option><option value="second">Second</option></select>
      <div id="editable" contenteditable="true">Editable</div>
      <button id="double" ondblclick="document.querySelector('output').textContent='Double clicked'">Double</button>
      <button id="hover" onmouseover="this.textContent='Hovered'">Hover</button>
      <button id="popup" onclick="window.open('/popup','_blank')">Popup</button>
      <div id="html-drag" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','sample')" style="width:80px;height:40px">Drag item</div>
      <div id="html-drop" ondragover="event.preventDefault()" ondrop="event.preventDefault();this.textContent=event.dataTransfer.getData('text/plain')" style="width:80px;height:40px">Drop here</div>
      <button id="prompt" onclick="window.answer=prompt('Example question','default')">Prompt</button>
      <div id="drag" style="width:80px;height:40px" onmousedown="this.textContent='Dragging'">Drag</div>
      <div id="drop" style="width:80px;height:40px" onmouseup="this.textContent='Dropped'">Drop</div>
      <a href="/next" id="next">Next</a><a href="/download" id="download">Download</a><output></output>
      <div id="panel" style="width:200px;height:100px;overflow:auto"><div style="width:600px;height:600px">Panel content</div></div><audio id="media"></audio><iframe src="/frame"></iframe><div id="host"></div>
      <div style="height:1800px"></div><button id="bottom">Bottom</button>
      <script>console.log('fixture ready');document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<button id="shadow">Shadow action</button>';window.marker='original';</script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw Error("No fixture address");
    const url = `http://127.0.0.1:${address.port}`;
    const workspace = await mkdtemp(path.join(os.tmpdir(), "browser-capabilities-"));
    const browser = await createLocalReferenceBrowser(
      [url],
      new AbortController().signal,
      "local",
      false,
    );
    const perform = async (request: unknown) => {
      return browser.perform(
        BrowserCapabilityRequestSchema.parse(request) as BrowserCapabilityRequest,
        workspace,
      );
    };
    const evaluate = async (expression: string) =>
      (await perform({ operation: "browser_evaluate", expression })).data;
    try {
      await browser.inspect(url);
      expect(
        (await perform({ operation: "browser_element", action: "inspect", target: "#text" })).data,
      ).toMatchObject({ tag: "INPUT", value: "", visible: true });
      await perform({ operation: "browser_element", action: "hover", target: "#hover" });
      expect(await evaluate('document.querySelector("#hover").textContent')).toBe("Hovered");
      await perform({ operation: "browser_element", action: "focus", target: "#text" });
      await perform({ operation: "browser_keyboard", action: "type", text: "Example" });
      await perform({ operation: "browser_keyboard", action: "press", key: "End" });
      await perform({ operation: "browser_keyboard", action: "insert", text: " title" });
      expect(await evaluate('document.querySelector("#text").value')).toBe("Example title");
      await perform({
        operation: "browser_element",
        action: "select",
        target: "#select",
        values: ["second"],
      });
      await perform({
        operation: "browser_element",
        action: "select",
        target: "#select",
        values: ["First"],
        selectBy: "label",
      });
      expect(await evaluate('document.querySelector("#select").value')).toBe("first");
      await perform({
        operation: "browser_element",
        action: "select",
        target: "#select",
        values: ["Second"],
        selectBy: "label",
      });
      await perform({
        operation: "browser_pointer",
        action: "wheel",
        target: "#panel",
        deltaY: 200,
        deltaX: 100,
      });
      await expect
        .poll(() => evaluate('document.querySelector("#panel").scrollTop'))
        .toBeGreaterThan(0);
      await expect
        .poll(() => evaluate('document.querySelector("#panel").scrollLeft'))
        .toBeGreaterThan(0);
      await perform({ operation: "browser_element", action: "scroll", target: "#text" });
      await perform({
        operation: "browser_element",
        action: "check",
        target: "#check",
        checked: true,
      });
      await perform({
        operation: "browser_element",
        action: "fill",
        target: "#date",
        value: "2026-01-01",
      });
      await perform({
        operation: "browser_element",
        action: "fill",
        target: "#number",
        value: "12",
      });
      await perform({
        operation: "browser_element",
        action: "fill",
        target: "#editable",
        value: "Changed",
      });
      await expect(
        perform({
          operation: "browser_element",
          action: "fill",
          target: "#secret",
          value: "not permitted",
        }),
      ).rejects.toThrow("input type");
      expect(
        await evaluate(
          '[document.querySelector("#select").value,document.querySelector("#check").checked,document.querySelector("#date").value,document.querySelector("#number").value,document.querySelector("#editable").textContent]',
        ),
      ).toEqual(["second", true, "2026-01-01", "12", "Changed"]);
      await perform({
        operation: "browser_pointer",
        action: "click",
        target: "#double",
        clickCount: 2,
      });
      expect(await evaluate('document.querySelector("output").textContent')).toBe("Double clicked");
      await perform({
        operation: "browser_pointer",
        action: "drag",
        target: "#drag",
        destination: "#drop",
      });
      expect(await evaluate('document.querySelector("#drop").textContent')).toBe("Dropped");
      await perform({
        operation: "browser_pointer",
        action: "drag",
        target: "#html-drag",
        destination: "#html-drop",
      });
      expect(await evaluate('document.querySelector("#html-drop").textContent')).toBe("sample");
      await perform({ operation: "browser_pointer", action: "click", target: "#prompt" });
      expect(
        (await perform({ operation: "browser_dialog", action: "inspect" })).data,
      ).toMatchObject({ type: "prompt", message: "Example question" });
      await perform({ operation: "browser_dialog", action: "accept", text: "Sample answer" });
      expect(await evaluate("window.answer")).toBe("Sample answer");
      await perform({
        operation: "browser_wait",
        condition: "visible",
        target: "#text",
        timeout: 1000,
      });
      await perform({
        operation: "browser_wait",
        condition: "enabled",
        target: "#text",
        timeout: 1000,
      });
      await perform({
        operation: "browser_wait",
        condition: "hidden",
        target: "#absent",
        timeout: 1000,
      });
      await perform({
        operation: "browser_wait",
        condition: "text",
        value: "Browser example",
        timeout: 1000,
      });
      await perform({
        operation: "browser_wait",
        condition: "url",
        value: "127.0.0.1",
        timeout: 1000,
      });
      await expect(
        perform({
          operation: "browser_wait",
          condition: "visible",
          target: "#absent",
          timeout: 100,
        }),
      ).rejects.toThrow();
      expect(
        (
          await perform({
            operation: "browser_element",
            action: "inspect",
            target: "pierce/#shadow",
          })
        ).data,
      ).toMatchObject({ text: "Shadow action" });
      const frames = (await perform({ operation: "browser_frames", action: "list" })).data as {
        id: string;
        url: string;
      }[];
      await perform({
        operation: "browser_frames",
        action: "select",
        frameId: frames.find((frame) => frame.url.endsWith("/frame"))!.id,
      });
      expect((await browser.inspect()).text).toContain("Embedded page");
      await perform({ operation: "browser_frames", action: "main" });
      await perform({
        operation: "browser_session",
        action: "set_storage",
        key: "fixture",
        value: "value",
      });
      expect((await perform({ operation: "browser_session", action: "storage" })).data).toEqual({
        fixture: "value",
      });
      await perform({ operation: "browser_session", action: "clear_storage" });
      await perform({
        operation: "browser_session",
        action: "set_cookie",
        key: "sample",
        value: "value",
      });
      expect((await perform({ operation: "browser_session", action: "cookies" })).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "sample", value: "value" })]),
      );
      await perform({ operation: "browser_session", action: "clear_cookies" });
      await perform({
        operation: "browser_session",
        action: "permission",
        permission: "geolocation",
        state: "granted",
      });
      expect((await perform({ operation: "browser_diagnostics", action: "console" })).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ text: "fixture ready" })]),
      );
      expect(
        (await perform({ operation: "browser_diagnostics", action: "metrics" })).data,
      ).toHaveProperty("JSHeapUsedSize");
      expect((await perform({ operation: "browser_diagnostics", action: "dom" })).data).toContain(
        "Browser example",
      );
      expect(
        (await perform({ operation: "browser_diagnostics", action: "accessibility" })).data,
      ).toBeTruthy();
      const network = (await perform({ operation: "browser_diagnostics", action: "network" }))
        .data as { id: string; url: string }[];
      expect(
        (
          await perform({
            operation: "browser_diagnostics",
            action: "response_body",
            requestId: network.find((entry) => entry.url.endsWith("/frame"))!.id,
          })
        ).data,
      ).toContain("Embedded page");
      for (const request of [
        { action: "viewport", width: 1100, height: 800 },
        { action: "user_agent", value: "ExampleBrowser/1.0" },
        { action: "locale", value: "en-NZ" },
        { action: "timezone", value: "Pacific/Auckland" },
        { action: "geolocation", latitude: -36.85, longitude: 174.76 },
        { action: "media", colourScheme: "dark", reducedMotion: true },
        { action: "cpu", rate: 1 },
        { action: "vision", value: "none" },
      ])
        await perform({ operation: "browser_emulate", ...request });
      expect(await evaluate("navigator.userAgent")).toBe("ExampleBrowser/1.0");
      expect(await evaluate('matchMedia("(prefers-color-scheme: dark)").matches')).toBe(true);
      for (const request of [
        { action: "cache", enabled: false },
        { action: "service_workers", enabled: false },
        { action: "throttle", enabled: false },
        { action: "headers", headers: { "X-Demo": "sample" } },
        { action: "block", patterns: [] },
      ])
        await perform({ operation: "browser_network", ...request });
      expect(await evaluate("fetch('/headers').then(r=>r.json()).then(h=>h['x-demo'])")).toBe(
        "sample",
      );
      await perform({ operation: "browser_network", action: "offline", enabled: true });
      await perform({ operation: "browser_network", action: "throttle", enabled: false });
      expect(await evaluate("navigator.onLine")).toBe(false);

      expect(await evaluate("fetch('/probe').then(()=> 'loaded',()=> 'offline')")).toBe("offline");
      await perform({ operation: "browser_network", action: "offline", enabled: false });
      await perform({ operation: "browser_network", action: "cache", enabled: true });
      expect(await evaluate("fetch('/cache').then(r=>r.json()).then(r=>r.count)")).toBe(1);
      expect(await evaluate("fetch('/cache').then(r=>r.json()).then(r=>r.count)")).toBe(1);
      await perform({ operation: "browser_network", action: "cache", enabled: false });
      expect(await evaluate("fetch('/cache').then(r=>r.json()).then(r=>r.count)")).toBe(2);
      await perform({ operation: "browser_network", action: "block", patterns: ["/blocked"] });
      expect(await evaluate("fetch('/blocked').then(()=> 'loaded',()=> 'blocked')")).toBe(
        "blocked",
      );
      await perform({ operation: "browser_network", action: "block", patterns: [] });
      await perform({ operation: "browser_network", action: "throttle", latency: 100 });
      const networkStarted = performance.now();
      await evaluate("fetch('/probe').then(r=>r.text())");
      expect(performance.now() - networkStarted).toBeGreaterThanOrEqual(90);
      await perform({ operation: "browser_network", action: "throttle", enabled: false });

      await expect(
        perform({
          operation: "browser_network",
          action: "headers",
          headers: { Authorization: "blocked" },
        }),
      ).rejects.toThrow("Credential");
      for (const format of ["png", "pdf"]) {
        const capture = await perform({ operation: "browser_capture", format, fullPage: true });
        const bytes = await readFile(path.join(workspace, "assets", capture.artifact!.name));
        expect(bytes.length).toBeGreaterThan(100);
        expect(
          format === "pdf" ? bytes.subarray(0, 4).toString() : bytes.subarray(0, 8).toString("hex"),
        ).toBe(format === "pdf" ? "%PDF" : "89504e470d0a1a0a");
      }
      expect(
        (await perform({ operation: "browser_media", action: "inspect", target: "#media" })).data,
      ).toMatchObject({ paused: true, currentTime: 0 });
      await perform({ operation: "browser_media", action: "rate", target: "#media", rate: 1.5 });
      await perform({ operation: "browser_media", action: "mute", target: "#media", muted: true });
      await perform({ operation: "browser_debug", action: "trace_start" });
      const trace = await perform({ operation: "browser_debug", action: "trace_stop" });
      expect(
        (await readFile(path.join(workspace, "assets", trace.artifact!.name), "utf8")).length,
      ).toBeGreaterThan(100);
      await perform({ operation: "browser_debug", action: "coverage_start" });
      const coverage = await perform({ operation: "browser_debug", action: "coverage_stop" });
      expect(
        JSON.parse(await readFile(path.join(workspace, "assets", coverage.artifact!.name), "utf8")),
      ).toHaveProperty("javascript");
      expect(
        (await perform({ operation: "browser_debug", action: "scripts" })).data,
      ).toBeInstanceOf(Array);
      await perform({ operation: "browser_downloads", action: "enable" });
      await perform({ operation: "browser_pointer", action: "click", target: "#download" });
      await expect
        .poll(async () =>
          JSON.stringify((await perform({ operation: "browser_downloads", action: "list" })).data),
        )
        .toContain("completed");
      const downloads = (await perform({ operation: "browser_downloads", action: "list" }))
        .data as { id: string }[];
      const downloaded = await perform({
        operation: "browser_downloads",
        action: "get",
        id: downloads[0].id,
      });
      expect(
        await readFile(path.join(workspace, "assets", downloaded.artifact!.name), "utf8"),
      ).toBe("sample download");
      await perform({ operation: "browser_downloads", action: "disable" });
      const tabs = (await perform({ operation: "browser_tabs", action: "list" })).data as {
        id: string;
        active: boolean;
      }[];
      const original = tabs.find((tab) => tab.active)!.id;
      await perform({ operation: "browser_tabs", action: "new", url: url + "/other" });
      await perform({ operation: "browser_tabs", action: "switch", tabId: original });
      await expect(
        perform({ operation: "browser_tabs", action: "new", url: "https://example.net/" }),
      ).rejects.toThrow("supplied");
      await perform({ operation: "browser_pointer", action: "click", target: "#popup" });
      await expect
        .poll(async () =>
          JSON.stringify((await perform({ operation: "browser_tabs", action: "list" })).data),
        )
        .toContain("/popup");
      const popupTabs = (await perform({ operation: "browser_tabs", action: "list" })).data as {
        id: string;
        url: string;
      }[];
      const popupId = popupTabs.find((tab) => tab.url.endsWith("/popup"))!.id;
      await perform({ operation: "browser_tabs", action: "switch", tabId: popupId });
      expect((await browser.inspect()).url).toBe(url + "/popup");
      await perform({ operation: "browser_tabs", action: "close", tabId: popupId });
      await perform({ operation: "browser_tabs", action: "switch", tabId: original });
      await browser.inspect(url + "/next");
      expect((await perform({ operation: "browser_navigate", action: "back" })).data).toMatchObject(
        { url: url + "/" },
      );
      expect(
        (await perform({ operation: "browser_navigate", action: "forward" })).data,
      ).toMatchObject({ url: url + "/next" });
      await perform({ operation: "browser_navigate", action: "reload" });
      const heap = await perform({ operation: "browser_debug", action: "heap" });
      expect(
        (await readFile(path.join(workspace, "assets", heap.artifact!.name))).length,
      ).toBeGreaterThan(100);
      await browser.inspect(url);
      await perform({
        operation: "browser_emulate",
        action: "viewport",
        width: 1100,
        height: 800,
        touch: true,
      });
      const take = await browser.startRecording(workspace);
      await perform({ operation: "browser_pointer", action: "move", x: 50, y: 50 });
      await perform({ operation: "browser_pointer", action: "click", target: "#double" });
      await perform({
        operation: "browser_pointer",
        action: "drag",
        target: "#drag",
        destination: "#drop",
      });
      await perform({ operation: "browser_pointer", action: "tap", target: "#double" });
      expect(recording).not.toHaveProperty("cursor");
      for (const request of [
        { operation: "browser_tabs", action: "new", url: url + "/other" },
        { operation: "browser_emulate", action: "viewport", width: 1200, height: 800 },
        { operation: "browser_debug", action: "pause" },
      ])
        await expect(perform(request)).rejects.toThrow("Stop the active take");
      await browser.prepareRecording(take);
      await perform({ operation: "browser_element", action: "scroll", target: "#bottom" });
      expect(
        (
          (await perform({ operation: "browser_element", action: "inspect", target: "#bottom" }))
            .data as { bounds: { y: number } }
        ).bounds.y,
      ).toBeLessThan(800);
    } finally {
      await browser.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(workspace, { recursive: true, force: true });
    }
  },
  90000,
);
