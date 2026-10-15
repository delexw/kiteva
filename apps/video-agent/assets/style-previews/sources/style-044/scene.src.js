// Vintage Photo Collage — style-044 preview scene.
// Style renderer: PixiJS (WebGL) compositing procedurally generated Canvas 2D paper cutouts.
// Motion owner: one paused GSAP timeline (window.__timelines.video) that owns every animated
// state value. Pixi only maps that state to sprites and redraws from it; no ticker, no clock.
import { Application, Container, Sprite, Texture, Graphics } from 'pixi.js';

const gsap = window.gsap;
const chroma = window.chroma;
const W = 1280, H = 720, DURATION = 3, RES = 2, INV = 1 / RES;

// ---- Resolved scene palette -------------------------------------------------------------
// Paper / ink / tape-tone are the style's material roles (example tokens, kept as the medium).
// The board is a new, scene-dependent presentation element: a cool slate archival mounting
// board replacing the previous all-cream canvas, so paper cutouts read as physical objects.
const C = {
  board: chroma('#2E3433').hex(),
  paper: chroma('#EDE3CD').hex(),
  ink: chroma('#393329').hex(),
  tone: chroma('#85765D').hex(),
};
for (const k in C) if (!chroma.valid(C[k])) throw Error('invalid palette ' + k);
// Text is only ever ink-on-paper (9.8:1). Board carries no copy.
if (chroma.contrast(C.ink, C.paper) < 4.5) throw Error('ink/paper contrast');
const SERIF = '"Times New Roman", Times, Georgia, serif';

// ---- Deterministic helpers ----------------------------------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * RES); c.height = Math.ceil(h * RES);
  const ctx = c.getContext('2d');
  ctx.scale(RES, RES);
  return { c, ctx };
}
const rgb = (hex) => chroma(hex).rgb();

// Torn / deckled outline: points around a rectangle with jitter on chosen sides.
function outline(w, h, seed, torn) {
  const r = rng(seed), pts = [];
  const side = (x0, y0, x1, y1, amp, step) => {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / step));
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    for (let i = 0; i < n; i++) {
      const u = i / n, j = i === 0 ? 0 : (r() - 0.5) * 2 * amp;
      pts.push([x0 + (x1 - x0) * u + nx * j, y0 + (y1 - y0) * u + ny * j]);
    }
  };
  const a = (s) => (torn[s] || 0.4);
  side(0, 0, w, 0, a('t'), torn.t ? 9 : 40);
  side(w, 0, w, h, a('r'), torn.r ? 9 : 40);
  side(w, h, 0, h, a('b'), torn.b ? 9 : 40);
  side(0, h, 0, 0, a('l'), torn.l ? 9 : 40);
  return pts;
}
function tracePath(ctx, pts, ox, oy) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y + oy) : ctx.moveTo(x + ox, y + oy)));
  ctx.closePath();
}

