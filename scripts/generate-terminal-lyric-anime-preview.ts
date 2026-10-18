import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/server/catalog/catalog";
import { seeded } from "../src/shared/seeded-random";
import {
  examplesFolder,
  publishExample,
  readExampleRecords,
  validateExamplePalette,
  writeExampleRecords,
} from "../src/server/catalog/style-examples";

/**
 * Terminal Lyric Duotone Anime (style-138) preview. An original, clearly illustrative
 * code-drawn bust in three inks inside a CRT terminal frame, with a decoding bilingual
 * caption, a section header, a HUD data build and a keyword title that settles from an
 * RGB offset into a thin ellipse ring. The static SVG and the HyperFrames composition
 * share one builder; every animated attribute comes from a pure per-frame time state.
 */
export const TERMINAL_STYLE_ID = "style-138";
export const TERMINAL_COMPOSITION_ID = "terminal-lyric-anime";
export const TERMINAL_DURATION = 3;
export const TERMINAL_FPS = 30;
export const TERMINAL_FRAMES = TERMINAL_DURATION * TERMINAL_FPS;
/** Scrambled glyphs, grain and the audio meter step at 12 changes per second to avoid boil. */
export const TERMINAL_GLYPH_RATE = 12;
export const TERMINAL_AUTHOR_MODEL = "claude-opus-5-5";

export const terminalColors = {
  background: "#06070B",
  near_black: "#0D0F16",
  ultramarine: "#2747C8",
  cream: "#F1E8D2",
  signal_blue: "#7A93FF",
  warning_red: "#F0473A",
} as const;
const C = terminalColors;

export const terminalCopy = {
  header: "§07 // SIGNAL_TRACE",
  english: {
    before: "> we tune in to the quiet ",
    keyword: "signal",
    after: "",
  },
  chinese: { before: "我们调到那段安静的", keyword: "信号", after: "" },
  title: "SIGNAL",
  warning: "! CARRIER WEAK",
  data: ["id    subj_01", "ink   3 + red", "state listening", "gain  -42 dB"],
} as const;
const englishText = terminalCopy.english.before + terminalCopy.english.keyword;
const chineseText = terminalCopy.chinese.before + terminalCopy.chinese.keyword;

export const terminalCues = {
  aperture: { start: 0.04, end: 0.36 },
  header: { start: 0.14, end: 0.56 },
  english: { start: 0.3, end: 1.2 },
  chinese: { start: 0.58, end: 1.32 },
  title: { start: 0.95, end: 1.4 },
  ring: { start: 1.42, end: 1.86 },
  detect: 1.1,
  scan: { start: 1.1, end: 2.0 },
  dataLines: [1.3, 1.45, 1.6, 1.75],
  warning: 2.25,
} as const;

// ---------------------------------------------------------------------------
// Time state (pure; no DOM, no clocks)
// ---------------------------------------------------------------------------

const hash = (a: number, b: number) => seeded(a * 7919 + b * 104729 + 17)();
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const progress = (time: number, start: number, end: number) =>
  clamp((time - start) / (end - start));
const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 3;
const fixed = (value: number) => String(Number(value.toFixed(2)));

export function terminalFrame(time: number) {
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(TERMINAL_FRAMES - 1, Math.floor(time * TERMINAL_FPS + 1e-4)));
}

const LATIN_SCRAMBLE = "#$%&*+<>?/|=_01ABCDEFXYZ";
const CJK_SCRAMBLE = "数据信号终端执行错误乱码缓存回声";
const SCRAMBLE_WIDTH = 3;
/**
 * Decode a line: characters before the reveal head are final, the next few show seeded
 * scrambled glyphs, later ones are blank padding so the monospace line never reflows.
 */
export function decodeLine(
  text: string,
  time: number,
  window: { start: number; end: number },
  glyphs: string,
  blank: string,
  salt: number,
) {
  const chars = [...text];
  const p = progress(time, window.start, window.end);
  const revealed = Math.floor(p * chars.length + 1e-6);
  const step = Math.floor(time * TERMINAL_GLYPH_RATE + 1e-6);
  const shown = chars.map((char, index) => {
    if (index < revealed || char === " ") return index < revealed + SCRAMBLE_WIDTH ? char : blank;
    if (index < revealed + SCRAMBLE_WIDTH && time >= window.start)
      return glyphs[Math.floor(hash(index + salt, step) * glyphs.length)];
    return blank;
  });
  return {
    text: shown.join(""),
    revealed,
    progress: p,
    complete: revealed >= chars.length,
  };
}

