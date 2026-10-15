// Hand-drawn Collage — "an idea becomes a connected system".
// PixiJS owns the cut-paper pieces (shared seeded paper texture, contact shadows, explicit pivots).
// Rough.js generates the hand-inked SVG strokes (seeded). GSAP owns every animated value:
// a plain state proxy for Pixi pieces, and stroke/clip attributes for the SVG ink layer.
import { Application, Container, Graphics, Texture, BlurFilter } from 'pixi.js';
import rough from 'roughjs';

const W = 1280, H = 720;
const C = {
  stage: 0x415a64,   // scene-dependent slate matte board (not a style token)
  grid: 0xf6edd9,    // faint chalk grid lines in paper colour, very low alpha
  paper: 0xf6edd9,   // palette background token, used as the paper material
  ink: 0x3c4345,     // palette foreground token
  terracotta: 0xb97259, // accent_1
  sage: 0x819777,    // accent_2
  shadow: 0x1b2327,
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One shared paper-fibre texture (near white, multiplied by each piece's tint).
function makePaperTexture(out) {
  const size = 512, cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size), r = mulberry32(4511);
  for (let i = 0; i < size * size; i++) {
    const v = 236 + Math.floor(r() * 20);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v - 2; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI, l = 4 + r() * 14;
    g.strokeStyle = r() < 0.5 ? 'rgba(120,110,95,0.10)' : 'rgba(255,255,255,0.35)';
    g.lineWidth = 0.6 + r() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.4) * l * 0.5, y + Math.sin(a + 0.4) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  if (out) out.canvas = cv;
  return Texture.from(cv);
}

// Rectangle with cut (small jitter) or torn (deckled) edges, in local coordinates.
function tornRect(w, h, seed, torn = {}) {
  const r = mulberry32(seed), pts = [];
  const edge = (x0, y0, x1, y1, isTorn, nx, ny) => {
    const len = Math.hypot(x1 - x0, y1 - y0), step = isTorn ? 7 : 28, n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n, j = isTorn ? (r() - 0.35) * 5 : (r() - 0.5) * 1.6;
      pts.push(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j);
    }
  };
  edge(0, 0, w, 0, torn.top, 0, -1);
  edge(w, 0, w, h, torn.right, 1, 0);
  edge(w, h, 0, h, torn.bottom, 0, 1);
  edge(0, h, 0, 0, torn.left, -1, 0);
  return pts;
}

function samplePath(d, n, jitterSeed) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  const len = p.getTotalLength(), r = mulberry32(jitterSeed), pts = [];
  for (let i = 0; i < n; i++) {
    const q = p.getPointAtLength((i / n) * len);
    pts.push(q.x + (r() - 0.5) * 1.4, q.y + (r() - 0.5) * 1.4);
  }
  return pts;
}

const blur = new BlurFilter({ strength: 5, quality: 3 });

// A paper piece: container positioned at its pivot; children = contact shadow, paper, tape.
function makePiece(stage, tex, { pts, color, pivot, at, rot = 0, tape }) {
  const c = new Container();
  c.pivot.set(pivot[0], pivot[1]);
  c.position.set(at[0], at[1]);
  const shadow = new Graphics().poly(pts).fill({ color: C.shadow, alpha: 1 });
  shadow.filters = [blur];
  const paperWrap = new Container();
  paperWrap.pivot.set(pivot[0], pivot[1]);
  paperWrap.position.set(pivot[0], pivot[1]);
  const paper = new Graphics().poly(pts).fill({ texture: tex, color });
  paperWrap.addChild(paper);
  if (tape) {
    const t = new Graphics()
      .poly(tornRect(tape.w, tape.h, tape.seed, { left: true, right: true }))
      .fill({ texture: tex, color: tape.color, alpha: tape.alpha });
    t.pivot.set(tape.w / 2, tape.h / 2);
    t.position.set(tape.x, tape.y);
    t.rotation = (tape.rot * Math.PI) / 180;
    paperWrap.addChild(t);
  }
  c.addChild(shadow, paperWrap);
  stage.addChild(c);
  return { c, shadow, paperWrap, at, rot };
}

// Pose = authored rest pose + GSAP-owned offsets. lift raises the paper off the board.
function pose(p, s) {
  p.c.position.set(p.at[0] + (s.dx || 0), p.at[1] + (s.dy || 0));
  p.c.rotation = ((p.rot + (s.rot || 0)) * Math.PI) / 180;
  p.c.alpha = s.a;
  const k = s.s === undefined ? 1 : s.s, lift = s.lift || 0;
  p.paperWrap.scale.set(k * (1 + 0.05 * lift), k * (1 + 0.05 * lift) * (s.sy === undefined ? 1 : s.sy));
  p.shadow.scale.set(k, k * (s.sy === undefined ? 1 : s.sy));
  p.shadow.position.set(3 + 13 * lift, 5 + 17 * lift);
  p.shadow.alpha = 0.34 - 0.14 * lift;
}

