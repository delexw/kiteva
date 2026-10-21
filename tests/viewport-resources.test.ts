import { browserDependencyScan } from "../vite.resolve";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";

it.skipIf(!browserExecutablePath())(
  "unloads offscreen media and window bodies, and lazily mounts collapsed guidance",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "viewport-vite-"));
    const server = await createServer({
      cacheDir,
      configFile: false,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: { "@": path.join(appRoot, "src/client") } },
      server: { host: "127.0.0.1", port: 0 },
      plugins: [
        react(),
        {
          name: "viewport-resources-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/viewport-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `
<style>
#gallery { height:210px;width:340px;overflow:auto; }
.example-media {width:320px;height:180px;position:relative}.example{width:100%;height:100%;object-fit:contain}
#desktop {position:relative;height:240px;width:700px;overflow:hidden}
.room-window {position:absolute;background:white}.room-window-content{height:160px;overflow:auto}
</style><div id="root"></div><script type="module">
import React,{useState,useRef} from 'react';import{createRoot}from'react-dom/client';
import{StyleExampleMedia}from'/src/client/style-card.tsx';
import{SuggestedCombinations}from'/src/client/style-combinations.tsx';
import{RoomWindow}from'/src/client/room/room-window.tsx';
const style={id:'example-a',name_en:'First style',category:'Drawing',visual_cues:'A drawn style',palette:{tokens:{foreground:'#18243B'},constraints:[]}};
const support={...style,id:'example-b',name_en:'Second style'};
style.suggested_combinations={selection_guidance:'Consider this combination',suggestions:[{supporting_styles:[{style_id:support.id,role:'Motion'}],rationale:'Useful motion',best_for:'Stories',video_application:'Animate it',html_application:'Interact',consistency_rules:['Unique hidden guidance'],avoid:['Clutter']}]};
function App(){const[enabled,setEnabled]=useState(true);const[shown,setShown]=useState(false);const[value,setValue]=useState('Saved draft');const desktop=useRef(null);
const state={id:'test',x:shown?0:2000,y:0,width:400,height:220,minimized:false,maximized:false};
return React.createElement(React.Fragment,null,
React.createElement('button',{id:'toggle',onClick:()=>setEnabled(v=>!v)},'Toggle demos'),
React.createElement('div',{id:'gallery'},React.createElement(StyleExampleMedia,{styleId:'first',video:'preview.webm',playbackEnabled:enabled}),React.createElement('div',{style:{height:700}}),React.createElement(StyleExampleMedia,{styleId:'last',video:'preview.webm',playbackEnabled:enabled})),
React.createElement('button',{id:'window-toggle',onClick:()=>setShown(v=>!v)},'Toggle window'),
React.createElement('div',{id:'desktop',ref:desktop},React.createElement(RoomWindow,{state,display:state,title:'Test window',desktop,area:{width:2500,height:240},onChange(){},onFocus(){},focused:true,layer:2},React.createElement('input',{'aria-label':'Saved window draft',value,onChange:e=>setValue(e.target.value)}),React.createElement('div',{style:{height:500}},'Window contents'))),
React.createElement(SuggestedCombinations,{style,styles:[style,support],examples:[],onSelect(){}}));}
createRoot(document.getElementById('root')).render(React.createElement(App));
</script>`,
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
      const clip = await readFile(path.join(appRoot, "assets/style-previews/style-001.webm"));
      await server.listen();
      const page = await browser.newPage();
      await page.setViewport({ width: 1100, height: 1000 });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (req.url().includes("/api/examples/") && req.url().includes("/video"))
          void req.respond({ status: 200, contentType: "video/webm", body: clip });
        else if (req.url().includes("/api/examples/"))
          void req.respond({
            status: 200,
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"/>',
          });
        else void req.continue();
      });
      await page.goto(`${server.resolvedUrls!.local[0]}viewport-test`);
      await page.waitForFunction(
        () =>
          document.querySelectorAll("video").length === 1 &&
          !document.querySelector("video")!.paused,
      );
      expect(await page.$eval("video", (video) => video.src)).toContain("/first/video");
      await page.$eval("#gallery", (gallery) => (gallery.scrollTop = gallery.scrollHeight));
      await page.waitForFunction(
        () =>
          document.querySelectorAll("video").length === 1 &&
          document.querySelector("video")!.src.includes("/last/video"),
      );
      await page.click("#toggle");
      await page.waitForFunction(() => !document.querySelector("video"));
      await page.click("#toggle");
      await page.waitForSelector("video");
      await page.$eval("#gallery", (gallery) => (gallery.scrollTop = 0));
      await page.waitForFunction(() =>
        document.querySelector("video")?.src.includes("/first/video"),
      );
      expect(await page.$('[aria-label="Saved window draft"]')).toBeNull();
      await page.click("#window-toggle");
      await page.waitForSelector('[aria-label="Saved window draft"]');
      await page.type('[aria-label="Saved window draft"]', " stays");
      await page.$eval(".room-window-content", (content) => {
        content.scrollTop = 130;
        content.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await page.click("#window-toggle");
      await page.waitForFunction(
        () => !document.querySelector('[aria-label="Saved window draft"]'),
      );
      await page.click("#window-toggle");
      await page.waitForSelector('[aria-label="Saved window draft"]');
      expect(
        await page.$eval(
          '[aria-label="Saved window draft"]',
          (el) => (el as HTMLInputElement).value,
        ),
      ).toBe("Saved draft stays");
      await page.waitForFunction(
        () => document.querySelector(".room-window-content")?.scrollTop === 130,
      );
      expect(await page.$(".combination-guidance")).toBeNull();
      await page.click(".combination-accordion .ant-collapse-header");
      await page.waitForSelector(".combination-guidance");
      expect(await page.$eval(".combination-guidance", (el) => el.textContent)).toContain(
        "Unique hidden guidance",
      );
      await page.click(".combination-accordion .ant-collapse-header");
      await page.waitForFunction(() => !document.querySelector(".combination-guidance"));
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.reload();
      await page.waitForSelector(".example");
      expect(await page.$("video")).toBeNull();
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