export function terminalLyricState(time: number) {
  const frame = terminalFrame(time);
  const t = frame / TERMINAL_FPS;
  const cue = terminalCues;
  const step = Math.floor(t * TERMINAL_GLYPH_RATE + 1e-6);
  const aperture = easeOut(progress(t, cue.aperture.start, cue.aperture.end));
  const header = decodeLine(terminalCopy.header, t, cue.header, LATIN_SCRAMBLE, " ", 400);
  const english = decodeLine(englishText, t, cue.english, LATIN_SCRAMBLE, " ", 100);
  const chinese = decodeLine(chineseText, t, cue.chinese, CJK_SCRAMBLE, "　", 200);
  const titleP = progress(t, cue.title.start, cue.title.end);
  const settle = easeOut(titleP);
  const titleVisible = t >= cue.title.start;
  // RGB offset decays to zero; seeded per glyph step so it never boils during the hold.
  const offset = titleVisible ? 18 * (1 - titleP) ** 1.5 : 0;
  const jitter = titleP < 1 ? (hash(step, 31) - 0.5) * 6 * (1 - settle) : 0;
  const scanP = progress(t, cue.scan.start, cue.scan.end);
  return {
    frame,
    time: t,
    aperture,
    powerLine: t < cue.aperture.end ? 1 - progress(t, 0.12, cue.aperture.end) : 0,
    header,
    english,
    chinese,
    underline: (english.progress + chinese.progress) / 2,
    title: {
      visible: titleVisible,
      opacity: clamp(titleP * 3),
      scale: titleP >= 1 ? 1 : 1.16 - 0.16 * settle,
      offset,
      jitter,
      settled: titleP >= 1,
    },
    ring: easeOut(progress(t, cue.ring.start, cue.ring.end)),
    detect: t >= cue.detect,
    scan: Math.round(100 * easeOut(scanP)),
    dataLines: cue.dataLines.filter((at) => t >= at).length,
    warning: t >= cue.warning,
    push: 1 + 0.03 * (t / TERMINAL_DURATION),
    meter: Array.from({ length: 12 }, (_, i) =>
      Math.round(4 + 30 * hash(i + 3, step) * (0.45 + 0.55 * Math.sin((i / 11) * Math.PI))),
    ),
    grain: {
      x: Math.round((hash(step, 11) - 0.5) * 40),
      y: Math.round((hash(step, 13) - 0.5) * 24),
    },
  };
}
export type TerminalState = ReturnType<typeof terminalLyricState>;

// ---------------------------------------------------------------------------
// Attribute patches: the single bridge between state and drawing
// ---------------------------------------------------------------------------

type Patch = Record<string, Record<string, string>>;
const W = 1280;
const H = 720;
const TITLE = { x: 948, y: 396 };
const RING = { rx: 236, ry: 64 };
// Ramanujan approximation; used only as a dash length larger than the ring perimeter.
const RING_LENGTH = Math.ceil(
  Math.PI *
    (3 * (RING.rx + RING.ry) - Math.sqrt((3 * RING.rx + RING.ry) * (RING.rx + 3 * RING.ry))),
);
const CAPTION = { x: 640, en: 622, cn: 660, line: 676, width: 560 };
const BUST = { x: 470, y: 430 };

export function terminalLyricPatch(state: TerminalState): Patch {
  const on = (value: boolean) => (value ? "1" : "0");
  const patch: Patch = {};
  patch["tl-aperture-shape"] = {
    ry: fixed(Math.max(1.5, state.aperture * 560)),
  };
  patch["tl-powerline"] = { opacity: fixed(state.powerLine) };
  patch["tl-header"] = { "#text": state.header.text };
  const en = [...state.english.text];
  const enSplit = [...terminalCopy.english.before].length;
  patch["tl-en-before"] = { "#text": en.slice(0, enSplit).join("") };
  patch["tl-en-keyword"] = { "#text": en.slice(enSplit).join("") };
  const cn = [...state.chinese.text];
  const cnSplit = [...terminalCopy.chinese.before].length;
  patch["tl-cn-before"] = { "#text": cn.slice(0, cnSplit).join("") };
  patch["tl-cn-keyword"] = { "#text": cn.slice(cnSplit).join("") };
  patch["tl-underline"] = { width: fixed(CAPTION.width * state.underline) };
  const title = state.title;
  const transform = (dx: number) =>
    `translate(${fixed(TITLE.x + dx + title.jitter)} ${TITLE.y}) scale(${fixed(title.scale)})`;
  patch["tl-title"] = {
    opacity: fixed(title.opacity),
    transform: transform(0),
  };
  patch["tl-title-red"] = {
    opacity: fixed(title.visible && title.offset > 0.2 ? 0.85 * title.opacity : 0),
    transform: transform(-title.offset),
  };
  patch["tl-title-blue"] = {
    opacity: fixed(title.visible && title.offset > 0.2 ? 0.85 * title.opacity : 0),
    transform: transform(title.offset),
  };
  patch["tl-ring"] = {
    opacity: on(state.ring > 0),
    "stroke-dashoffset": fixed(RING_LENGTH * (1 - state.ring)),
  };
  patch["tl-detect"] = { opacity: on(state.detect) };
  patch["tl-scan"] = {
    "#text": `SCAN ${String(state.scan).padStart(3, "0")}%`,
  };
  patch["tl-scan-bar"] = { width: fixed(1.6 * state.scan) };
  terminalCopy.data.forEach((_, index) => {
    patch[`tl-data-${index}`] = { opacity: on(index < state.dataLines) };
  });
  patch["tl-warning"] = { opacity: on(state.warning) };
  patch["tl-bust"] = {
    transform: `translate(${BUST.x} ${BUST.y}) scale(${fixed(state.push)}) translate(${-BUST.x} ${-BUST.y})`,
  };
  state.meter.forEach((height, index) => {
    patch[`tl-meter-${index}`] = {
      y: String(668 - height),
      height: String(height),
    };
  });
  patch["tl-grain"] = {
    transform: `translate(${state.grain.x} ${state.grain.y})`,
  };
  return patch;
}

