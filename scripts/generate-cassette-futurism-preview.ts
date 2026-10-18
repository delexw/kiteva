import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/server/catalog/catalog";
import {
  examplesFolder,
  publishExample,
  readExampleRecords,
  validateExamplePalette,
  writeExampleRecords,
} from "../src/server/catalog/style-examples";

/**
 * Cassette Futurism (style-137) preview. Original code-drawn console artwork:
 * the static SVG and the HyperFrames composition share one builder, and every
 * animated attribute comes from a pure, 12fps-quantized time-state function.
 */
export const CASSETTE_STYLE_ID = "style-137";
export const CASSETTE_COMPOSITION_ID = "cassette-futurism";
export const CASSETTE_DURATION = 3;
export const CASSETTE_STEP_RATE = 12;
export const CASSETTE_STEPS = CASSETTE_DURATION * CASSETTE_STEP_RATE;
export const CASSETTE_AUTHOR_MODEL = "claude-opus-5-5";

export const cassetteColors = {
  background: "#1A1C18",
  foreground: "#ECE3CC",
  panel_charcoal: "#2E302B",
  panel_olive: "#4B5038",
  case_beige: "#CFC2A2",
  label_black: "#121311",
  crt_black: "#060907",
  phosphor_green: "#74FF9A",
  phosphor_amber: "#FFB23E",
  stripe_orange: "#E2762B",
  stripe_rust: "#9A4526",
  warning_red: "#D7322B",
} as const;
const C = cassetteColors;

// ---------------------------------------------------------------------------
// Time state (pure; no DOM, no clocks)
// ---------------------------------------------------------------------------

export const bootLog = [
  "> PWR BUS A ........ OK",
  "> NAV GYRO ......... OK",
  "> TAPE DC-02 LOAD .. OK",
  "> SYS READY",
] as const;
const typedTotal = bootLog.reduce((sum, line) => sum + line.length, 0);
const CHARS_PER_STEP = 9;
export const cassetteCues = {
  power: 1,
  bootDone: 3,
  play: 3,
  typeStart: 4,
  sysReady: 13,
  staticStart: 19,
  staticEnd: 21,
  page2: 22,
  readouts: 23,
  warning: 26,
} as const;
const barTargets = { fuel: 7, o2: 3, pwr: 9 } as const;

export function cassetteStep(time: number) {
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(CASSETTE_STEPS - 1, Math.floor(time * CASSETTE_STEP_RATE + 1e-6)));
}

export function cassetteFuturismState(time: number) {
  const step = cassetteStep(time);
  const cue = cassetteCues;
  const playSteps = Math.max(0, step - cue.play);
  const typed = step < cue.typeStart ? 0 : Math.min(typedTotal, (step - 3) * CHARS_PER_STEP);
  let remaining = typed;
  const lines = bootLog.map((line) => {
    const count = Math.min(line.length, remaining);
    remaining -= count;
    return line.slice(0, count);
  });
  const activeLine = Math.max(
    0,
    lines.findIndex((line, index) => line.length < bootLog[index].length),
  );
  const cursorLine = typed >= typedTotal ? bootLog.length - 1 : activeLine;
  const holding = typed >= typedTotal;
  // Page 1 appears dimly during warm-up; the static cut shows page 1, pure static, then page 2.
  const page: 0 | 1 | 2 = step < 2 ? 0 : step < 20 ? 1 : step === 20 ? 0 : 2;
  const fill = (target: number) =>
    step < cue.readouts ? 0 : Math.min(target, (step - cue.page2) * 3);
  return {
    step,
    time: step / CASSETTE_STEP_RATE,
    brightness: [0, 0.6, 0.15][step] ?? 1,
    warmupLine: step === cue.power,
    page,
    staticBand: step >= cue.staticStart && step <= cue.staticEnd,
    pageOffset: step === 19 ? -12 : step === 21 ? 9 : 0,
    lines,
    cursor: {
      visible:
        step >= cue.bootDone &&
        step < cue.staticStart &&
        (!holding || Math.floor((step - cue.sysReady) / 3) % 2 === 0),
      line: cursorLine,
      column: lines[cursorLine].length,
    },
    reels: { supply: playSteps * 20, takeup: playSteps * 27.5 },
    packs: { supply: 50 - playSteps * 0.2, takeup: 31 + playSteps * 0.2 },
    playPressed: step >= cue.play,
    counter: String(412 + Math.floor(playSteps / 2)).padStart(4, "0"),
    met: `0014${String(7 + Math.floor(step / CASSETTE_STEP_RATE)).padStart(2, "0")}`,
    toggles: {
      nav: step >= cue.staticStart,
      pwr: step >= cue.power,
      sys: step >= cue.sysReady,
      aux: false,
    },
    knobDetent: step < cue.page2 ? 0 : Math.min(3, step - cue.page2 + 1),
    readouts: step >= cue.readouts,
    bars: { fuel: fill(barTargets.fuel), o2: fill(barTargets.o2), pwr: fill(barTargets.pwr) },
    warning: step >= cue.warning,
  };
}
export type CassetteState = ReturnType<typeof cassetteFuturismState>;

// Deterministic seeded generator for noise specks and static bands.
function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function stepHash(step: number, salt: number) {
  return seeded(step * 7919 + salt)();
}

// ---------------------------------------------------------------------------
// Attribute patches: the single bridge between state and drawing
// ---------------------------------------------------------------------------

