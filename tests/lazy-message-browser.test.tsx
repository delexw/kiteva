import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageResponse } from "../src/client/components/ai-elements/message";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it("keeps message text and basic formatting visible during server rendering", () => {
  const html = renderToStaticMarkup(<MessageResponse>{"**An original idea**"}</MessageResponse>);
  expect(html).toContain('data-streamdown="strong">An original idea');
});

it.skipIf(!browserExecutablePath())(
  "loads rich rendering on demand without losing math, diagrams or highlighting",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "rich-message-"));
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.data/**"] } },
      plugins: [
        react(),
        {
          name: "rich-message-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/message-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{MessageResponse}from'/src/client/components/ai-elements/message.tsx';
const text=${JSON.stringify("**An original idea**\n\n```javascript\nconst greeting = 'hello';\n```\n\n$$\nx^2 + y^2\n$$\n\n```mermaid\ngraph TD; A[Idea]-->B[Film];\n```")};
function App(){const[show,setShow]=useState(false);return React.createElement('main',null,React.createElement('button',{onClick:()=>setShow(true)},'Show message'),show&&React.createElement(MessageResponse,{isAnimating:false},text));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
              );
              res.setHeader("Content-Type", "text/html");
              res.end(html);
            });
          },
        },
      ],
    });
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath(),
      headless: "shell",
      pipe: true,
    });
    try {
      await server.listen();
      const page = await browser.newPage();
      const requests: string[] = [];
      const errors: string[] = [];
      page.on("request", (request) => requests.push(request.url()));
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${server.resolvedUrls!.local[0]}message-test`);
      await page.waitForSelector("button");
      expect(requests.some((url) => url.includes("rich-message-response"))).toBe(false);
      await page.click("button");
      await page.waitForSelector(".katex");
      await page.waitForSelector('[data-streamdown="mermaid"] svg');
      await page.waitForSelector('[data-language="javascript"] code span[style*="--sdm-c"]');
      expect(await page.$eval('[data-streamdown="strong"]', (element) => element.textContent)).toBe(
        "An original idea",
      );
      expect(requests.some((url) => url.includes("rich-message-response"))).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60_000,
);
