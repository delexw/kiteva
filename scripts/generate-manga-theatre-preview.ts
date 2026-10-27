import {
  storyboardCrewPlan,
  storyboardCrewState,
  type CrewRole,
} from "../src/client/storyboard-crew-plan";
import { storyboardMovieCues } from "../src/client/storyboard-movie";
import { storyboardPageSchema } from "../src/client/storyboard-model";
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

export function mangaTheatrePreviewSvg() {
  const actor = (x: number, y: number, prop: string, scale = 1) =>
    `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-10 4 C-64-18-70-81-35-109 C0-139 48-115 55-77 C63-43 48-17 24 1 L49-3 30 22 31 89 8 62-11 63-34 92-31 23-57 15Z" fill="#FFFFFF" stroke="#151515" stroke-width="7" stroke-linejoin="round"/>${prop}</g>`;
  const clapper =
    '<g transform="translate(28 33) rotate(-8)"><path d="M0 0H54V39H0Z" fill="#FFFFFF" stroke="#151515" stroke-width="4"/><path d="M0 0L49-20 54-8 5 12Z" fill="#151515"/><path d="M15-6l8 9m8-16 8 9" stroke="#FFFFFF" stroke-width="4"/></g>';
  const box =
    '<path d="M28 35H83V79H28Z M28 35L83 79" fill="#FFFFFF" stroke="#151515" stroke-width="4"/>';
  const camera =
    '<g transform="translate(-76 24)"><rect width="48" height="32" fill="#FFFFFF" stroke="#151515" stroke-width="4"/><circle cx="10" cy="-7" r="11" fill="#FFFFFF" stroke="#151515" stroke-width="4"/><circle cx="35" cy="-7" r="11" fill="#FFFFFF" stroke="#151515" stroke-width="4"/><path d="M0 8L-18 0V32L0 24 M24 32L3 95M24 32L49 95" fill="#FFFFFF" stroke="#151515" stroke-width="4"/></g>';
  const light =
    '<path d="M58-20V90M40 90H78" stroke="#151515" stroke-width="5"/><rect x="35" y="-45" width="45" height="30" rx="5" fill="#FFFFFF" stroke="#151515" stroke-width="5"/>';
  const pencil =
    '<path d="M35 70L65 5 78 11 48 76 32 88Z" fill="#FFFFFF" stroke="#151515" stroke-width="5"/>';
  const sound =
    '<path d="M-48-48V-72C-48-131 48-131 48-72V-48" fill="none" stroke="#151515" stroke-width="7"/><rect x="25" y="35" width="55" height="35" fill="#FFFFFF" stroke="#151515" stroke-width="4"/><path d="M38 43V62M51 40V62M65 43V62" stroke="#151515" stroke-width="3"/>';
  const worker = (role: string, x: number, y: number, prop: string, label: string) =>
    `<g id="crew-${role}">${actor(x, y, prop, 0.55)}<g transform="translate(${x - 47} ${y + 55})"><rect width="104" height="19" rx="9" fill="#151515"/><circle id="active-${role}" cx="9" cy="9" r="3" fill="#F47B45" opacity="0"/><text x="55" y="13" text-anchor="middle" font-size="11" font-weight="700" fill="#FFFFFF">${label}</text><rect x="3" y="23" width="98" height="19" rx="9" fill="#FFFFFF" stroke="#151515"/><text id="status-${role}" x="52" y="36" text-anchor="middle" font-size="11" font-weight="700">Ready</text></g></g>`;
  const board = (x: number, label: string, action: string) =>
    `<g transform="translate(${x} 90)"><rect x="7" y="7" width="660" height="345" fill="#151515"/><rect width="660" height="345" fill="#FFFFFF" stroke="#151515" stroke-width="5"/><text x="26" y="45" font-size="22" font-weight="700">${label}</text><rect x="28" y="67" width="604" height="178" fill="url(#tone)"/><path d="M170 185L285 115 405 180 505 100" fill="none" stroke="#151515" stroke-width="7"/><circle cx="285" cy="115" r="17" fill="#FFFFFF" stroke="#151515" stroke-width="5"/><text x="28" y="298" font-size="20" font-weight="600">${action}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><pattern id="tone" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#151515"/></pattern></defs><rect width="1280" height="720" fill="#FFFFFF"/><g data-layout-allow-overflow="true" font-family="sans-serif" fill="#151515"><g id="scenery" data-layout-allow-overflow="true"><rect y="470" width="2560" height="250" fill="url(#tone)"/><path d="M0 485H2560M20 25L1200 465M470 0L1200 465M1360 25L2480 465M1750 0L2480 465" stroke="#151515" stroke-width="2" opacity=".2"/>${board(490, "01 / SET THE SCENE", "An idea takes shape.")}${board(1770, "02 / BUILD THE STORY", "Connect the next idea.")}</g><g id="dialogue"><ellipse cx="195" cy="327" rx="161" ry="110" fill="url(#tone)"/><path d="M39 295C19 155 345 147 351 285C356 357 249 391 124 366L102 402 87 355C60 344 44 326 39 295Z" fill="#FFFFFF" stroke="#151515" stroke-width="4"/><text x="195" y="265" text-anchor="middle" font-size="16" font-weight="700">DIRECTOR</text><text x="195" y="310" text-anchor="middle" font-size="25">Let’s bring it to life.</text></g><g id="director">${actor(160, 558, clapper)}</g><g id="reaction" stroke="#F47B45" stroke-width="8" stroke-linecap="round"><path d="M200 410V390 M220 422L233 405 M229 442H251"/></g>${worker("stage", 455, 590, box, "STAGE CREW")}${worker("art", 650, 610, pencil, "ART DEPT")}${worker("lighting", 800, 540, light, "LIGHTING")}${worker("sound", 975, 560, sound, "SOUND")}${worker("camera", 1160, 590, camera, "CAMERA")}<rect x="95" y="672" width="132" height="24" rx="12" fill="#151515"/><text x="161" y="689" text-anchor="middle" font-size="14" font-weight="700" fill="#FFFFFF">DIRECTOR</text></g></svg>`;
}

