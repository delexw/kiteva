import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

// Generic local fixture: one direction with a finished v1 and a building v2, plus a second
// direction. The card renderer records which job each action was rendered for.
const fixture = `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';
import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RevisionStack,useRevisionSelection}from'/src/client/components/revision-stack.tsx';
import{fullRevisionGroups}from'/src/client/lib/revision-stack.ts';
const h=React.createElement;
const base={runId:'project',kind:'full',workspace:'/unused',model:'example',duration:20};
const initial=[
  {...base,id:'a1',candidateId:'alpha',phase:'ready',video:'film.mp4',finishedAt:'2026-01-01T00:10:00Z'},
  {...base,id:'b1',candidateId:'beta',phase:'ready',video:'film.mp4',finishedAt:'2026-01-01T00:11:00Z'},
  {...base,id:'a2',candidateId:'alpha',phase:'rendering'},
];
const events=[{id:1,runId:'project',jobId:'a2',type:'render_progress',message:'Rendering',time:'2026-01-01T00:12:00Z',data:{renderer:'remotion',completed:2,total:5}}];
function Card(job,slots,record){
  return h('article',{className:'candidate studio-result-card','data-card':job.id},
    h('div',{className:'candidate-media',style:{aspectRatio:'16 / 9',background:'#222'}}),
    slots.strip,
    h('div',{className:'candidate-body'},
      h('div',{className:'candidate-heading'},
        h('div',{className:'candidate-heading-label'},h('h3',null,'Same look'),h('span',{className:'candidate-generated-at'},'Generated Jan 1, 2026, 12:00 PM')),
        h('div',{className:'delivery-links'},
          h('button',{className:'delivery-icon-button'},'ZIP'),
          h('button',{className:'download delivery-icon-button',onClick:()=>record('download:'+job.id)},'MP4'),
          h('button',{className:'storyboard delivery-icon-button',onClick:()=>record('storyboard:'+job.id)},'Story'))),slots.switcher));
}
function App(){
  const[jobs,setJobs]=useState(initial);const[calls,setCalls]=useState([]);
  const[selection,select]=useRevisionSelection();
  const record=(call)=>setCalls(p=>[...p,call]);
  return h(React.Fragment,null,h('main',{className:'room-preview-grid',style:{padding:12}},
    fullRevisionGroups(jobs).map(group=>h('section',{key:group.key},
      h(RevisionStack,{group,title:'Same look',selectedJobId:selection[group.key],onSelect:id=>select(group.key,id),events,
        onCancel:id=>record('cancel:'+id),onRetry:id=>record('retry:'+id)},(job,slots)=>Card(job,slots,record))))),
    h('button',{id:'finish',onClick:()=>setJobs(p=>p.map(j=>j.id==='a2'?{...j,phase:'ready',video:'film.mp4'}:j))},'Finish v2'),
    h('button',{id:'single',onClick:()=>setJobs(p=>p.filter(j=>j.candidateId==='alpha'))},'Only one direction'),
    h('button',{id:'more',onClick:()=>setJobs(p=>[...p,...['ready','failed','queued'].map((phase,index)=>({...base,id:'a'+(index+3),candidateId:'alpha',phase,video:phase==='ready'?'film.mp4':undefined}))])},'More revisions'),
    h('output',{id:'calls',hidden:true},JSON.stringify(calls)));
}
createRoot(document.getElementById('root')).render(h(App));</script>`;

