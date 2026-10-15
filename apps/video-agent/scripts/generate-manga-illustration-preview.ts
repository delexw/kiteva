import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/server/catalog/catalog";
import {
  examplesFolder,
  publishExample,
  readExampleRecords,
  writeExampleRecords,
} from "../src/server/catalog/style-examples";

// Cubic curves keep organic contours smooth; closed silhouettes provide tapered ink accents.
export function mangaEyeSvg() {
  return `<g data-illustration="eye"><path d="M-70 4C-50-18-22-37 8-31C30-28 48-17 62-3C27 20-13 34-49 20" fill="#FFFFFF" stroke="#171717" stroke-width="1.1"/><path d="M-76 9C-54-18-23-42 8-35C34-30 52-17 66-2L54 2C29-16 10-26-11-25C-36-25-55-8-76 9Z" fill="#171717"/><path d="M-66-3C-73-10-79-18-80-24C-70-15-64-12-58-10M-50-16C-57-26-61-31-61-37C-52-28-46-25-41-22M-29-28C-34-35-37-42-36-47C-29-38-25-34-20-31" fill="#171717"/><path d="M-23-25C-34-4-28 15-13 23C8 31 27 12 23-20" fill="url(#tone)" stroke="#171717" stroke-width="1.2"/><path d="M-12-21C-20-8-18 14-6 21C6 18 11-2 8-19Z" fill="#171717"/><path d="M-18-19C-24-12-24-5-18-3C-10-1-4-11-6-18Z" fill="#FFFFFF"/><ellipse cx="12" cy="12" rx="4.5" ry="3" fill="#FFFFFF"/><path d="M-22 2L-27 6M-16 14L-20 18M4 20L8 24M19 2L24 4M-61 19C-38 31-13 36 10 29M27 24C39 21 48 16 55 12M-71-31C-40-51-8-59 31-43" fill="none" stroke="#171717" stroke-width=".75"/></g>`;
}

