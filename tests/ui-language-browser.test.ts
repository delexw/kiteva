import { browserDependencyScan } from "../vite.resolve";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { appRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { loadCatalog } from "../src/server/catalog/catalog";
import { CatalogDisplayText } from "../src/client/i18n/catalog-content";
import { UiLanguageService } from "../src/client/i18n/service";
import { technologyEntries } from "../src/client/technology-pool-model";

it.skipIf(!browserExecutablePath())(
  "switches catalogs and Governance, translates every motion and technology detail, and preserves project settings",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "ui-language-"));
    const mutations: string[] = [];
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: { "@": path.join(appRoot, "src/client") } },
      server: {
        host: "127.0.0.1",
        port: 0,
        // Other workflow tests generate HTML here; those files must not reload this fixture.
        watch: { ignored: ["**/.data/**"] },
      },
      plugins: [
        react(),
        {
          name: "ui-language-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.startsWith("/api/")) {
                if (req.method !== "GET") mutations.push(req.url);
                res.setHeader("Content-Type", "application/json");
                res.end(
                  req.url === "/api/motions"
                    ? JSON.stringify(
                        JSON.parse(
                          await readFile(
                            path.join(appRoot, "assets/catalog/motion-pattern-catalog.json"),
                            "utf8",
                          ),
                        ).patterns,
                      )
                    : "{}",
                );
                return;
              }
              if (req.url === "/motion-language-test") {
                const html = await server.transformIndexHtml(
                  req.url,
                  `<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import{UiLanguageProvider,UiLanguageSwitch}from'/src/client/i18n/index.tsx';
import{MotionExplorer}from'/src/client/motion-explorer.tsx';
import'/src/client/framework.css';import'/src/client/style.css';
const h=React.createElement;createRoot(document.getElementById('root')).render(h(UiLanguageProvider,null,h(MemoryRouter,null,h(UiLanguageSwitch),h(MotionExplorer))));</script>`,
                );
                res.setHeader("Content-Type", "text/html");
                res.end(html);
                return;
              }
              if (req.url !== "/language-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import{UiLanguageProvider,UiLanguageSwitch}from'/src/client/i18n/index.tsx';
import{StyleCard}from'/src/client/style-card.tsx';import{MotionCard}from'/src/client/motion-card.tsx';
import{TechnologyPoolPage}from'/src/client/technology-pool-page.tsx';
import{TechnologyCard}from'/src/client/components/technology-card.tsx';
import{technologyEntries}from'/src/client/technology-pool-model.ts';
import{MotionGraphicVariants}from'/src/client/catalog-variants.tsx';
import{RecommendedStack}from'/src/client/recommended-stack.tsx';
import{technologyPool}from'/src/shared/technology-pool.ts';
import{GovernanceUsageTable}from'/src/client/governance/usage-table.tsx';
import{VideoLanguageControl}from'/src/client/components/video-language-control.tsx';
import styles from'/assets/catalog/video-style-catalog.json';import motions from'/assets/catalog/motion-pattern-catalog.json';
import'/src/client/framework.css';import'/src/client/style.css';
const h=React.createElement;function App(){const[language,setLanguage]=useState('en');return h(UiLanguageProvider,null,h(MemoryRouter,null,h(UiLanguageSwitch),h('output',{id:'project-output'},language),h('input',{id:'original-idea',defaultValue:'My original idea'}),h(VideoLanguageControl,{value:language,onChange:setLanguage}),h('div',{className:'style-grid'},h(StyleCard,{style:styles.styles[136],onSelect(){},showPalette:false}),h(MotionCard,{motion:motions.patterns[42],playbackEnabled:false,onSelect(){}})),h(GovernanceUsageTable,{byFunction:true,rows:[{model:'example-model',purpose:'Brief preparation',calls:1,tools:0,cacheHits:0,inputTokens:100,outputTokens:20,cachedTokens:null,costLow:0.01,costHigh:0.01,costBasis:'Published Jev API rate'}]}),h('section',{id:'detail-translations'},h(MotionGraphicVariants,{variants:styles.styles[2].motion_graphic_variants}),h(RecommendedStack,{libraries:[technologyPool.gsap],implementation:styles.styles[2].tech.implementation,selectionGuidance:styles.styles[2].tech.library_selection})),h(TechnologyPoolPage),h('section',{id:'technology-card-translations'},...technologyEntries.map(entry=>h('div',{'data-technology-key':entry.key,key:entry.key},h(TechnologyCard,{entry}))))));}createRoot(document.getElementById('root')).render(h(App));</script>`,
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
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.setViewport({ width: 1440, height: 1000 });
      await page.goto(`${server.resolvedUrls!.local[0]}language-test`);
      await page.waitForSelector('[data-style-id="style-137"]');
      expect(await page.$eval('[data-style-id="style-137"] h3', (node) => node.textContent)).toBe(
        "Cassette Futurism",
      );
      await page.click(".room-language-switch .ant-segmented-item:last-child");
      await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
      expect(await page.$eval('[data-style-id="style-137"] h3', (node) => node.textContent)).toBe(
        "卡带未来主义",
      );
      expect(await page.$eval('[data-style-id="motion-043"] h3', (node) => node.textContent)).toBe(
        "360° 相机环绕",
      );
      expect(
        await page.$eval('[data-motion-id="motion-043"] canvas', (node) =>
          node.getAttribute("aria-label"),
        ),
      ).toContain("360° 相机环绕");
      expect(await page.$eval(".governance-ant-table", (node) => node.textContent)).toContain(
        "Jev 公布的 API 费率",
      );
      expect(await page.$eval("#project-output", (node) => node.textContent)).toBe("en");
      expect(await page.$eval("#original-idea", (node) => (node as HTMLInputElement).value)).toBe(
        "My original idea",
      );
      const detailText = await page.$eval("#detail-translations", (node) => node.textContent || "");
      expect(detailText).not.toContain(
        "A poster-like explainer anchored on one fixed cut-out device",
      );
      expect(detailText).not.toContain("Optional named variants of this Motion Graphic");
      expect(detailText).toContain("可选");
      await page.type('[aria-label="搜索技术"]', "碰撞");
      await page.waitForFunction(
        () => document.querySelectorAll(".technology-pool-table .ant-table-row").length === 1,
      );
      expect(await page.$eval(".technology-pool-table", (node) => node.textContent)).toContain(
        "Matter.js",
      );
      await page.setViewport({ width: 390, height: 844 });
      expect(
        await page.$eval(".room-language-switch", (node) => {
          const r = node.getBoundingClientRect();
          return r.left >= 0 && r.right <= 390;
        }),
      ).toBe(true);
      await page.reload();
      await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
      expect(await page.$eval('[data-style-id="style-137"] h3', (node) => node.textContent)).toBe(
        "卡带未来主义",
      );
      await (await page.$$(".room-language-switch .ant-segmented-item"))[0].click();
      await page.waitForFunction(() => document.documentElement.lang === "en");
      expect(await page.$eval('[data-style-id="style-137"] h3', (node) => node.textContent)).toBe(
        "Cassette Futurism",
      );
      await (await page.$$(".room-language-switch .ant-segmented-item"))[1].click();
      await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
      // Exercise the real explorer and every expanded motion, not just resource availability.
      await page.goto(`${server.resolvedUrls!.local[0]}motion-language-test`);
      await page.waitForSelector('[data-style-id="motion-003"]');
      await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
      await page
        .locator("button")
        .filter((button) => button.textContent === "暂停所有预览")
        .click();
      await page.setViewport({ width: 1440, height: 1000 });
      const { motions } = await loadCatalog();
      const language = new UiLanguageService();
      await language.change("zh-CN");
      for (const motion of motions) {
        await page.click(`[data-style-id="${motion.id}"]`);
        await page.waitForSelector(".studio-modal .style-detail");
        await page
          .locator(".studio-modal .ant-collapse-header")
          .filter((node) => node.textContent === "推荐技术组合")
          .click();
        const visible = await page.$eval(
          ".studio-modal .style-detail",
          (node) => (node as HTMLElement).innerText,
        );
        for (const text of [
          motion.description,
          ...motion.motion_sequence,
          ...motion.compatibility.good_fit,
          ...motion.compatibility.adapt_or_omit_when,
          motion.video_adaptation,
        ])
          expect(visible, `${motion.id}: visible detail`).toContain(language.translate(text));
        // Technical guidance is force-rendered in accordions; exclude original source blocks.
        const detail = await page.$$eval(
          ".studio-modal .ant-modal-title, .studio-modal .style-detail p, .studio-modal .style-detail li",
          (nodes) => nodes.map((node) => node.textContent).join("\n"),
        );
        const fields = [
          motion.name,
          motion.description,
          ...motion.motion_sequence,
          ...motion.compatibility.good_fit,
          ...motion.compatibility.adapt_or_omit_when,
          motion.video_adaptation,
          motion.tech.implementation,
          motion.tech.library_selection,
        ];
        for (const text of fields.filter((value): value is string => typeof value === "string")) {
          expect(detail, `${motion.id}: ${text}`).toContain(language.translate(text));
          if (language.translate(text) !== text)
            expect(detail, `${motion.id}: untranslated ${text}`).not.toContain(text);
        }
        for (const text of new CatalogDisplayText().motion(motion).texts()) {
          if (text.length > 90 && /\b(the|with|and|from|only|when|before)\b/i.test(text))
            expect(detail, `${motion.id}: untranslated detail`).not.toContain(text);
        }
        await page.click(".studio-modal .ant-modal-close");
        await page.waitForSelector(".studio-modal", { hidden: true });
      }
      await page.goto(`${server.resolvedUrls!.local[0]}language-test`);
      await page.waitForSelector(".technology-pool-table");
      await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
      const renderedTools = await page.$$eval(
        "#technology-card-translations [data-technology-key]",
        (nodes) =>
          Object.fromEntries(
            nodes.map((node) => [
              node.getAttribute("data-technology-key"),
              (node as HTMLElement).innerText,
            ]),
          ),
      );
      expect(Object.keys(renderedTools)).toHaveLength(technologyEntries.length);
      for (const entry of technologyEntries) {
        const detail = renderedTools[entry.key];
        for (const field of [
          entry.definition.purpose,
          entry.definition.runtime,
          entry.definition.integration_guidance,
        ]) {
          if (!field) continue;
          expect(detail, `${entry.key}: translated guidance`).toContain(language.translate(field));
          if (language.translate(field) !== field)
            expect(detail, `${entry.key}: untranslated guidance`).not.toContain(field);
        }
        for (const api of entry.definition.suggested_apis ?? [])
          expect(detail, entry.key).toContain(api);
      }
      // Table expansion is a second entry point and must update while already open.
      await page.locator('[aria-label="搜索技术"]').fill("photoswipe");
      await page.click('.ant-table-row[data-row-key="photoswipe"] .ant-table-row-expand-icon');
      const expandedPhotoSwipe = ".ant-table-expanded-row .technology-pool-detail .stack-entry";
      await page.waitForSelector(expandedPhotoSwipe);
      const photoSwipeGuidance = technologyEntries.find((entry) => entry.key === "photoswipe")!
        .definition.integration_guidance!;
      expect(
        await page.$eval(expandedPhotoSwipe, (node) => (node as HTMLElement).innerText),
      ).toContain(language.translate(photoSwipeGuidance));
      await (await page.$$(".room-language-switch .ant-segmented-item"))[0].click();
      await page.waitForFunction(() => document.documentElement.lang === "en");
      expect(
        await page.$eval(expandedPhotoSwipe, (node) => (node as HTMLElement).innerText),
      ).toContain(photoSwipeGuidance);
      await (await page.$$(".room-language-switch .ant-segmented-item"))[1].click();
      await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
      expect(
        await page.$eval(expandedPhotoSwipe, (node) => (node as HTMLElement).innerText),
      ).toContain(language.translate(photoSwipeGuidance));
      expect(mutations).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  120000,
);