it.skipIf(!browserExecutablePath())(
  "keeps the playable revision selected, switches revisions and targets actions by job",
  async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "revision-stack-"));
    const server = await createServer({
      configFile: false,
      root: appRoot,
      cacheDir,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.data/**"] } },
      plugins: [
        react(),
        {
          name: "revision-stack-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/revision-stack-test") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(await server.transformIndexHtml(req.url, fixture));
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
      await page.setViewport({ width: 900, height: 900 });
      await page.goto(`${server.resolvedUrls!.local[0]}revision-stack-test`);
      await page.waitForSelector('[data-revision-stack="alpha"] [data-card]');
      const alpha = '[data-revision-stack="alpha"]';
      const cardIds = () =>
        page.$$eval("[data-card]", (nodes) => nodes.map((node) => node.getAttribute("data-card")));
      const calls = async () =>
        JSON.parse((await page.$eval("#calls", (node) => node.textContent)) || "[]");

      // One card per direction; v1 stays selected while v2 builds inside the same card.
      expect(await cardIds()).toEqual(["a1", "b1"]);
      expect(await page.$eval(`${alpha} .revision-strip`, (node) => node.textContent)).toContain(
        "v2 · Building",
      );
      expect(await page.$(`[data-revision-stack="beta"] .revision-switcher`)).toBeNull();

      // Strip stop targets v2; footer actions target the selected v1.
      expect(
        await page.$eval(`${alpha} button[aria-label="Stop version 2"]`, (button) => {
          const styles = getComputedStyle(button),
            icon = button.querySelector("svg")!;
          return {
            border: styles.borderTopWidth,
            background: styles.backgroundColor,
            fill: icon.getAttribute("fill"),
            strokeWidth: icon.getAttribute("stroke-width"),
          };
        }),
      ).toEqual({
        border: "0px",
        background: "rgba(0, 0, 0, 0)",
        fill: "currentColor",
        strokeWidth: "0",
      });
      await page.click(`${alpha} button[aria-label="Stop version 2"]`);
      await page.click(`${alpha} .download`);
      expect(await calls()).toEqual(["cancel:a2", "download:a1"]);

      // A finished v2 never takes over the shown film; the strip offers it instead.
      await page.click("#finish");
      await page.waitForFunction(
        (selector) => document.querySelector(selector)?.textContent?.includes("v2 · Ready"),
        {},
        `${alpha} .revision-strip`,
      );
      expect(await cardIds()).toEqual(["a1", "b1"]);

      // Explicit switch: the card, its actions and the strip follow the chosen job.
      const tabs = await page.$$(`${alpha} .revision-switcher-tabs .ant-radio-button-wrapper`);
      expect(tabs).toHaveLength(2);
      await tabs[1].click();
      await page.waitForSelector(`${alpha} [data-card="a2"]`);
      await page.click(`${alpha} .storyboard`);
      expect((await calls()).at(-1)).toBe("storyboard:a2");
      expect(await page.$(`${alpha} .revision-strip`)).toBeNull();

      // Keyboard: arrow keys on the radio group move between revisions.
      await page.focus(`${alpha} .revision-switcher-tabs input:checked`);
      await page.keyboard.press("ArrowLeft");
      await page.waitForSelector(`${alpha} [data-card="a1"]`);
      expect(
        await page.$eval(`${alpha} .revision-switcher-tabs`, (node) =>
          node.getAttribute("aria-label"),
        ),
      ).toBe("Versions of Same look");

      const firstCell = await page.$eval(alpha, (node) => {
        const { width, x, y } = node.getBoundingClientRect();
        return { width, x, y };
      });
      await page.click("#single");
      await page.waitForFunction(() => document.querySelectorAll("[data-card]").length === 1);
      expect(
        await page.$eval(alpha, (node) => {
          const { width, x, y } = node.getBoundingClientRect();
          return { width, x, y };
        }),
      ).toEqual(firstCell);
      expect(firstCell.width).toBeLessThan(450);

      // Two version buttons still fit a normal mobile card.
      await page.setViewport({ width: 390, height: 844 });
      expect(
        await page.$eval(`${alpha} .candidate-heading`, (heading) => {
          const title = heading.querySelector("h3")!.getBoundingClientRect();
          const actions = Array.from(heading.querySelectorAll(".delivery-icon-button")).map(
            (button) => button.getBoundingClientRect(),
          );
          return (
            actions.length === 3 &&
            actions.every((box) => box.top < title.bottom && box.bottom > title.top)
          );
        }),
      ).toBe(true);
      expect(
        await page.$eval(
          `${alpha} .revision-switcher-tabs`,
          (node) => getComputedStyle(node).display,
        ),
      ).not.toBe("none");

      // Every version remains a button; narrow cards wrap instead of using a dropdown.
      await page.click("#more");
      await page.waitForFunction(
        (selector) => document.querySelectorAll(`${selector} .revision-tab`).length === 5,
        {},
        alpha,
      );
      expect(await page.$(`${alpha} [role="combobox"]`)).toBeNull();
      expect(
        await page.$$eval(`${alpha} input[type="radio"]`, (nodes) =>
          nodes.map((node) => node.getAttribute("aria-label")),
        ),
      ).toEqual([
        "Version 1 · Ready",
        "Version 2 · Ready",
        "Version 3 · Ready",
        "Version 4 · Failed",
        "Version 5 · Queued",
      ]);
      // Force a narrow switcher while preserving the surrounding card layout.
      await page.$eval(`${alpha} .revision-switcher`, (node) =>
        node.setAttribute("style", "max-width:160px"),
      );
      const rows = await page.$$eval(`${alpha} .revision-tab`, (nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
      );
      expect(new Set(rows).size).toBeGreaterThan(1);
      expect(
        await page.$$eval(`${alpha} .revision-tab`, (nodes) =>
          nodes.every((node) => {
            const box = node.getBoundingClientRect(),
              parent = node.closest(".revision-switcher")!.getBoundingClientRect();
            return box.left >= parent.left - 1 && box.right <= parent.right + 1 && box.height > 0;
          }),
        ),
      ).toBe(true);
      await page.click(`${alpha} .revision-tab:has(input[value="a4"])`);
      await page.waitForSelector(`${alpha} [data-card="a4"]`);
      await page.click(`${alpha} .download`);
      expect((await calls()).at(-1)).toBe("download:a4");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const media = await page.$eval(`${alpha} .candidate-media`, (node) => {
        const box = node.getBoundingClientRect();
        return box.width / box.height;
      });
      expect(media).toBeCloseTo(16 / 9, 1);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60000,
);