/** Complete (not incremental) patches for every 30fps frame, so any seek is independent. */
export function terminalLyricPatches() {
  return Array.from({ length: TERMINAL_FRAMES }, (_, frame) =>
    terminalLyricPatch(terminalLyricState(frame / TERMINAL_FPS)),
  );
}

// ---------------------------------------------------------------------------
// SVG drawing
// ---------------------------------------------------------------------------

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
type Attrs = Record<string, string | number | undefined>;
const attrs = (values: Attrs) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${escapeXml(String(value))}"`)
    .join(" ");

function drawing(patch: Patch) {
  return (tag: string, values: Attrs, children = "") => {
    const id = values.id === undefined ? undefined : String(values.id);
    const merged: Attrs = { ...values };
    let content = children;
    for (const [key, value] of Object.entries((id && patch[id]) || {}))
      if (key === "#text") content = escapeXml(value);
      else merged[key] = value;
    return content || tag === "text" || tag === "tspan"
      ? `<${tag} ${attrs(merged)}>${content}</${tag}>`
      : `<${tag} ${attrs(merged)}/>`;
  };
}
type El = ReturnType<typeof drawing>;

export const MONO_FONT = "'TLA Mono', Menlo, 'SF Mono', ui-monospace, monospace";
export const CJK_FONT =
  "'TLA CJK', 'PingFang SC', 'Hiragino Sans GB', 'Heiti SC', 'Noto Sans CJK SC', sans-serif";

/** Hard-edged backdrop slabs and screen rule lines (three inks only). */
function backdrop() {
  return (
    `<rect width="${W}" height="${H}" fill="${C.near_black}"/>` +
    `<path d="M0 470L560 92L760 92L120 720H0Z" fill="${C.ultramarine}" opacity=".9"/>` +
    `<path d="M612 720L1120 92H1180L700 720Z" fill="${C.ultramarine}" opacity=".35"/>` +
    `<path d="M168 720L760 168L784 168L214 720Z" fill="${C.cream}" opacity=".9"/>` +
    `<circle cx="470" cy="300" r="214" fill="none" stroke="${C.cream}" stroke-width="1.5" opacity=".5"/>` +
    `<circle cx="470" cy="300" r="236" fill="none" stroke="${C.cream}" stroke-width="1" stroke-dasharray="3 9" opacity=".45"/>`
  );
}