type Patch = Record<string, Record<string, string>>;
const ADVANCE = 13.2;
const SCREEN = { x: 70, y: 140, width: 608, height: 356 };
const LINE_Y = [232, 270, 308, 346];
const TEXT_X = 100;
const REELS = { supply: { x: 880, y: 210 }, takeup: { x: 1080, y: 210 } };
const TOGGLES = ["nav", "pwr", "sys", "aux"] as const;
const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};
const fixed = (value: number) => String(Number(value.toFixed(2)));

function digitPatch(patch: Patch, id: string, text: string, lit = true) {
  [...text].forEach((char, index) => {
    for (const segment of "abcdefg")
      patch[`${id}-${index}-${segment}`] = {
        opacity: lit && SEGMENTS[char]?.includes(segment) ? "1" : "0.035",
      };
  });
}

function tapePath(state: CassetteState) {
  const s = state.packs.supply,
    t = state.packs.takeup;
  return `M${REELS.supply.x - s} ${REELS.supply.y}L${REELS.supply.x - s} ${fixed(REELS.supply.y + 8)}Q${REELS.supply.x - s} 292 930 292H1030Q${REELS.takeup.x + t} 292 ${REELS.takeup.x + t} ${REELS.takeup.y + 8}L${REELS.takeup.x + t} ${REELS.takeup.y}`;
}

export function cassetteFuturismPatch(state: CassetteState): Patch {
  const patch: Patch = {};
  const on = (value: boolean) => (value ? "1" : "0");
  patch["cf-power"] = { opacity: fixed(state.brightness) };
  patch["cf-warmup"] = { opacity: on(state.warmupLine) };
  patch["cf-page1"] = {
    opacity: on(state.page === 1),
    transform: `translate(${state.page === 1 ? state.pageOffset : 0} 0)`,
  };
  patch["cf-page2"] = {
    opacity: on(state.page === 2),
    transform: `translate(${state.page === 2 ? state.pageOffset : 0} 0)`,
  };
  state.lines.forEach((line, index) => {
    patch[`cf-line-${index}`] = {
      "#text": line,
      textLength: fixed(Math.max(1, line.length) * ADVANCE),
    };
  });
  patch["cf-cursor"] = {
    opacity: on(state.cursor.visible),
    x: fixed(TEXT_X + state.cursor.column * ADVANCE + 1),
    y: String(LINE_Y[state.cursor.line] - 18),
  };
  patch["cf-static"] = {
    opacity: on(state.staticBand),
    transform: `translate(${Math.round((stepHash(state.step, 3) - 0.5) * 30)} ${Math.round(stepHash(state.step, 5) * 200)})`,
  };
  patch["cf-noise"] = {
    transform: `translate(${Math.round((stepHash(state.step, 11) - 0.5) * 48)} ${Math.round((stepHash(state.step, 13) - 0.5) * 24)})`,
  };
  for (const reel of ["supply", "takeup"] as const) {
    const { x, y } = REELS[reel];
    patch[`cf-reel-${reel}`] = { transform: `rotate(${fixed(state.reels[reel] % 360)} ${x} ${y})` };
    patch[`cf-pack-${reel}`] = { r: fixed(state.packs[reel]) };
  }
  patch["cf-tape"] = { d: tapePath(state) };
  patch["cf-key-play"] = { transform: `translate(0 ${state.playPressed ? 3 : 0})` };
  patch["cf-lamp-play"] = { opacity: on(state.playPressed) };
  TOGGLES.forEach((name, index) => {
    const x = 800 + index * 72;
    patch[`cf-toggle-${name}`] = {
      transform: `rotate(${state.toggles[name] ? 0 : 180} ${x} 522)`,
    };
    patch[`cf-lamp-${name}`] = { opacity: on(state.toggles[name]) };
  });
  patch["cf-knob"] = { transform: `rotate(${-60 + state.knobDetent * 30} 1112 516)` };
  digitPatch(patch, "cf-counter", state.counter);
  digitPatch(patch, "cf-met", state.met);
  digitPatch(patch, "cf-hdg", "1174", state.readouts);
  patch["cf-readouts"] = { opacity: on(state.readouts) };
  for (const bar of ["fuel", "o2", "pwr"] as const)
    for (let block = 0; block < 10; block++)
      patch[`cf-bar-${bar}-${block}`] = { opacity: block < state.bars[bar] ? "1" : "0.13" };
  patch["cf-caution-lamp"] = { fill: state.warning ? C.warning_red : C.label_black };
  patch["cf-caution-legend"] = {
    fill: state.warning ? C.label_black : C.foreground,
    opacity: state.warning ? "1" : "0.32",
  };
  patch["cf-caution-msg"] = { opacity: on(state.warning) };
  return patch;
}