// Paper sheet with fibre grain, edge foxing and a torn-fibre halo; returns canvas + draw ctx.
function paperSheet(w, h, seed, torn, pad = 6) {
  const pts = outline(w, h, seed, torn);
  const { c, ctx } = canvas(w + pad * 2, h + pad * 2);
  // torn fibre halo (lighter core of the sheet showing at the rip)
  tracePath(ctx, pts, pad, pad);
  ctx.fillStyle = C.paper; ctx.fill();
  ctx.save(); tracePath(ctx, pts, pad, pad); ctx.clip();
  // foxing / age toning at the edges using the tone colour at low alpha
  const g = ctx.createRadialGradient(pad + w / 2, pad + h / 2, Math.min(w, h) * 0.25, pad + w / 2, pad + h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(133,118,93,0)'); g.addColorStop(1, 'rgba(133,118,93,0.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w + pad * 2, h + pad * 2);
  const r = rng(seed * 7 + 3);
  ctx.strokeStyle = 'rgba(133,118,93,0.10)'; ctx.lineWidth = 0.5;
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = pad + r() * w, y = pad + r() * h, a = r() * Math.PI, l = 3 + r() * 9;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  ctx.restore();
  // ink-dark rim at cut / torn edges
  tracePath(ctx, pts, pad, pad);
  ctx.strokeStyle = 'rgba(57,51,41,0.55)'; ctx.lineWidth = 1; ctx.stroke();
  return { c, ctx, pts, pad };
}

// Per-pixel print grain over the finished sheet (seeded, alpha-preserving).
function grain(c, seed, amt = 10) {
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Luminance-based halftone: rotated 45° screen, dot area ∝ darkness(u,v) in [0,1].
function halftone(ctx, x, y, w, h, darkness, opt = {}) {
  const s = opt.spacing || 4.6, ang = (opt.angle ?? 45) * Math.PI / 180, ink = opt.ink || C.ink;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = ink;
  const cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2 + s;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let gy = -R; gy <= R; gy += s) for (let gx = -R; gx <= R; gx += s) {
    const px = cx + gx * ca - gy * sa, py = cy + gx * sa + gy * ca;
    if (px < x - s || px > x + w + s || py < y - s || py > y + h + s) continue;
    const dk = Math.max(0, Math.min(1, darkness((px - x) / w, (py - y) / h)));
    const rad = Math.sqrt(dk) * s * 0.62;
    if (rad < 0.25) continue;
    ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Soft drop-shadow texture from an outline.
function shadowTex(w, h, pts, pad) {
  const P = pad + 16;
  const { c, ctx } = canvas(w + P * 2, h + P * 2);
  ctx.filter = 'blur(7px)';
  tracePath(ctx, pts, P, P); ctx.fillStyle = 'rgba(8,10,10,0.9)'; ctx.fill();
  return tex(c);
}
function tex(c) {
  // textures keep their native 2x pixels; sprites are scaled by 1/RES (see INV)
  return Texture.from(c);
}

// ---- Asset construction (preloaded once, cached) -------------------------------------------
function buildBoard() {
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = C.board; ctx.fillRect(0, 0, W, H);
  const r = rng(11);
  // felt-like mounting board fibres, stationary
  for (let i = 0; i < 2600; i++) {
    const x = r() * W, y = r() * H, a = r() * Math.PI, l = 2 + r() * 7;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(237,227,205,0.035)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 820);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  grain(c, 12, 9);
  return tex(c);
}

function buildMasthead() {
  const w = 1140, h = 74;
  const s = paperSheet(w, h, 21, { t: 2.4, b: 2.6 });
  const { ctx, pad } = s;
  ctx.fillStyle = C.ink; ctx.font = `30px ${SERIF}`; ctx.textBaseline = 'alphabetic';
  const txt = 'THE DAILY NOTION · No. 44', sp = 8;
  let total = 0; for (const ch of txt) total += ctx.measureText(ch).width + sp; total -= sp;
  let x = pad + (w - total) / 2;
  for (const ch of txt) { ctx.fillText(ch, x, pad + 44); x += ctx.measureText(ch).width + sp; }
  ctx.fillRect(pad + 30, pad + 56, w - 60, 2.4);
  ctx.fillRect(pad + 30, pad + 61, w - 60, 0.9);
  ctx.fillRect(pad + 30, pad + 12, w - 60, 0.9);
  grain(s.c, 22, 12);
  return { tex: tex(s.c), shadow: shadowTex(w, h, s.pts, pad), w, h, pad };
}

function buildBulbClipping() {
  const w = 340, h = 330;
  const s = paperSheet(w, h, 31, { b: 7, r: 1.4 });
  const { ctx, pad } = s;
  const px = pad + 20, py = pad + 20, pw = 300, ph = 246;
  // procedural period photograph: lit bulb on a dark studio backdrop
  const dark = (u, v) => {
    const x = u * pw, y = v * ph, bx = 150, by = 104;
    const dist = Math.hypot(x - bx, y - by);
    let d = 0.62 + 0.25 * sstep(90, 210, Math.hypot(x - bx, y - by * 0.9)); // vignette
    d -= 0.5 * (1 - sstep(40, 120, dist)); // glow
    if (dist < 58) d = 0.04 + 0.1 * (dist / 58) ** 3; // glass
    if (Math.abs(x - bx) < 24 && y > 158 && y < 200) d = 0.82 + 0.15 * (Math.floor((y - 158) / 7) % 2); // screw base
    if (Math.abs(x - bx) < 12 && y >= 200 && y < 212) d = 0.95;
    return d;
  };
  ctx.fillStyle = 'rgba(133,118,93,0.18)'; ctx.fillRect(px, py, pw, ph);
  halftone(ctx, px, py, pw, ph, dark, { spacing: 4.4 });
  // filament + glass rim in ink
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3.2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(px + 150, py + 104, 58, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px + 132, py + 116);
  ctx.lineTo(px + 140, py + 92); ctx.lineTo(px + 150, py + 112); ctx.lineTo(px + 160, py + 92); ctx.lineTo(px + 168, py + 116); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.strokeRect(px, py, pw, ph);
  // caption strip printed under the photo
  ctx.fillStyle = C.ink; ctx.font = `italic 15px ${SERIF}`;
  ctx.fillText('Fig. 1 — the first spark', px + 2, py + ph + 24);
  grain(s.c, 32, 12);
  return { tex: tex(s.c), shadow: shadowTex(w, h, s.pts, pad), w, h, pad };
}

function buildNewspaper() {
  const w = 420, h = 440;
  const s = paperSheet(w, h, 41, { r: 1.2, b: 1.0 });
  const { ctx, pad } = s;
  const L = pad + 25;
  ctx.fillStyle = C.ink;
  const fit = (str, font, size, maxW) => { let f = size; do { ctx.font = font.replace('#', f); f -= 1; } while (ctx.measureText(str).width > maxW && f > 12); };
  fit('AN IDEA BECOMES', `bold #px ${SERIF}`, 40, w - 50);
  ctx.fillText('AN IDEA BECOMES', L, pad + 62);
  fit('a connected system', `italic #px ${SERIF}`, 34, w - 50);
  ctx.fillText('a connected system', L, pad + 106);
  ctx.fillRect(L, pad + 124, w - 50, 2);
  // two columns of set type (rendered as uneven greyed lines — illegible body copy by design)
  const r = rng(43);
  for (let col = 0; col < 2; col++) {
    const cx = L + col * 96;
    for (let y = pad + 146; y < pad + 412; y += 11) {
      const end = r() < 0.12 ? 40 + r() * 30 : 84 - r() * 5;
      ctx.fillStyle = 'rgba(133,118,93,0.95)'; ctx.fillRect(cx, y, end, 3.6);
    }
  }
  // inset photograph: nodes on a mid-grey ground
  const px = L + 198, py = pad + 146, pw = 172, ph = 266;
  const nodes = [[0.3, 0.2], [0.72, 0.3], [0.45, 0.55], [0.2, 0.78], [0.78, 0.8]];
  const links = [[0, 1], [0, 2], [1, 2], [2, 3], [2, 4], [1, 4]];
  const segD = (x, y, a, b) => {
    const ax = a[0] * pw, ay = a[1] * ph, bx = b[0] * pw, by = b[1] * ph;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
  };
  const dark = (u, v) => {
    const x = u * pw, y = v * ph;
    let d = 0.5 + 0.18 * v;
    for (const [a, b] of links) if (segD(x, y, nodes[a], nodes[b]) < 3) d = 0.12;
    for (const n of nodes) { const dd = Math.hypot(x - n[0] * pw, y - n[1] * ph); if (dd < 15) d = dd < 11 ? 0.02 : 0.9; }
    return d;
  };
  ctx.fillStyle = 'rgba(133,118,93,0.15)'; ctx.fillRect(px, py, pw, ph);
  halftone(ctx, px, py, pw, ph, dark, { spacing: 4.2, angle: 30 });
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(px, py, pw, ph);
  grain(s.c, 44, 12);
  return { tex: tex(s.c), shadow: shadowTex(w, h, s.pts, pad), w, h, pad };
}

function buildPrint(seed, w, h, darkFn) {
  const s = paperSheet(w, h, seed, { l: 0.8, t: 0.8, r: 0.8, b: 0.8 });
  const { ctx, pad } = s;
  const px = pad + 13, py = pad + 13, pw = w - 26, ph = h - 26;
  ctx.fillStyle = 'rgba(133,118,93,0.2)'; ctx.fillRect(px, py, pw, ph);
  halftone(ctx, px, py, pw, ph, (u, v) => darkFn(u, v, pw, ph), { spacing: 3.8, angle: 15 });
  ctx.strokeStyle = 'rgba(57,51,41,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(px, py, pw, ph);
  grain(s.c, seed + 1, 14);
  return { tex: tex(s.c), shadow: shadowTex(w, h, s.pts, pad), w, h, pad };
}
// gear silhouette against a pale sky
const gearDark = (u, v, pw, ph) => {
  const x = u * pw - pw * 0.5, y = v * ph - ph * 0.55, rr = Math.hypot(x, y), a = Math.atan2(y, x);
  const tooth = 30 + 6 * (Math.cos(a * 8) > 0.2 ? 1 : 0);
  let d = 0.12 + 0.25 * v;
  if (rr < tooth) d = 0.88;
  if (rr < 9) d = 0.15;
  return d;
};
// arch bridge silhouette over bright water
const bridgeDark = (u, v, pw, ph) => {
  const x = u * pw, y = v * ph;
  let d = 0.18 + 0.3 * (1 - v);
  const deck = ph * 0.48, archTop = deck + 4, archH = ph * 0.32;
  if (y > deck - 5 && y < deck + 3) d = 0.92;
  const ax = ((x / pw) * 2) % 1; const archY = archTop + archH * (1 - Math.sin(Math.PI * ax));
  if (y > deck && y < ph * 0.82 && y > archY && Math.abs(ax - 0.5) > 0.06) d = 0.15 + 0.05 * Math.sin(y);
  if (y > deck && y < archY) d = 0.8;
  if (y > ph * 0.82) d = 0.3 + 0.2 * ((Math.floor(y / 3) % 2));
  return d;
};

function buildTape(w, h, seed) {
  const { c, ctx } = canvas(w + 4, h + 4);
  const r = rng(seed), pts = [];
  pts.push([2, 2]); for (let i = 0; i <= 6; i++) pts.push([w + 2 + (r() - 0.5) * 4, 2 + (h * i) / 6]);
  pts.push([2, h + 2]); for (let i = 6; i >= 0; i--) pts.push([2 + (r() - 0.5) * 4, 2 + (h * i) / 6]);
  tracePath(ctx, pts, 0, 0);
  ctx.fillStyle = 'rgba(133,118,93,0.62)'; ctx.fill();
  ctx.strokeStyle = 'rgba(237,227,205,0.18)'; ctx.lineWidth = 0.6;
  for (let i = 0; i < 18; i++) { const x = 2 + r() * w; ctx.beginPath(); ctx.moveTo(x, 3); ctx.lineTo(x + 2, h + 1); ctx.stroke(); }
  return tex(c);
}

// ---- Layout (final rest poses match ILLUSTRATION composition) ------------------------------
const DEG = Math.PI / 180;
const CARDS = [
  { id: 'masthead', x: 640, y: 58, rot: -0.5, depth: 0.25, build: buildMasthead },
  { id: 'bulb', x: 270, y: 300, rot: -5, depth: 0.6, build: buildBulbClipping,
    tapes: [{ x: -8, y: -168, w: 92, h: 26, rot: 3 }], pins: [{ id: 'p-bulb', x: 32, y: -86 }] },
  { id: 'paper', x: 912, y: 372, rot: 3, depth: 0.8, build: buildNewspaper,
    tapes: [{ x: 196, y: -214, w: 96, h: 26, rot: 32 }, { x: -200, y: 212, w: 70, h: 22, rot: 38 }],
    pins: [{ id: 'p-col', x: -150, y: 40 }, { id: 'p-photo', x: 112, y: -30 }] },
  { id: 'photoA', x: 245, y: 584, rot: 6, depth: 1.0, build: () => buildPrint(51, 150, 120, gearDark),
    pins: [{ id: 'p-a', x: 0, y: -42 }] },
  { id: 'photoB', x: 497, y: 540, rot: -4, depth: 1.0, build: () => buildPrint(61, 150, 130, bridgeDark),
    pins: [{ id: 'p-b', x: 0, y: -48 }] },
];
// Thread segments in drawing order (pin → pin); each starts only after its start pin exists.
const THREADS = [
  { a: 'p-bulb', b: 'p-b', start: 1.5, dur: 0.38 },
  { a: 'p-b', b: 'p-a', start: 1.82, dur: 0.24 },
  { a: 'p-b', b: 'p-col', start: 1.9, dur: 0.34 },
  { a: 'p-col', b: 'p-photo', start: 2.16, dur: 0.24 },
];

// ---- Timeline-owned state (GSAP is the only writer) ----------------------------------------
const S = { cam: { x: 22, y: 8 } };
for (const c of CARDS) {
  S[c.id] = { dx: 0, dy: 0, dr: 0, lift: 1, alpha: 0, tape: 0 };
  for (const p of c.pins || []) S[p.id] = { s: 0 };
}
for (const t of THREADS) S[t.a + '>' + t.b] = { p: 0 };

// The paused timeline is created and registered inline in index.html (window.__timelines.video);
// this module builds every tween onto that same instance synchronously at script load.
const tl = (window.__timelines && window.__timelines.video) || gsap.timeline({ paused: true });
function place(id, from, at, travel, settle) {
  const st = S[id];
  Object.assign(st, from, { lift: 1, alpha: 0 });
  tl.to(st, { alpha: 1, duration: 0.12, ease: 'none' }, at);
  tl.to(st, { dx: 0, dy: 0, dr: 0, duration: travel, ease: 'power3.out' }, at);
  // press-down: card loses its lift (shadow tightens) just as travel completes
  tl.to(st, { lift: 0, duration: settle, ease: 'power2.in' }, at + travel - settle * 0.6);
}
place('masthead', { dx: 0, dy: -120, dr: -2 }, 0.0, 0.5, 0.16);
place('bulb', { dx: -330, dy: -150, dr: -14 }, 0.12, 0.62, 0.2);
place('paper', { dx: 380, dy: -80, dr: 12 }, 0.34, 0.64, 0.2);
place('photoA', { dx: -160, dy: 230, dr: 16 }, 0.6, 0.5, 0.18);
place('photoB', { dx: 60, dy: 260, dr: -14 }, 0.7, 0.5, 0.18);
tl.to(S.bulb, { tape: 1, duration: 0.2, ease: 'power2.out' }, 0.86);
tl.to(S.paper, { tape: 1, duration: 0.2, ease: 'power2.out' }, 1.08);
[['p-bulb', 1.32], ['p-b', 1.4], ['p-a', 1.66], ['p-col', 1.74], ['p-photo', 2.02]].forEach(([id, t]) =>
  tl.to(S[id], { s: 1, duration: 0.22, ease: 'back.out(1.2)' }, t));
for (const t of THREADS) tl.to(S[t.a + '>' + t.b], { p: 1, duration: t.dur, ease: 'sine.inOut' }, t.start);
// limited parallax: virtual camera drift settles to rest; board stays fixed
tl.to(S.cam, { x: 0, y: 0, duration: 2.4, ease: 'power2.inOut' }, 0);
// redraw hook: a setter-driven clock property fires on every seek (even with suppressed events)
let ready = false, queued = false;
const clock = {
  _t: 0,
  get t() { return this._t; },
  set t(v) { this._t = v; requestDraw(); },
};
tl.to(clock, { t: DURATION, duration: DURATION, ease: 'none' }, 0);
window.__timelines = window.__timelines || {};
window.__timelines['video'] = tl;

function requestDraw() {
  if (!ready || queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; draw(); }); // after the synchronous seek has applied all tweens
}

// ---- PixiJS scene ------------------------------------------------------------------------
const app = new Application();
const nodes = {};
let threadG, pinLayer;

function cardWorld(c) {
  const st = S[c.id], k = c.depth;
  return {
    x: c.x + st.dx + S.cam.x * k, y: c.y + st.dy + S.cam.y * k,
    rot: (c.rot + st.dr) * DEG, scale: 1 + 0.045 * st.lift,
  };
}
function toWorld(c, lx, ly) {
  const w = cardWorld(c), cs = Math.cos(w.rot), sn = Math.sin(w.rot);
  return [w.x + (lx * cs - ly * sn) * w.scale, w.y + (lx * sn + ly * cs) * w.scale];
}
const pinOwner = {};
for (const c of CARDS) for (const p of c.pins || []) pinOwner[p.id] = { c, p };

function draw() {
  for (const c of CARDS) {
    const n = nodes[c.id], st = S[c.id], w = cardWorld(c);
    n.card.position.set(w.x, w.y); n.card.rotation = w.rot; n.card.scale.set(w.scale);
    n.card.alpha = st.alpha;
    // shadow: offset and softness scale with lift — reads as paper raised above the board
    n.shadow.position.set(w.x + 3 + st.lift * 16, w.y + 5 + st.lift * 20);
    n.shadow.rotation = w.rot; n.shadow.scale.set(INV * w.scale * (1 + 0.02 * st.lift));
    n.shadow.alpha = st.alpha * (0.55 - 0.22 * st.lift);
    for (const t of n.tapes) { t.alpha = st.tape; t.scale.set(INV * (1.25 - 0.25 * st.tape)); }
  }
  pinLayer.removeChildren();
  threadG.clear();
  for (const t of THREADS) {
    const p = S[t.a + '>' + t.b].p;
    if (p <= 0) continue;
    const A = pinOwner[t.a], B = pinOwner[t.b];
    const [ax, ay] = toWorld(A.c, A.p.x, A.p.y), [bx, by] = toWorld(B.c, B.p.x, B.p.y);
    // slight catenary sag that tightens as the thread reaches its pin
    const mx = (ax + bx) / 2, my = (ay + by) / 2 + 10 * (1 - p) + 6;
    const pts = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const uu = (p * i) / N;
      const x = (1 - uu) ** 2 * ax + 2 * (1 - uu) * uu * mx + uu * uu * bx;
      const y = (1 - uu) ** 2 * ay + 2 * (1 - uu) * uu * my + uu * uu * by;
      pts.push(x, y);
    }
    threadG.moveTo(pts[0] + 1.5, pts[1] + 2.5);
    for (let i = 2; i < pts.length; i += 2) threadG.lineTo(pts[i] + 1.5, pts[i + 1] + 2.5);
    threadG.stroke({ width: 3, color: 0x000000, alpha: 0.35 });
    threadG.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) threadG.lineTo(pts[i], pts[i + 1]);
    threadG.stroke({ width: 3, color: C.tone, alpha: 1 });
    threadG.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) threadG.lineTo(pts[i], pts[i + 1]);
    threadG.stroke({ width: 1, color: C.paper, alpha: 0.55 });
  }
  for (const id in pinOwner) {
    const s = S[id].s;
    if (s <= 0) continue;
    const { c, p } = pinOwner[id];
    const [x, y] = toWorld(c, p.x, p.y);
    const g = nodes.pins[id];
    g.position.set(x, y); g.scale.set(Math.max(0.01, s)); g.alpha = Math.min(1, s * 1.4);
    pinLayer.addChild(g);
  }
  app.renderer.render(app.stage);
}