export function mangaCharacterSvg() {
  return `<g data-illustration="character" stroke="#171717" stroke-linecap="round" stroke-linejoin="round"><g data-part="head" transform="rotate(-5 0 -45)"><g data-part="back-hair"><path d="M-111-31C-125-109-85-173-15-181C65-193 115-140 116-73C118-9 137 36 129 86C124 116 107 133 88 146C103 120 96 111 91 97C86 130 65 145 42 151L-60 147C-104 147-133 117-137 84C-144 43-119 15-111-31Z" fill="#171717" stroke-width="2.7"/><path d="M-92-64C-119 2-94 33-112 83C-116 101-115 116-102 130C-125 109-128 90-120 65C-105 19-120-11-104-63ZM78-87C95-48 94-4 112 35C126 66 113 105 99 121C108 91 104 69 98 52C81 5 87-29 78-87Z" fill="#FFFFFF" stroke="none"/></g><path data-part="loose-strands" d="M-104-105C-127-84-137-49-131-25M-121-20C-137 17-142 49-129 68M83-142C110-125 124-98 122-78M118-14C137 18 145 45 136 69" fill="none" stroke-width=".65"/><path d="M-73-85C-83-30-62 22-27 48C-6 65 15 73 32 58C49 43 59 24 65 9L79-4 74-18 84-92C39-129-31-142-73-85Z" fill="#FFFFFF" stroke-width="1.8"/><path data-part="jaw-shadow" d="M76-6C67 26 46 47 25 60C9 70-8 67-24 58C-3 73 12 77 29 66C54 51 72 27 78 4Z" fill="#171717" stroke="none"/><path d="M-78-18C-103-32-107-5-89 12L-72 18M-91-11C-83-16-80-9-81-3" fill="#FFFFFF" stroke-width="1.2"/><path d="M-26 60C-25 77-28 90-34 99L8 126 46 98C34 89 34 74 38 54" fill="#FFFFFF" stroke-width="1.5"/><path d="M-24 75C-4 88 17 86 34 68C25 89 10 98-4 99L-29 87Z" fill="url(#hatch)" stroke="none"/><g transform="translate(-29 -13) scale(.43)">${mangaEyeSvg()}</g><g data-part="far-eye"><path d="M34-16C42-26 54-27 65-19C59-8 48-5 38-10" fill="#FFFFFF" stroke-width=".8"/><path d="M32-14C42-29 55-30 68-18L62-17C52-24 43-23 32-14Z" fill="#171717" stroke="none"/><path d="M46-23C42-17 43-10 49-8C56-9 59-17 55-23Z" fill="url(#tone)" stroke-width=".6"/><path d="M48-22C45-17 46-11 50-10C53-13 54-18 52-22Z" fill="#171717" stroke="none"/><ellipse cx="48" cy="-20" rx="2" ry="2.5" fill="#FFFFFF" stroke="none"/><path d="M35-37C44-42 56-42 65-36M40-8C48-4 56-6 60-9" fill="none" stroke-width=".65"/></g><path data-part="temple-tone" d="M73-22C67 1 61 17 49 28C61 23 70 13 77-4Z" fill="url(#tone)" stroke="none"/><path d="M23-17C24-4 31 5 34 10C33 14 27 16 23 14M14 34C23 30 32 30 39 32M23 39C28 40 33 39 36 37M-52 22L-57 29M-43 26L-47 34M-34 29L-38 36M49 24L46 31M57 20L54 28" fill="none" stroke-width=".7"/><g data-part="fringe"><path d="M-115-56C-116-127-69-181-3-178C63-180 114-137 116-77C103-95 93-104 83-109C89-85 89-66 84-47C68-61 53-78 43-98C49-76 51-57 48-42C27-53 12-72 0-94C3-71 5-55 1-44C-21-59-34-78-43-101C-50-68-65-48-83-36C-77-58-75-80-76-99C-93-72-97-42-94-12C-94 5-103 21-113 29C-105 7-109-29-115-56Z" fill="#171717" stroke-width="2.1"/><g data-part="hair-light" fill="#FFFFFF" stroke="none"><path d="M-102-82C-93-117-70-142-44-154C-64-137-76-120-82-102C-86-88-89-75-88-64C-94-70-99-76-102-82Z"/><path d="M-60-150C-56-125-49-108-39-94C-45-113-47-135-46-156C-51-154-56-152-60-150Z"/><path d="M-23-165C-18-139-13-125-5-112C-10-137-9-153-8-167Z"/><path d="M8-165C15-141 24-124 35-112C28-132 24-149 22-164Z"/><path d="M42-157C49-142 57-130 68-122C61-135 57-145 54-153Z"/><path d="M73-140C82-131 89-121 95-110C92-125 85-137 78-144Z"/></g><path d="M-95-121C-77-149-56-162-33-166M-66-121C-63-104-59-89-53-76M-30-154C-25-130-19-113-11-98M12-153C21-134 31-118 43-104M57-145C73-133 85-117 92-106" fill="none" stroke="#FFFFFF" stroke-width=".6"/></g></g><path d="M-35 96C-69 99-110 118-126 145C-142 171-149 204-153 234H143C139 192 134 158 116 137C100 118 74 105 46 96L10 122Z" fill="#FFFFFF" stroke-width="2.3"/><path d="M-35 96C-41 106-47 118-48 126L-8 155 10 122 36 150C44 140 54 127 60 115L46 96M10 122C17 152 16 184 20 228M-113 141C-91 149-75 169-72 188M-125 160C-105 168-88 180-81 198M99 141C81 157 75 178 79 197M109 157C97 172 93 186 95 203M-80 113C-76 126-69 137-58 145M61 115C66 128 73 136 82 140" fill="none" stroke-width=".85"/><path d="M-135 185C-119 184-104 193-99 211L-123 227-148 230ZM113 184C122 193 130 210 135 229L112 225 99 205Z" fill="url(#hatch)" stroke="none"/><path d="M-141 225C-111 204-88 201-64 209C-40 217-22 223-1 224C20 223 44 211 62 218C70 223 72 229 65 235C49 244 20 248-1 244L-69 236C-93 238-116 237-141 234Z" fill="#FFFFFF" stroke-width="1.6"/><path d="M-79 209C-73 215-70 222-67 228M-64 212C-58 216-55 222-53 228M27 225C40 220 51 218 59 221M33 231C45 227 58 226 65 228" fill="none" stroke-width=".65"/></g>`;
}