function inkLayer(svg, starPts) {
  const NS = 'http://www.w3.org/2000/svg';
  const rc = rough.svg(svg);
  const layer = svg.querySelector('#ink-strokes');
  const defs = svg.querySelector('defs');
  const draw = (id, d, opts, transform) => {
    const g = rc.path(d, { roughness: 1.1, bowing: 0.8, strokeWidth: 3, ...opts });
    g.setAttribute('id', id);
    g.setAttribute('fill', 'none');
    if (transform) g.setAttribute('transform', transform);
    layer.appendChild(g);
    return Array.from(g.querySelectorAll('path'));
  };
  // Dashed chalk connectors: a rough dashed stroke revealed by a solid mask path drawn on.
  const connector = (id, d, seed) => {
    const mask = document.createElementNS(NS, 'mask');
    mask.setAttribute('id', 'mask-' + id);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('x', '0'); mask.setAttribute('y', '0'); mask.setAttribute('width', String(W)); mask.setAttribute('height', String(H));
    const mp = document.createElementNS(NS, 'path');
    mp.setAttribute('d', d); mp.setAttribute('fill', 'none'); mp.setAttribute('stroke', '#FFFFFF');
    mp.setAttribute('stroke-width', '16'); mp.setAttribute('stroke-linecap', 'round');
    mask.appendChild(mp); defs.appendChild(mask);
    const g = rc.path(d, { seed, roughness: 0.9, bowing: 1.2, stroke: '#F6EDD9', strokeWidth: 3, disableMultiStroke: true });
    g.setAttribute('id', id); g.setAttribute('fill', 'none');
    g.setAttribute('mask', 'url(#mask-' + id + ')');
    g.querySelectorAll('path').forEach((p) => { p.setAttribute('stroke-dasharray', '11 8'); p.setAttribute('stroke-linecap', 'round'); });
    layer.appendChild(g);
    return mp;
  };
  let starD = '';
  for (let i = 0; i < starPts.length; i += 2) starD += (i ? ' L' : 'M') + starPts[i].toFixed(1) + ' ' + starPts[i + 1].toFixed(1);
  starD += ' Z';
  return {
    underline: draw('ink-underline', 'M72 146 q180 -14 390 2', { seed: 11, stroke: '#B97259', strokeWidth: 5, disableMultiStroke: true }),
    bulbInk: draw('ink-bulb', 'M186 236 c-64 4 -100 58 -84 112 12 40 44 56 48 92', { seed: 12, stroke: '#3C4345', strokeWidth: 4 }),
    filament: draw('ink-filament', 'M160 380 q14 -50 24 0 q12 -50 26 0', { seed: 13, stroke: '#F6EDD9', strokeWidth: 4, roughness: 0.8 }),
    star: draw('ink-star', starD, { seed: 14, stroke: '#F6EDD9', strokeWidth: 3, roughness: 0.7 }),
    conns: [
      connector('conn-1', 'M300 300 q120 -80 250 -60', 15),
      connector('conn-2', 'M300 380 q200 30 330 110', 16),
      connector('conn-3', 'M722 272 q120 20 168 118', 17),
      connector('conn-4', 'M802 522 q140 0 166 -50', 18),
    ],
  };
}