export function mangaTheatrePreviewFrames() {
  const storyboard = storyboardPageSchema.parse({
    durationSeconds: 3,
    scenes: [
      {
        title: "An idea takes shape",
        startSeconds: 0,
        endSeconds: 3,
        beats: [
          {
            startSeconds: 0,
            endSeconds: 3,
            development: "The camera pans past a prop card as the spotlight lights the title.",
            captions: ["An idea takes shape."],
            audio: { effects: ["Soft impact"], music: [], subtitles: [] },
          },
        ],
      },
    ],
  });
  const plan = storyboardCrewPlan(storyboardMovieCues(storyboard));
  return Array.from({ length: 91 }, (_, frame) => ({
    time: frame / 30,
    crew: (["stage", "art", "lighting", "sound", "camera"] as CrewRole[]).map((role) => ({
      role,
      ...storyboardCrewState(plan, role, frame / 30),
      home: storyboardCrewState(plan, role, -1).x,
    })),
  }));
}

export async function prepareMangaTheatrePreview() {
  const catalog = await loadCatalog();
  const style = catalog.styles.find((entry) => entry.id === "style-136");
  if (!style) throw Error("Manga Production Theatre must be in the catalog first");
  const svg = mangaTheatrePreviewSvg();
  const record = await publishExample(
    {
      styleId: style.id,
      svg,
      designNotes:
        "Application-authored backstage manga: timed specialist crew tasks, compact badges and readable statuses, a shadowed board, oval dialogue, sparse orange activity dots and continuous right-to-left scenery. Opening title omitted by choice.",
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
  const records = await readExampleRecords();
  await writeExampleRecords([...records.filter((entry) => entry.styleId !== style.id), record]);
  const workspace = path.join(examplesFolder, "video-projects", style.id);
  await mkdir(workspace, { recursive: true });
  await copyFile(
    path.resolve("node_modules/gsap/dist/gsap.min.js"),
    path.join(workspace, "gsap.min.js"),
  );
  await writeFile(
    path.join(workspace, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:white}svg{display:block;width:1280px;height:720px}</style></head><body><div data-composition-id="manga-theatre" data-width="1280" data-height="720" data-duration="3" data-fps="30">${svg}</div><script src="gsap.min.js"></script><script>const tl=gsap.timeline({paused:true});tl.to('#scenery',{x:-1280,duration:1.1,ease:'power2.inOut'},1.6);tl.fromTo('#director',{rotation:-2},{rotation:2,duration:.2,yoyo:true,repeat:3,transformOrigin:'50% 90%'},0);tl.fromTo('#reaction',{opacity:1},{opacity:0,duration:.15},.65);const frames=${JSON.stringify(mangaTheatrePreviewFrames())};for(const frame of frames){for(const state of frame.crew){tl.set('#crew-'+state.role,{x:(state.x-state.home)*4,y:state.bounce,rotation:state.tilt,transformOrigin:'50% 90%'},frame.time);tl.set('#active-'+state.role,{opacity:state.working?1:0},frame.time);tl.set('#status-'+state.role,{textContent:state.action},frame.time);}}tl.to({}, {duration:3},0);window.__timelines={'manga-theatre':tl};</script></body></html>`,
  );
  await writeFile(path.join(workspace, "STYLE.json"), JSON.stringify(style, null, 2));
  return workspace;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(await prepareMangaTheatrePreview());