/** Original generic bust with headphones: flat three-ink shapes, clearly illustrative. */
function bust(el: El) {
  const U = C.ultramarine;
  const K = C.near_black;
  const Q = C.cream;
  const eye = (cx: number, cy: number, s: number) =>
    `<path d="M${cx - 34 * s} ${cy + 2}C${cx - 22 * s} ${cy - 22 * s} ${cx + 20 * s} ${cy - 26 * s} ${cx + 36 * s} ${cy - 8 * s}L${cx + 30 * s} ${cy - 2 * s}C${cx + 16 * s} ${cy - 14 * s} ${cx - 18 * s} ${cy - 12 * s} ${cx - 30 * s} ${cy + 6}Z" fill="${K}"/>` +
    `<ellipse cx="${cx}" cy="${cy + 12 * s}" rx="${19 * s}" ry="${24 * s}" fill="${U}"/>` +
    `<ellipse cx="${cx}" cy="${cy + 15 * s}" rx="${9 * s}" ry="${13 * s}" fill="${K}"/>` +
    `<circle cx="${cx - 7 * s}" cy="${cy + 2 * s}" r="${6 * s}" fill="${Q}"/>` +
    `<circle cx="${cx + 7 * s}" cy="${cy + 26 * s}" r="${2.6 * s}" fill="${Q}"/>` +
    `<path d="M${cx - 26 * s} ${cy + 40 * s}Q${cx} ${cy + 46 * s} ${cx + 24 * s} ${cy + 36 * s}" fill="none" stroke="${K}" stroke-width="2.5"/>`;
  const art =
    // Back hair mass.
    `<path d="M304 352C292 220 368 130 474 128C590 126 662 214 652 340L668 560L606 520L612 600L556 540L392 540L334 596L340 520L282 560Z" fill="${U}" stroke="${K}" stroke-width="5" stroke-linejoin="round"/>` +
    // Jacket and collar.
    `<path d="M228 720C238 618 300 566 400 548L540 548C640 566 704 618 714 720Z" fill="${K}"/>` +
    `<path d="M400 548L470 640L540 548L514 540L470 600L426 540Z" fill="${Q}"/>` +
    `<path d="M300 720C312 650 350 610 400 590L384 720Z" fill="${U}"/>` +
    `<path d="M640 720C628 650 590 610 540 590L556 720Z" fill="${U}"/>` +
    // Neck with hard cel shadow.
    `<path d="M436 462L506 462L512 556L430 556Z" fill="${Q}"/>` +
    `<path d="M436 462L506 462L508 500C488 520 456 520 434 500Z" fill="${U}"/>` +
    // Face.
    `<path d="M372 262C370 360 404 446 466 486C532 450 566 362 566 262C540 224 400 222 372 262Z" fill="${Q}" stroke="${K}" stroke-width="3"/>` +
    eye(426, 330, 1) +
    eye(522, 326, 0.86) +
    `<path d="M398 296L452 288M500 286L548 292" stroke="${K}" stroke-width="3.5"/>` +
    `<path d="M476 378L470 398L480 400" fill="none" stroke="${K}" stroke-width="2.5"/>` +
    `<path d="M452 430Q470 438 488 428" fill="none" stroke="${K}" stroke-width="3"/>` +
    // Fringe with hard spikes and cream highlight slivers.
    `<path d="M352 300C344 196 410 144 476 144C552 144 604 196 596 296L572 250L560 312L532 236L506 300L486 228L456 304L438 232L410 300L396 246L372 316Z" fill="${U}"/>` +
    `<path d="M420 176C450 160 500 158 530 172L524 180C496 170 452 170 426 184Z" fill="${Q}"/>` +
    `<path d="M560 214L578 254L570 256Z" fill="${Q}"/>` +
    // Headphones.
    `<path d="M330 318C318 160 618 140 614 318" fill="none" stroke="${K}" stroke-width="20"/>` +
    `<rect x="300" y="300" width="56" height="96" rx="24" fill="${K}"/>` +
    `<rect x="310" y="316" width="36" height="64" rx="16" fill="${U}" stroke="${Q}" stroke-width="2"/>` +
    `<rect x="590" y="296" width="52" height="92" rx="22" fill="${K}"/>` +
    `<rect x="598" y="312" width="34" height="60" rx="15" fill="${U}" stroke="${Q}" stroke-width="2"/>`;
  return el("g", { id: "tl-bust", "data-role": "illustrative-subject" }, art);
}

function brackets() {
  const corner = (x: number, y: number, dx: number, dy: number) =>
    `<path d="M${x} ${y + 34 * dy}V${y}H${x + 34 * dx}" fill="none" stroke="${C.cream}" stroke-width="2"/>`;
  return (
    corner(36, 36, 1, 1) +
    corner(W - 36, 36, -1, 1) +
    corner(36, H - 36, 1, -1) +
    corner(W - 36, H - 36, -1, -1)
  );
}