export async function boot() {
  const root = document.getElementById('pixi-stage');
  const app = new Application();
  await app.init({
    width: W, height: H, background: C.stage, antialias: true, autoStart: false, sharedTicker: false,
    preference: 'webgl', preserveDrawingBuffer: true, resolution: 1, autoDensity: false,
  });
  app.ticker.stop();
  root.appendChild(app.canvas);
  const grainOut = {};
  const tex = makePaperTexture(grainOut);
  // Share the same paper-fibre texture with the SVG letter chips.
  document.getElementById('grain-img').setAttribute('href', grainOut.canvas.toDataURL('image/png'));
  const stage = app.stage;

  // Stationary board: matte slate with shared grain and a faint planning grid.
  const board = new Graphics().rect(0, 0, W, H).fill({ texture: tex, color: C.stage });
  stage.addChild(board);
  const grid = new Graphics();
  for (let x = 40; x < W; x += 40) grid.moveTo(x, 0).lineTo(x, H);
  for (let y = 40; y < H; y += 40) grid.moveTo(0, y).lineTo(W, y);
  grid.stroke({ color: C.grid, width: 1, alpha: 0.06 });
  stage.addChild(grid);

  const sageTape = { w: 66, h: 22, color: C.sage, alpha: 0.78 };
  const paperTape = { w: 66, h: 22, color: C.paper, alpha: 0.82 };

  const P = {};
  P.bulb = makePiece(stage, tex, { pts: samplePath('M180 230c-70 0-110 60-90 120 14 40 46 54 50 96h90c4-42 36-56 50-96 20-60-30-120-100-120z', 140, 22), color: C.terracotta, pivot: [185, 228], at: [185, 228], tape: { ...paperTape, x: 185, y: 226, rot: -12, seed: 32 } });
  P.base1 = makePiece(stage, tex, { pts: tornRect(80, 12, 23, {}), color: C.ink, pivot: [0, 6], at: [148, 470] });
  P.base2 = makePiece(stage, tex, { pts: tornRect(68, 12, 24, {}), color: C.ink, pivot: [0, 6], at: [154, 492] });
  const card = (key, x, y, color, rot, seed, slipRot) => {
    const pts = [4, 2, 152, 8, 148, 120, -2, 116].map((v, i) => v + (mulberry32(seed + i)() - 0.5) * 1.5);
    P[key] = makePiece(stage, tex, { pts, color, pivot: [76, 6], at: [x + 76, y + 6], rot, tape: { ...paperTape, x: 76, y: 4, rot: rot * -1.5 + 2, seed: seed + 9 } });
    // Cream label slip glued onto the card, hinged at its top edge.
    const slip = new Container();
    slip.pivot.set(57, 0); slip.position.set(76, 40);
    slip.rotation = (slipRot * Math.PI) / 180;
    const sp = tornRect(114, 50, seed + 5, { bottom: true });
    const sShadow = new Graphics().poly(sp).fill({ color: C.shadow, alpha: 0.3 });
    sShadow.position.set(1.5, 2.5);
    const sPaper = new Graphics().poly(sp).fill({ texture: tex, color: C.paper });
    slip.addChild(sShadow, sPaper);
    P[key].paperWrap.addChild(slip);
    P[key].slip = slip;
  };
  card('people', 560, 190, C.sage, 0, 41, -2);
  card('flow', 900, 350, C.terracotta, 0, 51, 2);
  card('tools', 640, 470, C.sage, 0, 61, -1);
  // Cut-paper star: terracotta, pivot at its centre so it can be spun into place.
  const starPts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 22 : 50;
    starPts.push(1060 + Math.cos(a) * rr, 216 + Math.sin(a) * rr);
  }
  P.star = makePiece(stage, tex, { pts: starPts, color: C.terracotta, pivot: [1060, 216], at: [1060, 216] });
  P.caption = makePiece(stage, tex, { pts: tornRect(560, 84, 71, { top: true, left: true }), color: C.paper, pivot: [28, 8], at: [708, 604], rot: 1.5, tape: { ...sageTape, x: 28, y: 6, rot: 14, seed: 72 } });

  const svg = document.getElementById('ink');
  const ink = inkLayer(svg, starPts);

  // GSAP-owned state. Initial values = before-placement poses.
  const S = {
    bulb: { dy: -18, rot: -30, lift: 1, a: 0 },
    base1: { dx: -40, rot: -14, lift: 1, a: 0 },
    base2: { dx: -40, rot: 12, lift: 1, a: 0 },
    people: { dy: -54, rot: -11, lift: 1, a: 0 },
    flow: { dy: -54, rot: 10, lift: 1, a: 0 },
    tools: { dy: -54, rot: -8, lift: 1, a: 0 },
    slips: { people: 0.02, flow: 0.02, tools: 0.02 },
    star: { rot: -150, s: 0.3, lift: 1, a: 0 },
    caption: { dx: 40, dy: 36, rot: 6, lift: 1, a: 0 },
  };
  const render = () => {
    for (const k of ['bulb', 'base1', 'base2', 'people', 'flow', 'tools', 'star', 'caption']) pose(P[k], S[k]);
    for (const k of ['people', 'flow', 'tools']) {
      const sy = S.slips[k];
      P[k].slip.scale.set(1, sy);
      P[k].slip.alpha = sy < 0.05 ? 0 : 1;
    }
    app.renderer.render(stage);
  };

  const gsap = window.gsap;
  const tl = gsap.timeline({ paused: true, onUpdate: render });
  const place = (target, at, dur = 0.5, ease = 'back.out(1.4)') => {
    tl.to(target, { a: 1, duration: 0.12, ease: 'none' }, at);
    const rest = { duration: dur, ease };
    for (const k of ['dx', 'dy', 'rot']) if (k in target) rest[k] = 0;
    if ('s' in target) rest.s = 1;
    tl.to(target, rest, at);
    tl.to(target, { lift: 0, duration: dur * 0.9, ease: 'power2.in' }, at + dur * 0.1);
  };
  const drawPaths = (paths, at, dur, ease = 'power1.inOut') => {
    for (const p of paths) {
      const L = Math.ceil(p.getTotalLength()) + 2;
      gsap.set(p, { attr: { 'stroke-dasharray': L, 'stroke-dashoffset': L } });
      tl.to(p, { attr: { 'stroke-dashoffset': 0 }, duration: dur, ease }, at);
    }
  };
  const wipe = (id, width, at, dur) => {
    const r = document.getElementById(id);
    gsap.set(r, { attr: { width: 0 } });
    tl.to(r, { attr: { width }, duration: dur, ease: 'power1.inOut' }, at);
  };

  // Beat 1 (0–1.2s): the idea — title note placed, written, underlined; bulb hinges down on its tape.
  // Ransom-note title: each letter is its own paper chip (own typeface, colour, rotation). It drops
  // from a larger scale with a wide offset shadow that tightens as it lands, staggered in reading order.
  const chips = Array.from(document.querySelectorAll('#title-chips .chip'));
  chips.forEach((chip, i) => {
    const cx = Number(chip.dataset.cx), cy = Number(chip.dataset.cy);
    const r = mulberry32(900 + i);
    const from = { x: (r() - 0.5) * 70, y: -40 - r() * 30, rotation: (r() < 0.5 ? -1 : 1) * (12 + r() * 14), scale: 1.65, opacity: 0 };
    const at = 0.05 + i * 0.07;
    gsap.set(chip, { ...from, svgOrigin: cx + ' ' + cy });
    tl.to(chip, { opacity: 1, duration: 0.06, ease: 'none' }, at);
    tl.to(chip, { x: 0, y: 0, rotation: 0, scale: 1, duration: 0.36, ease: 'back.out(1.3)' }, at);
    const sh = chip.querySelector('.chip-shadow');
    gsap.set(sh, { x: 20, y: 26, opacity: 0.18 });
    tl.to(sh, { x: 3, y: 5, opacity: 0.32, duration: 0.34, ease: 'power2.in' }, at + 0.02);
  });
  drawPaths(ink.underline, 0.82, 0.3);
  tl.to(S.bulb, { a: 1, duration: 0.1, ease: 'none' }, 0.22);
  tl.to(S.bulb, { dy: 0, duration: 0.3, ease: 'power2.out' }, 0.22);
  tl.to(S.bulb, { keyframes: [{ rot: 11, duration: 0.3, ease: 'power2.in' }, { rot: -5, duration: 0.2, ease: 'sine.inOut' }, { rot: 0, duration: 0.18, ease: 'sine.out' }] }, 0.22);
  tl.to(S.bulb, { lift: 0, duration: 0.6, ease: 'power2.in' }, 0.3);
  place(S.base1, 0.62, 0.3, 'power3.out');
  place(S.base2, 0.7, 0.3, 'power3.out');
  drawPaths(ink.bulbInk, 0.92, 0.32);
  drawPaths(ink.filament, 1.02, 0.25);
  // Beat 2 (1.0–1.95s): cards are placed in reading order, then their label slips fold down and are written.
  place(S.people, 1.0, 0.42);
  place(S.flow, 1.14, 0.42);
  place(S.tools, 1.28, 0.42);
  const flap = (k, at) => {
    tl.to(S.slips, { [k]: 1, duration: 0.26, ease: 'back.out(1.6)' }, at);
    wipe('clip-' + k + '-r', 130, at + 0.26, 0.2);
  };
  flap('people', 1.4); flap('flow', 1.54); flap('tools', 1.68);
  // Beat 3 (1.55–2.6s): ink connections are drawn, the star is stuck on, the caption strip closes.
  drawPaths([ink.conns[0]], 1.55, 0.32); drawPaths([ink.conns[1]], 1.62, 0.34);
  drawPaths([ink.conns[2]], 1.86, 0.3); drawPaths([ink.conns[3]], 1.92, 0.3);
  place(S.star, 2.0, 0.42, 'back.out(1.2)');
  drawPaths(ink.star, 2.28, 0.28);
  place(S.caption, 2.0, 0.4, 'power3.out');
  wipe('clip-caption-r', 560, 2.3, 0.32);
  tl.to({}, { duration: 0.001 }, 2.999);

  tl.progress(1).progress(0);
  render();
  const onSeek = (e) => {
    const t = e && e.detail && typeof e.detail.time === 'number' ? e.detail.time : null;
    if (t !== null && Math.abs(tl.time() - t) > 1e-6) tl.seek(t, false);
    render();
  };
  window.addEventListener('hf-seek', onSeek);
  return tl;
}