export function mangaDrawingHandSvg() {
  return `<g data-illustration="drawing-hand" stroke="#171717" stroke-linecap="round" stroke-linejoin="round"><path d="M14 109L450 66 549 230H0Z" fill="#FFFFFF" stroke-width="2"/><path d="M78 119L280 97 369 201 134 227Z" fill="url(#tone)" stroke-width="1"/><path d="M89 120L278 103 352 193 138 216Z" fill="#FFFFFF" stroke-width=".8"/><path d="M130 159C153 133 181 128 202 145C215 156 223 171 222 187M145 196C162 182 182 184 200 194M149 158C160 150 175 151 184 159M158 164C165 166 174 166 180 163" fill="none" stroke-width=".8"/><g data-part="pen-grip" transform="translate(-30 38)"><path d="M547 24C512 31 484 43 463 56C448 66 437 72 420 76C398 75 383 74 369 81C355 88 346 99 340 110L326 131C322 137 325 143 331 143C337 143 342 137 346 130L359 113C364 110 369 109 374 110C369 116 363 123 361 131C359 138 364 143 370 140L390 123C400 119 412 120 425 115C441 110 451 101 466 95L547 87Z" fill="#FFFFFF" stroke-width="1.9"/><path d="M369 82C379 81 390 83 398 88C402 91 401 96 397 98L378 108C374 111 371 116 369 121M393 78C404 76 415 77 424 81M409 96C419 94 427 90 433 86M437 75C445 68 453 65 463 64M338 119C341 117 344 116 347 117M366 133C369 130 373 127 376 127" fill="none" stroke-width=".7"/><path d="M353 130L383 55C384 52 389 53 389 57L361 132 349 143Z" fill="#171717" stroke-width=".6"/><path d="M353 134L349 143 358 136Z" fill="#FFFFFF" stroke-width=".5"/><path d="M480 45C487 54 494 72 497 88L517 85C511 66 506 52 499 39Z" fill="url(#hatch)" stroke-width=".9"/></g><path data-part="contact-ink" d="M319 181C310 179 303 179 297 181C293 182 289 182 284 180" fill="none" stroke-width=".8"/><path d="M399 184L459 176 474 198 413 207Z" fill="url(#hatch)" stroke-width="1.4"/><path d="M410 182L455 181 465 194 418 200Z" fill="#FFFFFF" stroke-width=".8"/></g>`;
}