function hud(el: El) {
  const mono = (values: Attrs, text = "") =>
    el(
      "text",
      {
        "font-family": MONO_FONT,
        fill: C.cream,
        "xml:space": "preserve",
        ...values,
      },
      text && escapeXml(text),
    );
  const header =
    mono({
      id: "tl-header",
      x: W / 2,
      y: 70,
      "font-size": 20,
      "font-weight": 700,
      "text-anchor": "middle",
      "letter-spacing": 2,
    }) + `<path d="M560 84H720" stroke="${C.cream}" stroke-width="1" opacity=".6"/>`;
  const status =
    mono({ x: 88, y: 74, "font-size": 14, opacity: 0.92 }, "TRK 07/12  CH-B") +
    mono(
      {
        x: W - 88,
        y: 74,
        "font-size": 14,
        opacity: 0.92,
        "text-anchor": "end",
      },
      "ILLUSTRATIVE · CODE-DRAWN",
    );
  const meter =
    Array.from({ length: 12 }, (_, i) =>
      el("rect", {
        id: `tl-meter-${i}`,
        x: 88 + i * 9,
        y: 650,
        width: 5,
        height: 18,
        fill: C.cream,
      }),
    ).join("") + mono({ x: 88, y: 686, "font-size": 12, opacity: 0.9 }, "AUDIO  L/R");
  const detect = el(
    "g",
    { id: "tl-detect" },
    `<path d="M384 246V230H404M556 230H576V246M576 470V486H556M404 486H384V470" fill="none" stroke="${C.cream}" stroke-width="2.5"/>` +
      `<rect x="384" y="230" width="192" height="256" fill="none" stroke="${C.cream}" stroke-width="1" opacity=".55"/>` +
      `<rect x="384" y="204" width="138" height="20" fill="${C.near_black}"/>` +
      mono({ x: 390, y: 219, "font-size": 12, "font-weight": 700 }, "SUBJ_01") +
      mono({ id: "tl-scan", x: 460, y: 219, "font-size": 12, fill: C.signal_blue }, "SCAN 000%") +
      `<rect x="384" y="494" width="160" height="3" fill="${C.cream}" opacity=".25"/>` +
      el("rect", {
        id: "tl-scan-bar",
        x: 384,
        y: 494,
        width: 0,
        height: 3,
        fill: C.signal_blue,
      }) +
      `<path d="M576 300H640L664 276" fill="none" stroke="${C.cream}" stroke-width="1.2"/>`,
  );
  const data = terminalCopy.data
    .map((line, index) =>
      mono(
        {
          id: `tl-data-${index}`,
          x: 670,
          y: 182 + index * 22,
          "font-size": 14,
        },
        line,
      ),
    )
    .join("");
  const card =
    `<rect x="660" y="146" width="210" height="122" fill="${C.near_black}" stroke="${C.cream}" stroke-width="1.2"/>` +
    `<rect x="660" y="146" width="210" height="18" fill="${C.cream}"/>` +
    mono(
      {
        x: 668,
        y: 160,
        "font-size": 11,
        "font-weight": 700,
        fill: C.near_black,
      },
      "SPECIMEN · ILLUSTRATIVE",
    ) +
    data;
  const warning = el(
    "g",
    { id: "tl-warning", "data-role": "warning" },
    `<rect x="660" y="282" width="168" height="26" fill="${C.near_black}" stroke="${C.warning_red}" stroke-width="2"/>` +
      mono(
        {
          x: 672,
          y: 300,
          "font-size": 14,
          "font-weight": 700,
          fill: C.warning_red,
        },
        terminalCopy.warning,
      ),
  );
  return header + status + meter + detect + card + warning;
}

function titleBlock(el: El) {
  const glyph = (id: string, fill: string, extra: Attrs = {}) =>
    el(
      "text",
      {
        id,
        "font-family": MONO_FONT,
        "font-size": 96,
        "font-weight": 800,
        "letter-spacing": 6,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        fill,
        ...extra,
      },
      terminalCopy.title,
    );
  return (
    el("ellipse", {
      id: "tl-ring",
      cx: TITLE.x,
      cy: TITLE.y,
      rx: RING.rx,
      ry: RING.ry,
      fill: "none",
      stroke: C.cream,
      "stroke-width": 1.6,
      "stroke-dasharray": `${RING_LENGTH} ${RING_LENGTH}`,
      transform: `rotate(-6 ${TITLE.x} ${TITLE.y})`,
    }) +
    `<g style="mix-blend-mode:screen">${glyph("tl-title-red", C.warning_red, { "data-role": "rgb-offset" })}${glyph("tl-title-blue", C.signal_blue)}</g>` +
    glyph("tl-title", C.cream)
  );
}

function caption(el: El) {
  return (
    `<rect x="${CAPTION.x - CAPTION.width / 2 - 24}" y="590" width="${CAPTION.width + 48}" height="98" fill="${C.near_black}" opacity=".82"/>` +
    el(
      "text",
      {
        x: CAPTION.x,
        y: CAPTION.en,
        "font-family": MONO_FONT,
        "font-size": 24,
        "font-weight": 700,
        "text-anchor": "middle",
        fill: C.cream,
        "xml:space": "preserve",
      },
      el("tspan", { id: "tl-en-before" }, "") +
        el("tspan", { id: "tl-en-keyword", fill: C.signal_blue }, ""),
    ) +
    el(
      "text",
      {
        x: CAPTION.x,
        y: CAPTION.cn,
        "font-family": CJK_FONT,
        "font-size": 22,
        "text-anchor": "middle",
        fill: C.cream,
        "xml:space": "preserve",
      },
      el("tspan", { id: "tl-cn-before" }, "") +
        el("tspan", { id: "tl-cn-keyword", fill: C.signal_blue }, ""),
    ) +
    `<rect x="${CAPTION.x - CAPTION.width / 2}" y="${CAPTION.line}" width="${CAPTION.width}" height="2" fill="${C.cream}" opacity=".2"/>` +
    el("rect", {
      id: "tl-underline",
      x: CAPTION.x - CAPTION.width / 2,
      y: CAPTION.line,
      width: 0,
      height: 2,
      fill: C.cream,
    })
  );
}