async function init() {
  await app.init({
    width: W, height: H, background: C.board, antialias: true, autoStart: false,
    sharedTicker: false, preference: 'webgl', preserveDrawingBuffer: true, resolution: 1,
  });
  app.ticker.stop();
  const mount = document.getElementById('stage');
  app.canvas.style.width = '100%'; app.canvas.style.height = '100%'; app.canvas.style.display = 'block';
  mount.appendChild(app.canvas);

  const board = new Sprite(buildBoard()); // stationary background + grain
  board.scale.set(INV);
  app.stage.addChild(board);
  const shadows = new Container(), cards = new Container();
  threadG = new Graphics(); pinLayer = new Container();
  app.stage.addChild(shadows, cards, threadG, pinLayer);

  for (const c of CARDS) {
    const a = c.build();
    const shadow = new Sprite(a.shadow); shadow.anchor.set(0.5); shadows.addChild(shadow);
    const card = new Container();
    const sp = new Sprite(a.tex); sp.anchor.set(0.5); sp.scale.set(INV); card.addChild(sp);
    const tapes = (c.tapes || []).map((t, i) => {
      const s = new Sprite(buildTape(t.w, t.h, 70 + i + c.depth * 10));
      s.anchor.set(0.5); s.position.set(t.x, t.y); s.rotation = t.rot * DEG; s.scale.set(INV);
      card.addChild(s); return s;
    });
    cards.addChild(card);
    nodes[c.id] = { card, shadow, tapes };
  }
  nodes.pins = {};
  for (const id in pinOwner) {
    const g = new Graphics();
    g.circle(1.5, 2.5, 9).fill({ color: 0x000000, alpha: 0.35 });
    g.circle(0, 0, 9).fill(C.ink).stroke({ width: 2, color: C.paper });
    g.circle(-2.5, -2.5, 2.4).fill({ color: C.paper, alpha: 0.6 });
    nodes.pins[id] = g;
  }
  ready = true;
  draw();
}
window.addEventListener('hf-seek', () => { if (ready) draw(); });
window.__styleSceneReady = init();
