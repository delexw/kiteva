import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { loadCatalog } from "../src/server/catalog/catalog.js";
import { styleArtworkFolder } from "../src/server/catalog/style-preview-assets";
import type { Style, StyleExample } from "../src/shared/contracts.js";
export function illustrativeSvg(s: Style, index: number) {
  const c = Object.values(s.palette.tokens);
  const bg = c[0] || "#eeeeee",
    ink = c[1] || "#222222",
    accent = c[2] || ink,
    second = c[3] || accent;
  const name = s.name_en.toLowerCase();
  const seed = index % 7;
  let art = "";
  if (/isometric|3d|clay|low.poly|voxel/.test(name)) {
    art = Array.from({ length: 5 }, (_, i) => {
      const x = 135 + i * 62,
        y = 180 + (i % 2) * 40,
        h = 45 + ((i + seed) % 4) * 18;
      return `<g transform='translate(${x},${y})'><path d='M0 0 40 -23 80 0 40 23Z' fill='${accent}'/><path d='M0 0 40 23 40 ${h + 23} 0 ${h}Z' fill='${ink}'/><path d='M40 23 80 0 80 ${h} 40 ${h + 23}Z' fill='${second}'/></g>`;
    }).join("");
  } else if (/pixel|8.bit/.test(name)) {
    art = Array.from({ length: 64 }, (_, i) => {
      const x = 140 + (i % 8) * 36,
        y = 45 + Math.floor(i / 8) * 30;
      return (i + seed) % 3
        ? `<rect x='${x}' y='${y}' width='32' height='26' fill='${(i + seed) % 2 ? accent : ink}'/>`
        : "";
    }).join("");
  } else if (/line|sketch|hand.drawn|engraving|hatching|chalk|pencil/.test(name)) {
    art = `<g fill='none' stroke='${ink}' stroke-width='3'><path d='M90 260 Q140 65 245 155 T490 100'/><path d='M92 262 Q144 63 243 156 T492 102' opacity='.35'/>${Array.from({ length: 14 }, (_, i) => `<path d='M${140 + i * 18} 250 l50 -${70 + (i % 4) * 15}' opacity='.55'/>`).join("")}<circle cx='430' cy='150' r='55'/></g>`;
  } else if (/collage|mixed|cut.out|paper|scrap/.test(name)) {
    art = `<rect x='100' y='65' width='175' height='205' fill='${ink}' transform='rotate(-9 180 160)'/><rect x='265' y='80' width='210' height='165' fill='${accent}' transform='rotate(8 360 160)'/><circle cx='345' cy='195' r='66' fill='${second}'/><path d='M95 255 L420 233 470 290 100 285Z' fill='${accent}'/>`;
  } else if (/glass|gradient|aurora|liquid|fluid|synthwave|psychedelic/.test(name)) {
    art = `<defs><radialGradient id='glow'><stop stop-color='${accent}'/><stop offset='1' stop-color='${bg}'/></radialGradient></defs><ellipse cx='300' cy='165' rx='200' ry='145' fill='url(#glow)'/><path d='M110 180 C150 15 235 60 315 160 S500 300 480 130 Q430 290 220 250Z' fill='${second}' opacity='.6'/><rect x='150' y='70' width='300' height='190' rx='26' fill='${bg}' fill-opacity='.32' stroke='${ink}' stroke-opacity='.4'/>`;
  } else if (/hud|cyber|network|data|technical/.test(name)) {
    art = `<g fill='none' stroke='${accent}' stroke-width='2'><circle cx='290' cy='170' r='105'/><circle cx='290' cy='170' r='72' stroke-dasharray='8 10'/><path d='M75 80 H200 M390 80 H510 M85 270 H210 M390 265 H525 M290 40 V300'/></g>${Array.from({ length: 6 }, (_, i) => `<rect x='${75 + i * 75}' y='${110 + (i % 3) * 50}' width='35' height='35' rx='5' fill='${second}'/>`).join("")}`;
  } else if (/typograph|swiss|editorial|kinetic/.test(name)) {
    art = `<text x='72' y='150' font-family='sans-serif' font-weight='800' font-size='90' fill='${ink}'>Aa</text><rect x='335' y='72' width='165' height='165' fill='${accent}'/><g stroke='${ink}' stroke-width='6'><path d='M75 220 H285 M75 250 H250 M75 280 H195'/></g>`;
  } else {
    art = `<circle cx='200' cy='170' r='88' fill='${accent}'/><rect x='300' y='80' width='150' height='180' rx='${seed * 6}' fill='${ink}'/><path d='M230 290 L345 140 440 285Z' fill='${second}'/><circle cx='200' cy='170' r='45' fill='${bg}'/>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='340' viewBox='0 0 600 340'><rect width='600' height='340' fill='${bg}'/>${art}</svg>`;
}
export async function bootstrap() {
  const catalog = await loadCatalog();
  const folder = styleArtworkFolder;
  await mkdir(folder, { recursive: true });
  const records: StyleExample[] = [];
  for (const [i, s] of catalog.styles.entries()) {
    try {
      await sharp(Buffer.from(illustrativeSvg(s, i)))
        .webp({ quality: 85 })
        .toFile(path.join(folder, `${s.id}.webp`));
      records.push({
        styleId: s.id,
        catalogHash: catalog.hash,
        thumbnail: `${s.id}.webp`,
        status: "ready",
      });
    } catch (error) {
      records.push({
        styleId: s.id,
        catalogHash: catalog.hash,
        thumbnail: "",
        status: "failed",
        error: String(error),
      });
    }
  }
  await writeFile(path.join(folder, "manifest.json"), JSON.stringify(records, null, 2));
  console.log(
    `Illustrative palette/composition sketches: ${records.filter((r) => r.status === "ready").length}/${records.length}`,
  );
}
if (process.argv[1]?.endsWith("bootstrap-examples.ts")) await bootstrap();
