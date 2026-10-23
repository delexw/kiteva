import { expect, it } from "vitest";
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { appRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { buildApplicationDemoRoutePrompt } from "../src/server/domains/video/route-prompts/application-demo";
import { applicationDemoCapturePrompt } from "../src/server/domains/video/route-prompts/application-demo/capture";

it.skipIf(!browserExecutablePath())(
  "parses and renders all stage workflow diagrams with Mermaid",
  async () => {
    const prompts = [
      buildApplicationDemoRoutePrompt("hyperframes", "planning"),
      applicationDemoCapturePrompt,
      buildApplicationDemoRoutePrompt("multiplane", "assembly"),
      await readFile(path.join(appRoot, "docs/chapter-capture-timing.md"), "utf8"),
    ];
    const diagrams = prompts.map((prompt) => {
      const matches = [...prompt.matchAll(/```mermaid\n([\s\S]*?)```/g)];
      expect(matches).toHaveLength(1);
      return matches[0][1];
    });
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "prompt-mermaid-"));
    const server = await createServer({
      configFile: false,
      root: appRoot,
      cacheDir,
      server: { host: "127.0.0.1", port: 0 },
      plugins: [
        {
          name: "prompt-diagrams",
          configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
              if (request.url !== "/prompt-diagrams") return next();
              response.setHeader("Content-Type", "text/html");
              response.end(
                await server.transformIndexHtml(
                  request.url,
                  `<!doctype html><body><script type="module">
import mermaid from 'mermaid';
mermaid.initialize({startOnLoad:false});
try {
  const diagrams = ${JSON.stringify(diagrams)};
  for (const [index, source] of diagrams.entries()) {
    await mermaid.parse(source);
    const {svg} = await mermaid.render('workflow'+index, source);
    const panel=document.createElement('section'); panel.innerHTML=svg; document.body.append(panel);
  }
  window.diagramResult={count:document.querySelectorAll('section svg').length};
} catch(error) { window.diagramResult={error:String(error)}; }
</script>`,
                ),
              );
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
      await page.goto(server.resolvedUrls!.local[0] + "prompt-diagrams");
      await page.waitForFunction(() =>
        Boolean((window as unknown as { diagramResult?: unknown }).diagramResult),
      );
      expect(
        await page.evaluate(() => (window as unknown as { diagramResult: unknown }).diagramResult),
      ).toEqual({ count: 4 });
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
