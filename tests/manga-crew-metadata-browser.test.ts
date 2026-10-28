import { expect, it } from "vitest";
import puppeteer from "puppeteer-core";
import { z } from "zod";
import { loadCatalog } from "../src/server/catalog/catalog";
import { browserExecutablePath } from "../src/server/runtime/browser";

it.skipIf(!browserExecutablePath())(
  "draws all crew roles using only embedded style metadata",
  async () => {
    const style = (await loadCatalog()).styles.find((entry) => entry.id === "style-136")!;
    const reference = z
      .object({ files: z.array(z.object({ name: z.string(), code: z.string() })) })
      .parse(style.tech.reference_implementation);
    const css = reference.files.find((file) => file.name === "crew.css")!.code;
    const html = reference.files.find((file) => file.name === "crew.html")!.code;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: browserExecutablePath()!,
    });
    try {
      const page = await browser.newPage();
      const requests: string[] = [];
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        requests.push(request.url());
        void request.abort();
      });
      await page.setViewport({ width: 1000, height: 260 });
      await page.setContent(
        `<style>body{margin:0;padding:24px;display:flex;gap:52px;background:#f5f3ef}.manga-crew{margin-top:24px}${css}</style>${html}`,
      );
      const roles = await page.$$eval(".manga-crew", (crew) =>
        crew.map((element) => {
          const head = element.querySelector<HTMLElement>(".manga-head")!;
          return {
            role: element.getAttribute("data-role"),
            width: head.getBoundingClientRect().width,
            height: head.getBoundingClientRect().height,
            border: getComputedStyle(head).borderTopWidth,
            reaction: getComputedStyle(element.querySelector(".manga-reaction")!).display,
          };
        }),
      );
      expect(roles.map((role) => role.role)).toEqual([
        "director",
        "stage",
        "lighting",
        "art",
        "sound",
        "camera",
      ]);
      expect(
        roles.every(
          (role) =>
            role.width === 58 &&
            role.height === 60 &&
            role.border === "5px" &&
            role.reaction === "none",
        ),
      ).toBe(true);
      for (const selector of [
        ".manga-clapper",
        ".manga-stage-box",
        ".manga-light-head",
        ".manga-pencil-prop",
        ".manga-headphones-prop",
        ".manga-camera-prop",
      ])
        expect(
          await page.$eval(selector, (element) => element.getBoundingClientRect().width),
        ).toBeGreaterThan(0);
      expect(requests).toEqual([]);
      await page.screenshot({ path: "/tmp/kiteva-manga-crew-metadata.png" });
    } finally {
      await browser.close();
    }
  },
  60000,
);
