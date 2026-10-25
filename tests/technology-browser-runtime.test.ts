import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import fastify from "fastify";
import staticFiles from "@fastify/static";
import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { prepareTechnology, prepareTechnologyStylesheet } from "../src/server/technology/prepare";
import { browserExecutablePath } from "../src/server/runtime/browser";

const runtimeDirectory = process.env.KITEVA_TECHNOLOGY_RUNTIME;

it.skipIf(!browserExecutablePath() || !runtimeDirectory)(
  "loads libraries from an explicitly prepared runtime and their CSS from project-local URLs",
  async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "technology-browser-"));
    const signal = new AbortController().signal;
    const server = fastify();
    await writeFile(
      path.join(workspace, "index.html"),
      "<!doctype html><html><body></body></html>",
    );
    await server.register(staticFiles, { root: workspace });
    const url = await server.listen({ host: "127.0.0.1", port: 0 });
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath(),
      headless: true,
      pipe: true,
    });
    try {
      for (const id of [
        "matter_js",
        "chartist",
        "remotion_shapes",
        "p5_js",
        "anime_js",
        "mo_js",
        "photoswipe",
        "cropper_js",
        "remotion_noise",
        "tldraw",
        "dragula",
        "leaflet",
      ]) {
        const prepared = await prepareTechnology(id, workspace, signal, runtimeDirectory);
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(String(error)));
        await page.goto(url);
        const exports = await page.evaluate<[], () => Promise<string[]>>(
          `import(${JSON.stringify(url + "/" + prepared.modulePath)}).then(module => Object.keys(module.technology))`,
        );
        expect(exports.length, id).toBeGreaterThan(0);
        if (id === "matter_js") {
          const y = await page.evaluate<[], () => Promise<number>>(
            `import(${JSON.stringify(url + "/" + prepared.modulePath)}).then(({technology}) => {
              const Matter = technology.default || technology;
              const engine = Matter.Engine.create();
              const body = Matter.Bodies.rectangle(0, 0, 10, 10);
              Matter.Composite.add(engine.world, body);
              Matter.Engine.update(engine, 1000 / 60);
              return body.position.y;
            })`,
          );
          expect(y).toBeGreaterThan(0);
        }
        expect(errors, id).toEqual([]);
        await page.close();
      }
      for (const [id, stylesheet] of [
        ["leaflet", "dist/leaflet.css"],
        ["photoswipe", "dist/photoswipe.css"],
        ["tldraw", "tldraw.css"],
      ]) {
        const css = await prepareTechnologyStylesheet(
          id,
          stylesheet,
          workspace,
          signal,
          runtimeDirectory,
        );
        const page = await browser.newPage();
        await page.goto(url);
        const failures: string[] = [];
        page.on("requestfailed", (request) => failures.push(request.url()));
        for (const cssPath of css.cssPaths) await page.addStyleTag({ url: url + "/" + cssPath });
        expect(failures, id).toEqual([]);
        await page.close();
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(workspace, { recursive: true, force: true });
    }
  },
  120000,
);