function crtFinish(el: El) {
  const noise = seeded(138);
  const specks = Array.from({ length: 420 }, () => {
    const x = noise() * (W + 40) - 20;
    const y = noise() * (H + 24) - 12;
    return `<rect x="${fixed(x)}" y="${fixed(y)}" width="${noise() > 0.7 ? 2 : 1}" height="1" opacity="${fixed(0.05 + noise() * 0.14)}"/>`;
  }).join("");
  return (
    el("g", { id: "tl-grain", fill: C.cream }, specks) +
    `<rect width="${W}" height="${H}" fill="url(#tl-scanlines)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#tl-vignette)"/>`
  );
}

export function terminalLyricPreviewSvg(time = TERMINAL_DURATION) {
  const el = drawing(terminalLyricPatch(terminalLyricState(time)));
  const defs =
    `<defs>` +
    `<clipPath id="tl-aperture">${el("ellipse", { id: "tl-aperture-shape", cx: W / 2, cy: H / 2, rx: 900, ry: 560 })}</clipPath>` +
    `<pattern id="tl-scanlines" width="6" height="3" patternUnits="userSpaceOnUse"><rect y="2" width="6" height="1" fill="${C.background}" opacity=".42"/></pattern>` +
    `<radialGradient id="tl-vignette" cx="50%" cy="50%" r="72%"><stop offset=".6" stop-color="${C.background}" stop-opacity="0"/><stop offset="1" stop-color="${C.background}" stop-opacity=".88"/></radialGradient>` +
    `</defs>`;
  const screen =
    `<g clip-path="url(#tl-aperture)">` +
    backdrop() +
    bust(el) +
    titleBlock(el) +
    hud(el) +
    caption(el) +
    crtFinish(el) +
    `</g>`;
  const powerLine = el("rect", {
    id: "tl-powerline",
    x: 0,
    y: H / 2 - 1.5,
    width: W,
    height: 3,
    fill: C.cream,
    opacity: 0,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-layout-allow-overflow="true">${defs}<rect width="${W}" height="${H}" fill="${C.background}"/>${screen}${brackets()}${powerLine}</svg>`;
}

// ---------------------------------------------------------------------------
// HyperFrames composition
// ---------------------------------------------------------------------------

/** Local system fonts only (no downloads); the SVG font lists fall back to the same faces. */
const fontFaces =
  `@font-face{font-family:"TLA Mono";src:local("Menlo-Regular"),local("Menlo"),local("SFMono-Regular");font-weight:400}` +
  `@font-face{font-family:"TLA Mono";src:local("Menlo-Bold"),local("Menlo Bold"),local("SFMono-Bold");font-weight:700 800}` +
  `@font-face{font-family:"TLA CJK";src:local("PingFangSC-Regular"),local("PingFang SC"),local("Hiragino Sans GB"),local("STHeitiSC-Light")}`;

export function terminalLyricPreviewHtml() {
  const patches = JSON.stringify(terminalLyricPatches()).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaces}html,body{margin:0;background:${C.background}}svg{display:block;width:1280px;height:720px}</style></head><body><div data-composition-id="${TERMINAL_COMPOSITION_ID}" data-width="1280" data-height="720" data-duration="${TERMINAL_DURATION}" data-fps="${TERMINAL_FPS}" style="width:100%;height:100%">${terminalLyricPreviewSvg(0)}</div><script src="gsap.min.js"></script><script>
const FRAMES=${patches};
const nodes={};
const node=(id)=>nodes[id]||(nodes[id]=document.getElementById(id));
function applyFrame(frame){const patch=FRAMES[frame];for(const id in patch){const target=node(id);const values=patch[id];for(const key in values){if(key==='#text')target.textContent=values[key];else target.setAttribute(key,values[key]);}}}
const clock={time:0};
function render(time){applyFrame(Math.max(0,Math.min(${TERMINAL_FRAMES - 1},Math.floor(time*${TERMINAL_FPS}+1e-4))));}
const tl=gsap.timeline({paused:true});
tl.to(clock,{time:${TERMINAL_DURATION},duration:${TERMINAL_DURATION},ease:'none',onUpdate:()=>render(tl.time())},0);
render(0);
window.__timelines={'${TERMINAL_COMPOSITION_ID}':tl};
function onSeek(event){const time=event&&event.detail&&typeof event.detail.time==='number'?event.detail.time:tl.time();tl.seek(time,false);render(time);}
window.addEventListener('hf-seek',onSeek);
window.addEventListener('pagehide',()=>window.removeEventListener('hf-seek',onSeek),{once:true});
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

const designNotes =
  "Claude Opus 5.5 code-drawn Terminal Lyric Duotone Anime study: an original, clearly illustrative headphone bust in flat ultramarine, cream and near-black inside a CRT terminal frame with scanlines, seeded grain, vignette and corner brackets; a decoding §07 header, a bilingual monospace/CJK caption with a growing progress underline and signal-blue keyword, a HUD detection box and specimen card that build from authored data, a keyword title that settles from an RGB offset into a thin ellipse ring, and one warning-only red label. Not reference artwork, footage or lyrics.";

export const terminalWorkspace = () =>
  path.join(examplesFolder, "video-projects", TERMINAL_STYLE_ID);

export async function prepareTerminalLyricPreview() {
  const catalog = await loadCatalog();
  const style = catalog.styles.find((entry) => entry.id === TERMINAL_STYLE_ID);
  if (!style) throw Error("Terminal Lyric Duotone Anime must be in the catalog first");
  const svg = terminalLyricPreviewSvg();
  await validateExamplePalette(svg, style);
  const record = await publishExample(
    { styleId: style.id, svg, designNotes },
    {
      styleId: style.id,
      catalogHash: catalog.hash,
      thumbnail: "",
      status: "ready",
      provider: "claude",
      model: TERMINAL_AUTHOR_MODEL,
    },
  );
  await writeExampleRecords([
    ...(await readExampleRecords()).filter((entry) => entry.styleId !== style.id),
    record,
  ]);
  const workspace = terminalWorkspace();
  await mkdir(workspace, { recursive: true });
  await copyFile(
    path.resolve("node_modules/gsap/dist/gsap.min.js"),
    path.join(workspace, "gsap.min.js"),
  );
  await writeFile(path.join(workspace, "index.html"), terminalLyricPreviewHtml());
  await writeFile(path.join(workspace, "STYLE.json"), JSON.stringify(style, null, 2));
  return {
    workspace,
    record,
    svgHash: createHash("sha256").update(svg).digest("hex"),
  };
}

/** Renders through the existing HyperFrames pipeline and records the clip only after it succeeds. */
export async function renderTerminalLyricPreview() {
  const [{ renderJob }, { verifyVisibleMotion }, motion, assets, { illustrationMotionRevision }] =
    await Promise.all([
      import("../src/server/rendering/render"),
      import("../src/server/motion/motion-visibility"),
      import("../src/server/catalog/style-motion"),
      import("../src/server/catalog/style-preview-assets"),
      import("../src/server/motion/illustration-motion"),
    ]);
  const catalog = await loadCatalog();
  const workspace = terminalWorkspace();
  const signal = new AbortController().signal;
  const started = Date.now();
  const output = await renderJob(
    {
      id: TERMINAL_STYLE_ID,
      runId: "style-examples",
      candidateId: TERMINAL_STYLE_ID,
      kind: "preview",
      phase: "rendering",
      workspace,
      model: TERMINAL_AUTHOR_MODEL,
      duration: TERMINAL_DURATION,
    },
    {
      pipeline: "HyperFrames",
      fallbackReason: null,
      styleRenderer: ["SVG"],
      motionEngine: ["GSAP"],
      sourceFile: "index.html",
      duration: TERMINAL_DURATION,
      width: 1280,
      height: 720,
      audioDescription: "Silent",
      limitations: [
        "Illustrative code-drawn placeholder bust and invented copy; production artwork must be supplied or purpose-drawn. Not reference footage.",
      ],
    },
    signal,
    (type, message) => console.log(`${type}: ${message}`),
  );
  const rendered = path.join(workspace, output.video);
  const visibleChangeRatio = await verifyVisibleMotion(rendered, signal);
  const video = TERMINAL_STYLE_ID + path.extname(output.video);
  await copyFile(rendered, path.join(assets.stylePreviewVideoFolder, video));
  await assets.publishStylePreviewSource(workspace, TERMINAL_STYLE_ID);
  const svg = terminalLyricPreviewSvg();
  const records = (await motion.readStyleVideos()).filter((r) => r.styleId !== TERMINAL_STYLE_ID);
  await motion.writeStyleVideos([
    ...records,
    {
      styleId: TERMINAL_STYLE_ID,
      catalogHash: catalog.hash,
      sourceHash: createHash("sha256").update(svg).digest("hex"),
      video,
      duration: TERMINAL_DURATION,
      generatedAt: new Date().toISOString(),
      renderMs: Date.now() - started,
      reviewed: true,
      motionRevision: illustrationMotionRevision,
      visibleChangeRatio,
      model: TERMINAL_AUTHOR_MODEL,
    },
  ]);
  return { video, visibleChangeRatio };
}

/** Authored agent summary for this style only, keyed by the existing summary cache helper. */
export const terminalLyricSummary = {
  styleId: TERMINAL_STYLE_ID,
  name: "Terminal Lyric Duotone Anime. An authored Motion Graphic in Drawing and Illustration: a strict three-ink anime music-video grammar inside a CRT terminal frame, narrower than Anime (style-033) and using CRT (style-066) and Glitch Art (style-067) only as finishing and transition layers.",
  visualIdentity:
    "Explicit: flat hard-edged ultramarine, cream and near-black art with no gradients (a tritone despite the Duotone name), red reserved for warnings and peaks, a mild CRT vignette, scanlines, grain and corner brackets, a §NN header, an audio meter, bilingual monospace captions that decode from scrambled glyphs with a progress underline, ringed keyword titles and HUD overlays that read the subject as data.",
  suitableUses:
    "Explicit: lyric videos, music videos and character-driven stories framed as terminals, programs or memories. Inferred: tech-themed narrative shorts and bilingual title sequences. Not suited to photoreal, pastel, rainbow-neon or corporate-dashboard briefs. Audience is unspecified.",
  limitations:
    "Character and scene art must be supplied or purpose-drawn; code may only draw labelled placeholders, and no output may imply AI-generated or reference footage. Do not reproduce any source character, song or lyrics. Avoid gradients, continuous glitching, strobing (keep flashes under about three per second) and illegible microtext.",
  palette:
    "Suggested scene-dependent tokens: screen #06070B, near-black ink #0D0F16, ultramarine #2747C8, cream #F1E8D2, signal blue #7A93FF for on-screen keyword text and HUD only, warning red #F0473A reserved. Gradients disabled except the CRT vignette.",
  motionAndInteraction:
    "Explicit: held cutout poses, character-by-character caption decode with a growing underline, a keyword title entering with an RGB offset and settling inside an ellipse ring, HUD data builds, plain or brief glitch cuts and readable holds. Optional references: Glitch Type Build, Data Build, Glitch Cut, Terminal Typing, Rotating Sonar-Sweep Reveal and Pixel-Tile Materialize & Targeted Delete.",
  audio:
    "Optional song, instrumental bed, sparse UI blips or silence; captions follow measured vocal timing only. Do not claim beat sync, invent lyrics or imitate a specific song. The catalog preview is silent.",
  assetRequirements:
    "Requires supplied or purpose-drawn three-ink illustrations for real productions; exact bilingual copy, duration, aspect ratio and frame rate are unspecified unless supplied. Use local system monospace and CJK fonts and verify glyph coverage.",
  combinations:
    "Usually used alone. CRT / Analog Video Effects (style-066) for power-on or squeeze transitions, Infinite Zoom (style-098) for an iris push into a title, Glitch Art (style-067) for brief red slice frames at warning peaks.",
  productionApproach:
    "Supplied illustration layers plus HTML/CSS and SVG for frame, HUD and captions, Canvas 2D for seeded grain or pixel effects, GSAP with Scrambled Text Reveal or a seeded glyph table on one paused timeline, chroma-js for contrast checks. Composition and export follow the project renderer, HyperFrames by default.",
};

export async function cacheTerminalLyricSummary() {
  const { summarizeStyle, styleSummarySource, styleSummaryCacheFolder } =
    await import("../src/server/catalog/style-summaries");
  const catalog = await loadCatalog();
  const scratch = await mkdtemp(path.join(os.tmpdir(), "terminal-summary-"));
  try {
    // The helper derives the source-keyed cache name; the authored summary is supplied directly.
    await summarizeStyle(
      styleSummarySource(catalog, TERMINAL_STYLE_ID),
      "claude",
      new AbortController().signal,
      scratch,
      async ({ schema }) => ({
        value: schema.parse(terminalLyricSummary),
        sessionId: "",
      }),
    );
    const [name] = await readdir(path.join(scratch, "shared"));
    const entry = JSON.parse(await readFile(path.join(scratch, "shared", name), "utf8"));
    const target = path.join(styleSummaryCacheFolder, "shared", name);
    // Record the actual author rather than the helper's default summary model.
    await writeFile(
      target,
      JSON.stringify({ ...entry, model: TERMINAL_AUTHOR_MODEL, provider: "claude" }, null, 2),
    );
    return target;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  console.log(await prepareTerminalLyricPreview());
  if (args.includes("--summary")) console.log(await cacheTerminalLyricSummary());
  if (args.includes("--render")) console.log(await renderTerminalLyricPreview());
}