// Original editable SVG curves. No embedded images or generated raster artwork.
export function mangaIllustrationPreviewSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><pattern id="tone" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".65" fill="#171717"/></pattern><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="#171717" stroke-width=".7"/></pattern><clipPath id="portrait-mask"><rect x="48" y="48" width="634" height="570"/></clipPath><clipPath id="eye-mask"><rect x="710" y="48" width="522" height="230"/></clipPath><clipPath id="hand-mask"><rect x="710" y="306" width="522" height="312"/></clipPath></defs><rect width="1280" height="720" fill="#FFFFFF"/><g id="portrait-panel" clip-path="url(#portrait-mask)"><rect x="48" y="48" width="634" height="570" fill="url(#tone)"/><path d="M48 359L476 241 682 301M476 241V48M80 618L476 241 682 556M230 618L476 241 573 618" fill="none" stroke="#171717" stroke-width=".8"/><path d="M72 70H262V293H72Z" fill="#FFFFFF" stroke="#171717" stroke-width="1.6"/><path d="M82 80H252V283H82Z M165 80V283M82 178H252" fill="none" stroke="#171717" stroke-width="1"/><path d="M76 70L101 70Q92 177 103 296L70 301Z" fill="url(#hatch)" stroke="#171717" stroke-width=".9"/><g transform="translate(406 319) scale(1.17)">${mangaCharacterSvg()}</g><path d="M48 588L682 562V618H48Z" fill="#FFFFFF" stroke="#171717" stroke-width="2"/><path d="M72 607L652 585M91 615L659 594" stroke="#171717" stroke-width=".6"/></g><g id="eye-panel" clip-path="url(#eye-mask)"><rect x="710" y="48" width="522" height="230" fill="#FFFFFF"/><path d="M718 48Q803 102 781 278M761 48Q831 156 810 278M836 48Q867 119 843 181M1070 48Q1058 110 1086 194M1145 48Q1102 131 1138 278M1207 48Q1179 180 1229 278" fill="none" stroke="#171717" stroke-width="1.1"/><g transform="translate(980 161) scale(2.5)">${mangaEyeSvg()}</g><path d="M711 249L798 229M711 259L806 239M1155 258L1232 234M1166 268L1232 247" stroke="#171717" stroke-width=".65"/></g><g id="hand-panel" clip-path="url(#hand-mask)"><g transform="translate(710 336) scale(.95 1.2)">${mangaDrawingHandSvg()}</g></g><g fill="none" stroke="#171717" stroke-width="2"><rect x="48" y="48" width="634" height="570"/><rect x="710" y="48" width="522" height="230"/><rect x="710" y="306" width="522" height="312"/></g><text x="50" y="669" font-family="serif" font-size="22" letter-spacing="3" fill="#171717">A MOMENT BEFORE THE IDEA.</text><path d="M800 661H1232" stroke="#171717" stroke-width="1"/></svg>`;
}

export function mangaIllustrationPreviewHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:white}svg{display:block;width:1280px;height:720px}</style></head><body><div data-composition-id="manga-illustration" data-width="1280" data-height="720" data-duration="3" data-fps="30" style="width:100%;height:100%">${mangaIllustrationPreviewSvg()}</div><script src="gsap.min.js"></script><script>const tl=gsap.timeline({paused:true});tl.fromTo('#portrait-panel',{opacity:0},{opacity:1,duration:.45,ease:'none'},0);tl.fromTo('#eye-panel',{opacity:0},{opacity:1,duration:.3,ease:'none'},.7);tl.fromTo('#hand-panel',{opacity:0},{opacity:1,duration:.35,ease:'none'},1.4);tl.to({}, {duration:3},0);window.__timelines={'manga-illustration':tl};</script></body></html>`;
}

export async function prepareMangaIllustrationPreview() {
  const catalog = await loadCatalog();
  const style = catalog.styles.find((entry) => entry.id === "style-032");
  if (!style) throw Error("Manga style is unavailable");
  const record = await publishExample(
    {
      styleId: style.id,
      svg: mangaIllustrationPreviewSvg(),
      designNotes:
        "Code-drawn manga study: an asymmetric face contour, independently drawn perspective-narrowed far eye, tilted head gesture, overlapping hair clumps, light-side highlights, heavier jaw shadow and a pen grip with visible nib-to-paper contact. Editable SVG contours and deterministic panel reveals; no image assets.",
    },
    {
      styleId: style.id,
      catalogHash: catalog.hash,
      thumbnail: "",
      status: "ready",
      authorship: "application",
      model: "application-authored",
    },
  );
  await writeExampleRecords([
    ...(await readExampleRecords()).filter((entry) => entry.styleId !== style.id),
    record,
  ]);
  const workspace = path.join(examplesFolder, "video-projects", style.id);
  await mkdir(workspace, { recursive: true });
  await copyFile(
    path.resolve("node_modules/gsap/dist/gsap.min.js"),
    path.join(workspace, "gsap.min.js"),
  );
  await writeFile(path.join(workspace, "index.html"), mangaIllustrationPreviewHtml());
  await writeFile(path.join(workspace, "STYLE.json"), JSON.stringify(style, null, 2));
  return workspace;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(await prepareMangaIllustrationPreview());