/** Complete (not incremental) patches for every 12fps step, so any seek is independent. */
export function cassetteFuturismPatches() {
  return Array.from({ length: CASSETTE_STEPS }, (_, step) =>
    cassetteFuturismPatch(cassetteFuturismState(step / CASSETTE_STEP_RATE)),
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
  const el = (tag: string, values: Attrs, children = "") => {
    const id = values.id === undefined ? undefined : String(values.id);
    const dynamic = id ? patch[id] : undefined;
    const merged: Attrs = { ...values };
    let content = children;
    for (const [key, value] of Object.entries(dynamic || {}))
      if (key === "#text") content = escapeXml(value);
      else merged[key] = value;
    return children || content || tag === "text"
      ? `<${tag} ${attrs(merged)}>${content}</${tag}>`
      : `<${tag} ${attrs(merged)}/>`;
  };
  return el;
}

const MONO = "monospace";
function label(
  el: ReturnType<typeof drawing>,
  x: number,
  y: number,
  text: string,
  options: {
    size?: number;
    fill?: string;
    anchor?: string;
    condense?: number;
  } = {},
) {
  const { size = 13, fill = C.label_black, anchor = "start", condense = 0.82 } = options;
  const node = el(
    "text",
    {
      x: fixed(x / condense),
      y,
      fill,
      "font-size": size,
      "font-weight": 700,
      "letter-spacing": 1.6,
      "text-anchor": anchor,
    },
    escapeXml(text),
  );
  return `<g transform="scale(${condense} 1)" font-family="${MONO}">${node}</g>`;
}

function screw(x: number, y: number, angle: number) {
  return `<g transform="rotate(${angle} ${x} ${y})"><circle cx="${x}" cy="${y}" r="6.5" fill="${C.foreground}" stroke="${C.label_black}" stroke-opacity=".5" stroke-width="1.2"/><path d="M${x - 4.2} ${y}H${x + 4.2}" stroke="${C.label_black}" stroke-width="1.6" opacity=".7"/></g>`;
}

function caseBox(x: number, y: number, width: number, height: number, seed: number) {
  const random = seeded(seed);
  const corner = (cx: number, cy: number) => screw(cx, cy, Math.round(random() * 180));
  return `<rect x="${x + 5}" y="${y + 6}" width="${width}" height="${height}" rx="5" fill="${C.label_black}" opacity=".6"/><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5" fill="${C.case_beige}"/><path d="M${x + 4} ${y + 1.5}H${x + width - 4}" stroke="${C.foreground}" stroke-width="2" opacity=".75"/><path d="M${x + 4} ${y + height - 1.5}H${x + width - 4}" stroke="${C.label_black}" stroke-width="2" opacity=".3"/>${corner(x + 12, y + 12)}${corner(x + width - 12, y + 12)}${corner(x + 12, y + height - 12)}${corner(x + width - 12, y + height - 12)}`;
}

function vents(x: number, y: number, count: number, length: number) {
  return Array.from(
    { length: count },
    (_, index) =>
      `<rect x="${x + index * 9}" y="${y}" width="4" height="${length}" rx="2" fill="${C.label_black}" opacity=".55"/>`,
  ).join("");
}

function stripes(x: number, y: number, width: number) {
  return [C.phosphor_amber, C.stripe_orange, C.stripe_rust]
    .map(
      (color, index) =>
        `<path d="M${x} ${y + index * 7}H${x + width}L${x + width + 10} ${y + index * 7 + 5}H${x + 10}Z" fill="${color}"/>`,
    )
    .join("");
}

function sevenSegment(
  el: ReturnType<typeof drawing>,
  id: string,
  offsets: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  const t = width * 0.2;
  const half = height / 2;
  const horizontal = (x0: number, x1: number, cy: number) =>
    `${x0},${cy} ${x0 + t / 2},${cy - t / 2} ${x1 - t / 2},${cy - t / 2} ${x1},${cy} ${x1 - t / 2},${cy + t / 2} ${x0 + t / 2},${cy + t / 2}`;
  const vertical = (cx: number, y0: number, y1: number) =>
    `${cx},${y0} ${cx + t / 2},${y0 + t / 2} ${cx + t / 2},${y1 - t / 2} ${cx},${y1} ${cx - t / 2},${y1 - t / 2} ${cx - t / 2},${y0 + t / 2}`;
  let out = "";
  offsets.forEach((offset, index) => {
    const left = x + offset + t / 2;
    const right = left + width - t;
    const gap = 1.2;
    const points: Record<string, string> = {
      a: horizontal(left + gap, right - gap, y + t / 2),
      b: vertical(right, y + t / 2 + gap, y + half - gap),
      c: vertical(right, y + half + gap, y + height - t / 2 - gap),
      d: horizontal(left + gap, right - gap, y + height - t / 2),
      e: vertical(left, y + half + gap, y + height - t / 2 - gap),
      f: vertical(left, y + t / 2 + gap, y + half - gap),
      g: horizontal(left + gap, right - gap, y + half),
    };
    for (const segment of "abcdefg")
      out += el("polygon", {
        id: `${id}-${index}-${segment}`,
        points: points[segment]
          .split(" ")
          .map((pair) =>
            pair
              .split(",")
              .map((value) => fixed(Number(value)))
              .join(","),
          )
          .join(" "),
        fill: color,
      });
  });
  return `<g data-readout="${id}">${out}</g>`;
}

function crtModule(el: ReturnType<typeof drawing>) {
  const { x, y, width, height } = SCREEN;
  const noise = seeded(137);
  const specks = Array.from({ length: 240 }, () => {
    const sx = x - 30 + noise() * (width + 60);
    const sy = y - 16 + noise() * (height + 32);
    return `<rect x="${fixed(sx)}" y="${fixed(sy)}" width="${noise() > 0.6 ? 2 : 1}" height="1" opacity="${fixed(0.06 + noise() * 0.16)}"/>`;
  }).join("");
  const band = seeded(66);
  const staticRows = Array.from({ length: 70 }, () => {
    const sy = y + band() * 120;
    const sx = x + band() * width;
    return `<rect x="${fixed(sx - 60)}" y="${fixed(sy)}" width="${fixed(20 + band() * 190)}" height="${band() > 0.7 ? 3 : 1}" opacity="${fixed(0.25 + band() * 0.5)}"/>`;
  }).join("");
  const crtText = (values: Attrs, text: string) =>
    el(
      "text",
      { "font-size": 22, fill: C.phosphor_green, "xml:space": "preserve", ...values },
      text ? escapeXml(text) : "",
    );
  const page1 = el(
    "g",
    { id: "cf-page1" },
    crtText(
      { x: TEXT_X, y: 192, textLength: fixed(28 * ADVANCE) },
      "KV-7 FLIGHT DECK   BIOS 2.04",
    ) +
      `<path d="M${TEXT_X} 204H${TEXT_X + 28 * ADVANCE}" stroke="${C.phosphor_green}" stroke-width="2" stroke-dasharray="6 5" opacity=".6"/>` +
      bootLog
        .map((_, index) => crtText({ id: `cf-line-${index}`, x: TEXT_X, y: LINE_Y[index] }, ""))
        .join("") +
      el("rect", {
        id: "cf-cursor",
        x: TEXT_X,
        y: LINE_Y[0] - 18,
        width: 12,
        height: 22,
        fill: C.phosphor_green,
      }) +
      crtText({ x: TEXT_X, y: 470, opacity: 0.7, "font-size": 18 }, "CH 01   DC-02   12 STEP/S"),
  );
  const bars = (["fuel", "o2", "pwr"] as const)
    .map((bar, row) => {
      const by = 372 + row * 28;
      const blocks = Array.from({ length: 10 }, (_, block) =>
        el("rect", {
          id: `cf-bar-${bar}-${block}`,
          x: 176 + block * 26,
          y: by - 17,
          width: 20,
          height: 20,
          fill: C.phosphor_green,
        }),
      ).join("");
      return crtText({ x: TEXT_X, y: by, "font-size": 18 }, bar.toUpperCase()) + blocks;
    })
    .join("");
  const page2 = el(
    "g",
    { id: "cf-page2" },
    crtText({ x: TEXT_X, y: 192, textLength: fixed(24 * ADVANCE) }, "NAV  ORBIT INSERTION  02") +
      `<path d="M${TEXT_X} 204H${TEXT_X + 24 * ADVANCE}" stroke="${C.phosphor_green}" stroke-width="2" stroke-dasharray="6 5" opacity=".6"/>` +
      crtText({ x: TEXT_X, y: 236, "font-size": 16, opacity: 0.8 }, "HDG") +
      sevenSegment(el, "cf-hdg", [0, 52, 104, 176], TEXT_X, 248, 40, 70, C.phosphor_green) +
      `<rect x="${TEXT_X + 158}" y="310" width="8" height="8" fill="${C.phosphor_green}"/>` +
      el(
        "g",
        { id: "cf-readouts" },
        crtText({ x: 380, y: 266, "font-size": 20 }, "ALT  0412.7 KM") +
          crtText({ x: 380, y: 300, "font-size": 20 }, "VEL  7.66 KM/S") +
          crtText({ x: 380, y: 334, "font-size": 20 }, "T+   00:14:07"),
      ) +
      bars +
      el(
        "g",
        { id: "cf-caution-msg" },
        `<rect x="${TEXT_X - 6}" y="452" width="${25 * ADVANCE + 12}" height="30" fill="${C.phosphor_green}"/>` +
          crtText(
            {
              x: TEXT_X,
              y: 474,
              fill: C.crt_black,
              "font-weight": 700,
              textLength: fixed(25 * ADVANCE),
            },
            "! CAUTION  O2 LOOP B LOW",
          ),
      ),
  );
  return (
    caseBox(24, 100, 700, 480, 7) +
    `<rect x="44" y="118" width="660" height="404" rx="6" fill="${C.panel_charcoal}"/><rect x="52" y="126" width="644" height="388" rx="14" fill="${C.label_black}"/>` +
    `<g clip-path="url(#cf-screen-clip)"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${C.crt_black}"/>` +
    el(
      "g",
      { id: "cf-power" },
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${C.phosphor_green}" opacity=".035"/>` +
        `<g filter="url(#cf-glow)" font-family="${MONO}" style="white-space:pre">${page1}${page2}</g>`,
    ) +
    el("g", { id: "cf-noise", fill: C.phosphor_green }, specks) +
    el(
      "g",
      { id: "cf-static", fill: C.phosphor_green },
      `<rect x="${x}" y="${y + 20}" width="${width}" height="80" opacity=".1"/>${staticRows}`,
    ) +
    el("rect", {
      id: "cf-warmup",
      x,
      y: y + height / 2 - 2,
      width,
      height: 4,
      fill: C.phosphor_green,
    }) +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#cf-scan)"/><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#cf-vignette)"/></g>` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="22" fill="none" stroke="${C.panel_charcoal}" stroke-width="5"/>` +
    `<rect x="44" y="534" width="300" height="32" rx="3" fill="${C.label_black}"/>` +
    label(el, 58, 556, "CRT-1  P1 PHOSPHOR  NAV", { fill: C.foreground, size: 15 }) +
    knobSmall(560, 550, "BRT", 20) +
    knobSmall(640, 550, "CONT", -30)
  );
}

function knobSmall(x: number, y: number, name: string, angle: number) {
  return `<circle cx="${x}" cy="${y}" r="15" fill="${C.panel_charcoal}" stroke="${C.label_black}" stroke-width="3"/><path d="M${x} ${y}V${y - 12}" stroke="${C.foreground}" stroke-width="3" transform="rotate(${angle} ${x} ${y})"/><text x="${x - 34}" y="${y + 5}" font-family="${MONO}" font-size="12" font-weight="700" fill="${C.label_black}" text-anchor="end">${name}</text>`;
}

function reel(el: ReturnType<typeof drawing>, name: "supply" | "takeup") {
  const { x, y } = REELS[name];
  const spokes = [0, 120, 240]
    .map(
      (angle) =>
        `<path d="M${x} ${y - 9}L${x - 6} ${y - 26}H${x + 6}Z" fill="${C.label_black}" transform="rotate(${angle} ${x} ${y})"/>`,
    )
    .join("");
  const window = [60, 180, 300]
    .map(
      (angle) =>
        `<path d="M${x - 14} ${y - 40}A42 42 0 0 1 ${x + 14} ${y - 40}L${x + 7} ${y - 30}A31 31 0 0 0 ${x - 7} ${y - 30}Z" fill="${C.panel_olive}" opacity=".9" transform="rotate(${angle} ${x} ${y})"/>`,
    )
    .join("");
  return (
    `<circle cx="${x}" cy="${y}" r="60" fill="${C.label_black}" opacity=".35"/>` +
    el("circle", { id: `cf-pack-${name}`, cx: x, cy: y, r: 40, fill: C.stripe_rust }) +
    `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${C.label_black}" stroke-opacity=".5" stroke-width="1"/>` +
    el(
      "g",
      { id: `cf-reel-${name}` },
      `<circle cx="${x}" cy="${y}" r="58" fill="none" stroke="${C.foreground}" stroke-width="3" opacity=".85"/>${window}<circle cx="${x}" cy="${y}" r="26" fill="${C.case_beige}"/>${spokes}<circle cx="${x}" cy="${y}" r="7" fill="${C.panel_charcoal}"/><path d="M${x} ${y - 50}V${y - 58}" stroke="${C.foreground}" stroke-width="4"/>`,
    )
  );
}

function tapeModule(el: ReturnType<typeof drawing>) {
  const keys = ["REW", "PLAY", "FF", "STOP", "REC"]
    .map((name, index) => {
      const x = 768 + index * 74;
      const key = `<rect x="${x}" y="336" width="60" height="46" rx="3" fill="${C.panel_charcoal}"/><path d="M${x + 3} 338H${x + 57}" stroke="${C.foreground}" stroke-width="1.5" opacity=".35"/>${
        name === "REC" ? `<circle cx="${x + 30}" cy="351" r="5" fill="${C.stripe_rust}"/>` : ""
      }<text x="${x + 30}" y="${name === "REC" ? 374 : 366}" font-family="${MONO}" font-size="14" font-weight="700" fill="${C.foreground}" text-anchor="middle">${name}</text>`;
      return `<rect x="${x}" y="340" width="60" height="46" rx="3" fill="${C.label_black}"/>${
        name === "PLAY" ? el("g", { id: "cf-key-play" }, key) : key
      }`;
    })
    .join("");
  return (
    caseBox(744, 100, 512, 300, 21) +
    `<rect x="760" y="118" width="480" height="196" rx="3" fill="${C.panel_olive}"/><path d="M760 118H1240" stroke="${C.foreground}" stroke-opacity=".25"/>` +
    label(el, 776, 140, "TAPE TRANSPORT  DC-02", { fill: C.foreground, size: 14 }) +
    reel(el, "supply") +
    reel(el, "takeup") +
    el("path", { id: "cf-tape", d: "", fill: "none", stroke: C.stripe_rust, "stroke-width": 3 }) +
    `<circle cx="930" cy="292" r="6" fill="${C.foreground}"/><circle cx="1030" cy="292" r="6" fill="${C.foreground}"/><rect x="958" y="290" width="44" height="18" rx="2" fill="${C.panel_charcoal}" stroke="${C.foreground}" stroke-opacity=".5"/>` +
    label(el, 980, 304, "HEAD", { fill: C.foreground, size: 10, anchor: "middle" }) +
    `<rect x="1158" y="150" width="70" height="40" rx="2" fill="${C.label_black}"/>` +
    sevenSegment(el, "cf-counter", [0, 14.5, 29, 43.5], 1166, 158, 12, 24, C.phosphor_amber) +
    label(el, 1160, 210, "COUNT", { fill: C.foreground, size: 11 }) +
    el("circle", { id: "cf-lamp-play", cx: 1214, cy: 232, r: 6, fill: C.phosphor_green }) +
    label(el, 1160, 236, "RUN", { fill: C.foreground, size: 11 }) +
    keys +
    vents(1146, 342, 9, 36)
  );
}

function controlsModule(el: ReturnType<typeof drawing>) {
  const toggles = TOGGLES.map((name, index) => {
    const x = 800 + index * 72;
    return (
      label(el, x, 456, name.toUpperCase(), { fill: C.foreground, size: 14, anchor: "middle" }) +
      `<circle cx="${x}" cy="476" r="7" fill="${C.label_black}"/>` +
      el("circle", { id: `cf-lamp-${name}`, cx: x, cy: 476, r: 5.5, fill: C.phosphor_green }) +
      `<rect x="${x - 17}" y="500" width="34" height="44" rx="3" fill="${C.label_black}" opacity=".7"/><circle cx="${x}" cy="522" r="12" fill="${C.case_beige}" stroke="${C.label_black}" stroke-width="2"/>` +
      el(
        "g",
        { id: `cf-toggle-${name}` },
        `<path d="M${x - 4} 522L${x - 3} 496H${x + 3}L${x + 4} 522Z" fill="${C.foreground}" stroke="${C.label_black}" stroke-width="1"/><rect x="${x - 6}" y="490" width="12" height="9" rx="2" fill="${C.foreground}" stroke="${C.label_black}" stroke-width="1"/>`,
      ) +
      `<circle cx="${x}" cy="522" r="4" fill="${C.panel_charcoal}"/>`
    );
  }).join("");
  const ticks = Array.from({ length: 7 }, (_, index) => {
    const angle = -90 + index * 30;
    return `<path d="M1112 476V483" stroke="${C.foreground}" stroke-width="2" transform="rotate(${angle} 1112 516)"/>`;
  }).join("");
  const grips = Array.from(
    { length: 16 },
    (_, index) =>
      `<path d="M1112 489V494" stroke="${C.label_black}" stroke-width="2" transform="rotate(${index * 22.5} 1112 516)"/>`,
  ).join("");
  return (
    caseBox(744, 416, 512, 164, 33) +
    `<rect x="760" y="432" width="480" height="132" rx="3" fill="${C.panel_charcoal}"/><path d="M760 432H1240" stroke="${C.foreground}" stroke-opacity=".2"/>` +
    toggles +
    label(el, 1112, 456, "GAIN", { fill: C.foreground, size: 14, anchor: "middle" }) +
    ticks +
    `<circle cx="1112" cy="516" r="29" fill="${C.label_black}"/>` +
    el(
      "g",
      { id: "cf-knob" },
      `<circle cx="1112" cy="516" r="27" fill="${C.panel_olive}"/>${grips}<circle cx="1112" cy="516" r="18" fill="${C.panel_charcoal}"/><path d="M1112 516V494" stroke="${C.foreground}" stroke-width="4"/>`,
    ) +
    label(el, 1192, 456, "MASTER", { fill: C.foreground, size: 12, anchor: "middle" }) +
    `<rect x="1146" y="468" width="88" height="50" rx="2" fill="${C.label_black}"/>` +
    el("rect", {
      id: "cf-caution-lamp",
      x: 1150,
      y: 472,
      width: 80,
      height: 42,
      rx: 2,
      fill: C.label_black,
      "data-role": "warning",
    }) +
    `<g transform="scale(.8 1)">` +
    el(
      "text",
      {
        id: "cf-caution-legend",
        x: fixed(1190 / 0.8),
        y: 500,
        "font-family": MONO,
        "font-size": 19,
        "font-weight": 700,
        "text-anchor": "middle",
        fill: C.foreground,
      },
      "CAUTION",
    ) +
    `</g>` +
    label(el, 1190, 540, "WARN ONLY", { fill: C.foreground, size: 10, anchor: "middle" })
  );
}

function headerAndBase(el: ReturnType<typeof drawing>) {
  const tags = ["NAV", "PWR", "SYS"]
    .map(
      (name, index) =>
        `<rect x="${830 + index * 84}" y="34" width="70" height="36" rx="3" fill="${C.label_black}"/>` +
        label(el, 865 + index * 84, 58, name, { fill: C.foreground, size: 16, anchor: "middle" }),
    )
    .join("");
  const keypad = ["NAV", "PWR", "SYS", "COM", "EXE", "CLR", "ACK", "LOG"]
    .map((name, index) => {
      const x = 44 + index * 58;
      return `<rect x="${x}" y="640" width="48" height="44" rx="3" fill="${C.label_black}"/><rect x="${x}" y="636" width="48" height="44" rx="3" fill="${index > 3 ? C.panel_olive : C.panel_charcoal}"/><path d="M${x + 3} 638H${x + 45}" stroke="${C.foreground}" stroke-width="1.5" opacity=".35"/><text x="${x + 24}" y="664" font-family="${MONO}" font-size="13" font-weight="700" fill="${C.foreground}" text-anchor="middle">${name}</text>`;
    })
    .join("");
  return (
    caseBox(24, 20, 1232, 64, 3) +
    `<rect x="44" y="32" width="372" height="40" rx="3" fill="${C.label_black}"/>` +
    label(el, 60, 59, "KV-7  MISSION CONSOLE", { fill: C.foreground, size: 20 }) +
    label(el, 440, 58, "FLIGHT DECK B  /  1979", { size: 14 }) +
    tags +
    stripes(1100, 38, 120) +
    caseBox(24, 596, 1232, 104, 9) +
    keypad +
    label(el, 528, 666, "MET", { size: 15 }) +
    `<rect x="574" y="626" width="196" height="54" rx="3" fill="${C.label_black}"/>` +
    sevenSegment(el, "cf-met", [0, 24, 62, 86, 124, 148], 588, 637, 18, 32, C.phosphor_green) +
    [640, 700]
      .map(
        (cx) =>
          `<rect x="${cx}" y="644" width="4" height="4" fill="${C.phosphor_green}"/><rect x="${cx}" y="658" width="4" height="4" fill="${C.phosphor_green}"/>`,
      )
      .join("") +
    stripes(810, 628, 260) +
    label(el, 810, 680, "LIFE SUPPORT  O2 LOOP A/B", { size: 13 }) +
    vents(1110, 628, 13, 52)
  );
}

export function cassetteFuturismPreviewSvg(time = CASSETTE_DURATION) {
  const el = drawing(cassetteFuturismPatch(cassetteFuturismState(time)));
  const { x, y, width, height } = SCREEN;
  const defs = `<defs><clipPath id="cf-screen-clip"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="22"/></clipPath><pattern id="cf-scan" width="8" height="3" patternUnits="userSpaceOnUse"><rect y="2" width="8" height="1" fill="${C.crt_black}" opacity=".55"/></pattern><radialGradient id="cf-vignette" cx="50%" cy="50%" r="62%"><stop offset=".62" stop-color="${C.crt_black}" stop-opacity="0"/><stop offset="1" stop-color="${C.crt_black}" stop-opacity=".78"/></radialGradient><filter id="cf-glow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" data-layout-allow-overflow="true">${defs}<rect width="1280" height="720" fill="${C.background}"/><path d="M0 92H1280M0 588H1280" stroke="${C.label_black}" stroke-width="2" opacity=".6"/>${headerAndBase(el)}${crtModule(el)}${tapeModule(el)}${controlsModule(el)}</svg>`;
}

// ---------------------------------------------------------------------------
// HyperFrames composition
// ---------------------------------------------------------------------------

export function cassetteFuturismPreviewHtml() {
  const patches = JSON.stringify(cassetteFuturismPatches()).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${C.background}}svg{display:block;width:1280px;height:720px}</style></head><body><div data-composition-id="${CASSETTE_COMPOSITION_ID}" data-width="1280" data-height="720" data-duration="${CASSETTE_DURATION}" data-fps="30" style="width:100%;height:100%">${cassetteFuturismPreviewSvg(0)}</div><script src="gsap.min.js"></script><script>
const STEPS=${patches};
const nodes={};
const node=(id)=>nodes[id]||(nodes[id]=document.getElementById(id));
function applyStep(step){const patch=STEPS[step];for(const id in patch){const target=node(id);const values=patch[id];for(const key in values){if(key==='#text')target.textContent=values[key];else target.setAttribute(key,values[key]);}}}
const clock={time:0};
function render(){applyStep(Math.max(0,Math.min(${CASSETTE_STEPS - 1},Math.floor(clock.time*${CASSETTE_STEP_RATE}+1e-6))));}
const tl=gsap.timeline({paused:true});
tl.to(clock,{time:${CASSETTE_DURATION},duration:${CASSETTE_DURATION},ease:'none',onUpdate:render},0);
render();
window.__timelines={'${CASSETTE_COMPOSITION_ID}':tl};
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

const designNotes =
  "Claude Opus 5.5 code-drawn Cassette Futurism console: beige cases with screws and embossed labels around charcoal/olive panels, a green-phosphor CRT with scanlines, glow, vignette and seeded noise, a tape transport with stepping reels and amber counter, toggles, a detented knob, square keys and a warning-only red master-caution lamp. The composition types a boot log, cuts through channel static to a NAV page and steps every action at 12fps from absolute time.";

export const cassetteWorkspace = () =>
  path.join(examplesFolder, "video-projects", CASSETTE_STYLE_ID);

export async function prepareCassetteFuturismPreview() {
  const catalog = await loadCatalog();
  const style = catalog.styles.find((entry) => entry.id === CASSETTE_STYLE_ID);
  if (!style) throw Error("Cassette Futurism must be in the catalog first");
  const svg = cassetteFuturismPreviewSvg();
  await validateExamplePalette(svg, style);
  const record = await publishExample(
    { styleId: style.id, svg, designNotes },
    {
      styleId: style.id,
      catalogHash: catalog.hash,
      thumbnail: "",
      status: "ready",
      provider: "claude",
      model: CASSETTE_AUTHOR_MODEL,
    },
  );
  await writeExampleRecords([
    ...(await readExampleRecords()).filter((entry) => entry.styleId !== style.id),
    record,
  ]);
  const workspace = cassetteWorkspace();
  await mkdir(workspace, { recursive: true });
  await copyFile(
    path.resolve("node_modules/gsap/dist/gsap.min.js"),
    path.join(workspace, "gsap.min.js"),
  );
  await writeFile(path.join(workspace, "index.html"), cassetteFuturismPreviewHtml());
  await writeFile(path.join(workspace, "STYLE.json"), JSON.stringify(style, null, 2));
  return { workspace, record, svgHash: createHash("sha256").update(svg).digest("hex") };
}

/** Renders through the existing HyperFrames pipeline and records the clip only after it succeeds. */
export async function renderCassetteFuturismPreview() {
  const [{ renderJob }, { verifyVisibleMotion }, motion, assets, { illustrationMotionRevision }] =
    await Promise.all([
      import("../src/server/rendering/render"),
      import("../src/server/motion/motion-visibility"),
      import("../src/server/catalog/style-motion"),
      import("../src/server/catalog/style-preview-assets"),
      import("../src/server/motion/illustration-motion"),
    ]);
  const catalog = await loadCatalog();
  const workspace = cassetteWorkspace();
  const signal = new AbortController().signal;
  const started = Date.now();
  const output = await renderJob(
    {
      id: CASSETTE_STYLE_ID,
      runId: "style-examples",
      candidateId: CASSETTE_STYLE_ID,
      kind: "preview",
      phase: "rendering",
      workspace,
      model: CASSETTE_AUTHOR_MODEL,
      duration: CASSETTE_DURATION,
    },
    {
      pipeline: "HyperFrames",
      fallbackReason: null,
      styleRenderer: ["SVG"],
      motionEngine: ["GSAP"],
      sourceFile: "index.html",
      duration: CASSETTE_DURATION,
      width: 1280,
      height: 720,
      audioDescription: "Silent",
      limitations: ["Illustrative code-drawn console study; not reference footage."],
    },
    signal,
    (type, message) => console.log(`${type}: ${message}`),
  );
  const rendered = path.join(workspace, output.video);
  const visibleChangeRatio = await verifyVisibleMotion(rendered, signal);
  const video = CASSETTE_STYLE_ID + path.extname(output.video);
  await copyFile(rendered, path.join(assets.stylePreviewVideoFolder, video));
  await assets.publishStylePreviewSource(workspace, CASSETTE_STYLE_ID);
  const svg = cassetteFuturismPreviewSvg();
  const records = (await motion.readStyleVideos()).filter((r) => r.styleId !== CASSETTE_STYLE_ID);
  await motion.writeStyleVideos([
    ...records,
    {
      styleId: CASSETTE_STYLE_ID,
      catalogHash: catalog.hash,
      sourceHash: createHash("sha256").update(svg).digest("hex"),
      video,
      duration: CASSETTE_DURATION,
      generatedAt: new Date().toISOString(),
      renderMs: Date.now() - started,
      reviewed: true,
      motionRevision: illustrationMotionRevision,
      visibleChangeRatio,
      model: CASSETTE_AUTHOR_MODEL,
    },
  ]);
  return { video, visibleChangeRatio };
}

/** Authored agent summary for this style only, keyed by the existing summary cache helper. */
export const cassetteFuturismSummary = {
  styleId: CASSETTE_STYLE_ID,
  name: "Cassette Futurism. An authored Motion Graphic in Digital and 3D Aesthetics: a 1970s–80s spaceship console branch of Retrofuturism (style-065) that uses CRT effects (style-066) only inside screens.",
  visualIdentity:
    "Explicit: modular dashboards of chunky charcoal and olive panels in beige plastic cases with screws, vents and embossed black or white labels, thin amber/orange/rust stripes, black CRTs in one green or amber phosphor, tape reels, toggles, knobs, square keys and lamps.",
  suitableUses:
    "Explicit: mission, telemetry, system-status and boot or log sequences told through console hardware. Inferred: retro tech explainers and product stories about machines. Not suited to cyberpunk, vaporwave, Y2K or neon briefs. Audience is unspecified.",
  limitations:
    "Avoid continuous strobing, smooth generic easing, pink or purple neon, glassmorphism, gradient blobs and round flat cards. Red is only for warnings. Keep scanlines, glow, noise and vignette inside the bezel. No external images or downloaded fonts; real footage is not implied.",
  palette:
    "Suggested scene-dependent tokens: console bay #1A1C18, beige label #ECE3CC, charcoal #2E302B, olive #4B5038, case #CFC2A2, label black #121311, CRT #060907, green #74FF9A or amber #FFB23E per screen, stripes #E2762B/#9A4526, warning red #D7322B. Gradients disabled except a screen vignette.",
  motionAndInteraction:
    "Explicit: state quantized to 12 steps per second from absolute time; typed text with a block cursor, snapping toggles and keys, detented knobs, stepping reels and counters, a brief boot flicker and about three steps of channel static, then readable holds. Optional references: typing, data build and a bezel-bound glitch cut.",
  audio:
    "Optional restrained hum, relay and key clicks, tape whir and one warning chime tied to visible actions, a sparse analog-synth bed, or silence. Do not tick for every character or sound alarms without a visible warning. The catalog preview is silent.",
  assetRequirements:
    "Duration, aspect ratio, resolution, frame rate, exact copy and readouts are unspecified unless supplied. Everything can be code-drawn; use system monospace fonts and verify fallback metrics. Export settings stay in delivery settings, not the 12fps cadence.",
  combinations:
    "Usually used alone. Skeuomorphism (style-075) can make controls operable; Pixel Art (style-057) can supply low-resolution maps or sprites on a CRT in its single phosphor. Keep the console hardware dominant and red warning-only.",
  productionApproach:
    "HTML/CSS and SVG draw hardware and readouts, Canvas 2D optionally adds seeded noise, GSAP drives one paused timeline through a pure time-state function, chroma-js checks contrast. Composition and export follow the project renderer, HyperFrames by default with Remotion only for a verified limitation.",
};

export async function cacheCassetteFuturismSummary() {
  const { summarizeStyle, styleSummarySource, styleSummaryCacheFolder } =
    await import("../src/server/catalog/style-summaries");
  const catalog = await loadCatalog();
  const scratch = await mkdtemp(path.join(os.tmpdir(), "cassette-summary-"));
  try {
    // The helper derives the source-keyed cache name; the authored summary is supplied directly.
    await summarizeStyle(
      styleSummarySource(catalog, CASSETTE_STYLE_ID),
      "claude",
      new AbortController().signal,
      scratch,
      async ({ schema }) => ({ value: schema.parse(cassetteFuturismSummary), sessionId: "" }),
    );
    const [name] = await readdir(path.join(scratch, "shared"));
    const entry = JSON.parse(await readFile(path.join(scratch, "shared", name), "utf8"));
    const target = path.join(styleSummaryCacheFolder, "shared", name);
    // Record the actual author rather than the helper's default summary model.
    await writeFile(
      target,
      JSON.stringify({ ...entry, model: CASSETTE_AUTHOR_MODEL, provider: "claude" }, null, 2),
    );
    return target;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  console.log(await prepareCassetteFuturismPreview());
  if (args.includes("--summary")) console.log(await cacheCassetteFuturismSummary());
  if (args.includes("--render")) console.log(await renderCassetteFuturismPreview());
}
