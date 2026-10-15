// Cutout Animation — style-084 preview scene: "An idea becomes a connected system".
// Style renderer: PixiJS 8 (WebGL) compositing torn-edge Canvas 2D paper cutouts; Rough.js
//   draws the inked icons on the node cards.
// Motion owner for paper deformation: procedural paper curl / fold — a subdivided strip mesh
//   (Pixi MeshGeometry) whose vertices are re-derived from immutable rest coordinates and the
//   authored fold angle at composition time (cylindrical crease + straight flap, front/back split).
// Timeline owner: the single paused GSAP timeline at window.__timelines.video writes every
//   animated state value. Pixi never ticks; it redraws from that state on every seek / hf-seek.
import { Application, Container, Sprite, Texture, Graphics, Mesh, MeshGeometry } from 'pixi.js';
import rough from 'roughjs/bundled/rough.esm.js';

const gsap = window.gsap;
const chroma = window.chroma;
const W = 1280, H = 720, DURATION = 3, RES = 2, INV = 1 / RES, DEG = Math.PI / 180;

// ---- Resolved scene palette ----------------------------------------------------------------
// Material roles kept from the style example: ink charcoal, kraft paper, cream card stock.
// Scene-dependent field (new, replaces the previous all-cream canvas): a deep slate-teal
// "planning desk at night" built from torn paper bands, after the source review's lesson that
// the field belongs to the scene while the medium (matte stock, white torn core, grain) is fixed.
const C = {
  field: '#2A4852', fieldLow: '#213C45', seam: '#E9EEEA',
  ink: '#3B3C34', kraft: '#987A5C', kraftDark: '#7A5F45', kraftLight: '#B4977A',
  cream: '#F0E5D0', back: '#D9CBB0', rim: '#FBF8F1', mustard: '#E2AE4A',
};
for (const k in C) if (!chroma.valid(C[k])) throw Error('invalid palette ' + k);
// All copy is ink-on-cream or cream-on-ink paper (8.94:1). The field carries no text.
if (chroma.contrast(C.ink, C.cream) < 4.5) throw Error('ink/cream contrast');
// Cream cards must separate from the field.
if (chroma.contrast(C.cream, C.field) < 3) throw Error('card/field separation');
const SERIF = 'Georgia, "Times New Roman", Times, serif';

// ---- Deterministic helpers -------------------------------------------------------------------
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
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * RES); c.height = Math.ceil(h * RES);
  const ctx = c.getContext('2d');
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  return { c, ctx };
}
// Torn rectangle outline: points walk the edges with seeded jitter.
function tornRect(x, y, w, h, r, amp, step = 7) {
  const pts = [];
  const edge = (x0, y0, x1, y1, nx, ny) => {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n, j = (r() - 0.5) * 2 * amp;
      pts.push([x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j]);
    }
  };
  edge(x, y, x + w, y, 0, 1); edge(x + w, y, x + w, y + h, 1, 0);
  edge(x + w, y + h, x, y + h, 0, 1); edge(x, y + h, x, y, 1, 0);
  return pts;
}
function tornCircle(cx, cy, rad, r, amp, n = 40) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = rad + (r() - 0.5) * 2 * amp;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}
function poly(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function grain(ctx, w, h, r, dark, light, count) {
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = r() < 0.5 ? dark : light;
    const x = r() * w, y = r() * h, l = 0.6 + r() * 2.2;
    ctx.fillRect(x, y, l, 0.6);
  }
  ctx.restore();
}
const tex = (c) => Texture.from(c);

// A sheet of paper: white torn core (rim) + coloured stock inset + fibre grain.
// shape(r, inset) returns outline points in canvas space; inset shrinks for the stock layer.
function paperSheet(w, h, color, seed, shape, opts = {}) {
  const { c, ctx } = mkCanvas(w, h);
  const r = rng(seed);
  ctx.fillStyle = opts.rim || C.rim; poly(ctx, shape(r, 0)); ctx.fill();
  ctx.fillStyle = color; poly(ctx, shape(r, opts.rimW ?? 2.6)); ctx.fill();
  grain(ctx, w, h, r, 'rgba(40,30,20,0.10)', 'rgba(255,255,255,0.10)', Math.round(w * h / 22));
  if (opts.after) opts.after(ctx, r);
  return c;
}
// Soft contact shadow of a rectangle (pre-blurred, deterministic canvas filter).
function shadowRect(w, h, blur) {
  const pw = w + blur * 4, ph = h + blur * 4;
  const { c, ctx } = mkCanvas(pw, ph);
  ctx.filter = `blur(${blur * RES}px)`;
  ctx.fillStyle = 'rgba(8,16,20,1)';
  ctx.fillRect(blur * 2, blur * 2, w, h);
  return { c, pw, ph };
}
function shadowCircle(rad, blur) {
  const s = rad * 2 + blur * 4;
  const { c, ctx } = mkCanvas(s, s);
  ctx.filter = `blur(${blur * RES}px)`;
  ctx.fillStyle = 'rgba(8,16,20,1)';
  ctx.beginPath(); ctx.arc(s / 2, s / 2, rad, 0, Math.PI * 2); ctx.fill();
  return { c, s };
}

// ---- Stationary background: torn slate paper bands + faint planning grid + grain --------------
function buildField() {
  const { c, ctx } = mkCanvas(W, H);
  const r = rng(84);
  ctx.fillStyle = C.field; ctx.fillRect(0, 0, W, H);
  // faint planning grid printed on the board stock
  ctx.strokeStyle = 'rgba(233,238,234,0.055)'; ctx.lineWidth = 1;
  for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // two thin torn seams (layered sheets), as in torn-band skies
  const seam = (y0, amp, col, below) => {
    const pts = [[-10, H + 10]];
    for (let x = -10; x <= W + 10; x += 9) pts.push([x, y0 + (r() - 0.5) * 2 * amp + Math.sin(x / 140) * 4]);
    pts.push([W + 10, H + 10]);
    ctx.fillStyle = C.seam; poly(ctx, pts); ctx.fill();
    ctx.fillStyle = col; poly(ctx, pts.map(([x, y], i) => (i === 0 || i === pts.length - 1 ? [x, y] : [x, y + 2.2 + r() * 1.6]))); ctx.fill();
    if (below) below();
  };
  seam(648, 2.2, C.fieldLow, () => {
    ctx.strokeStyle = 'rgba(233,238,234,0.05)';
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 652); ctx.lineTo(x, H); ctx.stroke(); }
  });
  // fibre grain over the whole field (stationary)
  for (let i = 0; i < 26000; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.045)';
    ctx.fillRect(r() * W, r() * H, 0.7 + r() * 2.4, 0.7);
  }
  // soft vignette from a lamp at upper left (fixed, part of the board)
  const g = ctx.createRadialGradient(360, 260, 80, 560, 360, 900);
  g.addColorStop(0, 'rgba(255,240,210,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  return c;
}

// ---- Scene definitions -------------------------------------------------------------------------
const TITLES = [
  { id: 'tA', x: 192, y: 93, w: 244, h: 66, rot: -4, dark: true, text: 'An idea', font: `44px ${SERIF}`, seed: 11 },
  { id: 'tB', x: 243, y: 166, w: 266, h: 56, rot: 2, dark: false, text: 'becomes a', font: `italic 34px ${SERIF}`, seed: 12 },
  { id: 'tC', x: 295, y: 241, w: 470, h: 70, rot: -1.5, dark: true, text: 'connected system', font: `bold 46px ${SERIF}`, seed: 13 },
];
const CARD_W = 150, CARD_H = 104, PAD = 6, TW = CARD_W + PAD * 2, TH = CARD_H + PAD * 2;
const CARDS = [
  { id: 'c1', x: 720, y: 250, rot: -6, icon: 'circle', seed: 21 },
  { id: 'c2', x: 980, y: 330, rot: 5, icon: 'square', seed: 22 },
  { id: 'c3', x: 740, y: 520, rot: 3, icon: 'triangle', seed: 23 },
  { id: 'c4', x: 1060, y: 560, rot: -4, icon: 'cross', seed: 24 },
];
const BULB = { x: 300, y: 420, r: 121, pivotX: 300, pivotY: 590 };
const PORTS = [{ id: 'p1', x: 400, y: 400 }, { id: 'p2', x: 380, y: 450 }];
const CARD_BY = Object.fromEntries(CARDS.map((c) => [c.id, c]));
// Connector strips: kraft paper strips that unroll from a small roll toward their target.
function edgePoint(from, card, overlap) {
  const dx = card.x - from.x, dy = card.y - from.y, len = Math.hypot(dx, dy);
  const t = Math.min(CARD_W / 2 / Math.abs(dx || 1e-6), CARD_H / 2 / Math.abs(dy || 1e-6));
  const d = len - Math.min(len, t * len) + overlap;
  return { x: from.x + (dx / len) * d, y: from.y + (dy / len) * d };
}
const CONNS = [
  { id: 'k1', a: PORTS[0], b: 'c1', start: 0.75, dur: 0.4 },
  { id: 'k2', a: PORTS[1], b: 'c3', start: 0.85, dur: 0.38 },
  { id: 'k3', a: 'c1', b: 'c2', start: 1.35, dur: 0.3 },
  { id: 'k4', a: 'c3', b: 'c4', start: 1.45, dur: 0.32 },
  { id: 'k5', a: 'c2', b: 'c4', start: 1.85, dur: 0.3 },
].map((k) => {
  const A = typeof k.a === 'string' ? CARD_BY[k.a] : k.a, B = CARD_BY[k.b];
  const a = typeof k.a === 'string' ? edgePoint(B, A, 14) : A; // leave from card edge
  const b = edgePoint(A, B, 14);
  return { ...k, ax: a.x, ay: a.y, bx: b.x, by: b.y };
});
const RAYS = [-150, -115, -80, -45, 175, 145];

// ---- Timeline-owned state (GSAP is the only writer of these values) ---------------------------
const S = {};
for (const t of TITLES) S[t.id] = { dx: 0, dy: 0, dr: 0, lift: 1, alpha: 0 };
for (const c of CARDS) S[c.id] = { dx: 0, dy: 0, dr: 0, lift: 1, alpha: 0, fold: Math.PI, icon: 0 };
S.bulb = { dy: 0, dr: 0, lift: 1, alpha: 0, pose: 0 };
for (const p of PORTS) S[p.id] = { s: 0 };
for (const k of CONNS) S[k.id] = { p: 0 };

const tl = (window.__timelines && window.__timelines.video) || gsap.timeline({ paused: true });
// Placing: a cut piece is carried in lifted (bigger, long soft shadow) and pressed onto the board.
function place(id, from, at, travel, settle, ease = 'power3.out') {
  const st = S[id];
  Object.assign(st, from, { lift: 1, alpha: 0 });
  tl.to(st, { alpha: 1, duration: 0.1, ease: 'none' }, at);
  tl.to(st, { dx: 0, dy: 0, dr: 0, duration: travel, ease }, at);
  tl.to(st, { lift: 0, duration: settle, ease: 'power2.in' }, at + travel - settle * 0.5);
}
place('tA', { dx: -40, dy: -70, dr: -9 }, 0.0, 0.38, 0.14);
place('bulb', { dy: -60, dr: -11 }, 0.08, 0.5, 0.16, 'back.out(1.2)');
// filament: held replacement poses on a 12 fps art cadence (dim → lit → dim → lit)
tl.to(S.bulb, { pose: 3, duration: 0.25, ease: 'steps(3)' }, 0.5);
place('tB', { dx: 50, dy: -40, dr: 8 }, 0.46, 0.36, 0.14);
const CARD_TIMES = { c1: [0.58, 1.0], c3: [0.68, 1.1], c2: [1.1, 1.5], c4: [1.2, 1.6] };
const CARD_FROM = { c1: { dx: 60, dy: -90, dr: 12 }, c3: { dx: 40, dy: 90, dr: -10 }, c2: { dx: 90, dy: -60, dr: -12 }, c4: { dx: 80, dy: 80, dr: 10 } };
for (const c of CARDS) {
  const [placeAt, unfoldAt] = CARD_TIMES[c.id];
  place(c.id, CARD_FROM[c.id], placeAt, 0.34, 0.14);
  // the folded flap opens: crease rolls flat (anticipation is the pressed-down landing)
  tl.to(S[c.id], { fold: 0, duration: 0.45, ease: 'power2.inOut' }, unfoldAt);
  // inked icon is stamped only after the card is complete
  tl.to(S[c.id], { icon: 1, duration: 0.17, ease: 'back.out(1.2)' }, unfoldAt + 0.47);
}
tl.to(S.p1, { s: 1, duration: 0.16, ease: 'back.out(1.2)' }, 0.7);
tl.to(S.p2, { s: 1, duration: 0.16, ease: 'back.out(1.2)' }, 0.8);
for (const k of CONNS) tl.to(S[k.id], { p: 1, duration: k.dur, ease: 'sine.inOut' }, k.start);
place('tC', { dx: -60, dy: 50, dr: -6 }, 1.95, 0.4, 0.16);

// redraw hook: a setter-driven clock property fires on every seek (forward, backward, direct)
let ready = false, queued = false;
const clock = { _t: 0, get t() { return this._t; }, set t(v) { this._t = v; requestDraw(); } };
tl.to(clock, { t: DURATION, duration: DURATION, ease: 'none' }, 0);
window.__timelines = window.__timelines || {};
window.__timelines.video = tl;
function requestDraw() {
  if (!ready || queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; draw(); });
}

// ---- Procedural paper fold (curl) mesh ----------------------------------------------------------
// Card local frame: crease is the horizontal line y = 0 through the card centre. The lower half is
// flat. The upper flap (arc length s from the crease, 0..L) wraps a cylinder of radius R for
// s < R·θ and continues straight at angle θ. θ = π: flap folded down over the front, back showing;
// θ = 0: flat. Rest coordinates (u, v) never change; positions are re-derived from θ each draw.
const R_CURL = 7, NF = 22, NB = 22, PERSP = 0.0026, L = TH / 2;
function flap(s, th) {
  if (s <= R_CURL * th) {
    const a = s / R_CURL;
    return { p: R_CURL * Math.sin(a), z: R_CURL * (1 - Math.cos(a)), a };
  }
  const e = s - R_CURL * th;
  return { p: R_CURL * Math.sin(th) + e * Math.cos(th), z: R_CURL * (1 - Math.cos(th)) + e * Math.sin(th), a: th };
}
function stripIndices(rows) {
  const idx = new Uint32Array((rows - 1) * 6);
  for (let i = 0; i < rows - 1; i++) {
    const o = i * 2;
    idx.set([o, o + 1, o + 2, o + 1, o + 3, o + 2], i * 6);
  }
  return idx;
}
class FoldCard {
  constructor(front, back, shadowTex) {
    this.view = new Container();
    this.shadow = new Sprite(shadowTex.tex); this.shadow.anchor.set(0.5, 0); this.shadow.scale.set(INV);
    this.shadowPh = shadowTex.ph;
    this.rowsF = 2 + NF; this.rowsB = NB + 1;
    this.posF = new Float32Array(this.rowsF * 4); this.uvF = new Float32Array(this.rowsF * 4);
    this.posB = new Float32Array(this.rowsB * 4); this.uvB = new Float32Array(this.rowsB * 4);
    this.gF = new MeshGeometry({ positions: this.posF, uvs: this.uvF, indices: stripIndices(this.rowsF) });
    this.gB = new MeshGeometry({ positions: this.posB, uvs: this.uvB, indices: stripIndices(this.rowsB) });
    this.gF.batchMode = 'no-batch'; this.gB.batchMode = 'no-batch';
    this.front = new Mesh({ geometry: this.gF, texture: front });
    this.back = new Mesh({ geometry: this.gB, texture: back });
    this.shade = new Graphics();
    this.icon = null;
    this.view.addChild(this.shadow, this.front, this.back, this.shade);
  }
  row(pos, uv, i, v, y, z) {
    const sx = 1 + z * PERSP, hw = (TW / 2) * sx;
    pos.set([-hw, y, hw, y], i * 4);
    uv.set([0, v, 1, v], i * 4);
  }
  update(th, lift, alpha) {
    const sSplit = th > Math.PI / 2 ? Math.min(R_CURL * Math.PI / 2, L) : L;
    const { posF, uvF, posB, uvB } = this;
    this.row(posF, uvF, 0, 1, TH / 2, 0);
    this.row(posF, uvF, 1, 0.5, 0, 0);
    let maxP = 0;
    const samplesF = [], samplesB = [];
    for (let k = 1; k <= NF; k++) {
      const s = (sSplit * k) / NF, f = flap(s, th);
      this.row(posF, uvF, 1 + k, 0.5 - s / TH, -f.p, f.z);
      samplesF.push({ s, ...f }); maxP = Math.max(maxP, f.p);
    }
    const hasBack = sSplit < L - 0.01;
    this.back.visible = hasBack;
    if (hasBack) {
      for (let k = 0; k <= NB; k++) {
        const s = sSplit + ((L - sSplit) * k) / NB, f = flap(s, th);
        this.row(posB, uvB, k, 0.5 - s / TH, -f.p, f.z);
        samplesB.push({ s, ...f }); maxP = Math.max(maxP, f.p);
      }
      this.gB.positions = posB; this.gB.uvs = uvB;
    }
    this.gF.positions = posF; this.gF.uvs = uvF;

    // Lighting approximation (lamp above): the flap's front face darkens as it turns toward the
    // board; the exposed back catches light near the vertical. Crease casts a short shadow.
    const g = this.shade; g.clear();
    const inset = PAD + 1.5;
    const band = (list, colorFn) => {
      for (let i = 0; i < list.length - 1; i++) {
        const A = list[i], B = list[i + 1];
        const { color, alpha: al } = colorFn((A.a + B.a) / 2);
        if (al < 0.01) continue;
        const ha = (TW / 2 - inset) * (1 + A.z * PERSP), hb = (TW / 2 - inset) * (1 + B.z * PERSP);
        g.poly([-ha, -A.p, ha, -A.p, hb, -B.p, -hb, -B.p]).fill({ color, alpha: al });
      }
    };
    band([{ s: 0, p: 0, z: 0, a: 0 }, ...samplesF], (a) => ({ color: 0x0b1418, alpha: 0.32 * Math.sin(Math.min(a, Math.PI / 2)) }));
    if (hasBack) band(samplesB, (a) => ({ color: 0xffffff, alpha: 0.2 * Math.max(0, Math.sin(a)) }));
    const cs = Math.sin(Math.min(th, Math.PI / 2)) * (th > 0.02 ? 1 : 0);
    if (cs > 0.01 && th < Math.PI * 0.98) {
      const hw = TW / 2 - inset;
      g.poly([-hw, 0, hw, 0, hw, 7 * cs, -hw, 7 * cs]).fill({ color: 0x0b1418, alpha: 0.18 * cs });
    }
    // contact shadow follows the current silhouette (top = highest projected flap point)
    const top = -maxP, bottom = TH / 2;
    const off = 3 + 14 * lift;
    this.shadow.position.set(off * 0.7, top + off - 12 + 2);
    this.shadow.scale.set(INV * (1 + 0.03 * lift), INV * ((bottom - top) / TH));
    this.shadow.alpha = alpha * (0.5 - 0.22 * lift);
    return maxP;
  }
}

// ---- Asset builders --------------------------------------------------------------------------------
function buildTitle(t) {
  const pad = 6, w = t.w + pad * 2, h = t.h + pad * 2;
  const c = paperSheet(w, h, t.dark ? C.ink : C.cream, t.seed,
    (r, ins) => tornRect(pad + ins, pad + ins, t.w - ins * 2, t.h - ins * 2, r, 1.6, 6), {
      after: (ctx) => {
        ctx.fillStyle = t.dark ? C.cream : C.ink;
        let size = parseFloat(t.font.match(/(\d+)px/)[1]);
        let font = t.font;
        ctx.font = font;
        while (ctx.measureText(t.text).width > t.w - 30 && size > 20) {
          size -= 1; font = t.font.replace(/\d+px/, size + 'px'); ctx.font = font;
        }
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(t.text, pad + 18, pad + t.h * 0.5 + size * 0.34);
      },
    });
  const sh = shadowRect(t.w, t.h, 6);
  return { tex: tex(c), w, h, shadow: tex(sh.c), sw: sh.pw, shh: sh.ph };
}
function buildCardFront(seed) {
  return paperSheet(TW, TH, C.cream, seed, (r, ins) => tornRect(PAD + ins, PAD + ins, CARD_W - ins * 2, CARD_H - ins * 2, r, 1.5, 6));
}
function buildCardBack(seed) {
  // back of the stock: same outline family, slightly darker and with a pencil hatch line
  return paperSheet(TW, TH, C.back, seed + 100, (r, ins) => tornRect(PAD + ins, PAD + ins, CARD_W - ins * 2, CARD_H - ins * 2, r, 1.5, 6), {
    after: (ctx, r) => {
      ctx.save(); ctx.globalCompositeOperation = 'source-atop';
      ctx.strokeStyle = 'rgba(59,60,52,0.10)'; ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) { const y = PAD + 12 + i * 11 + r() * 2; ctx.beginPath(); ctx.moveTo(PAD + 8, y); ctx.lineTo(TW - PAD - 8, y + (r() - 0.5) * 2); ctx.stroke(); }
      ctx.restore();
    },
  });
}
function buildIcon(kind, seed) {
  const S2 = 80;
  const { c, ctx } = mkCanvas(S2, S2);
  const rc = rough.canvas(c);
  const o = { stroke: C.ink, strokeWidth: 4, roughness: 1.1, bowing: 1, seed };
  const cx = S2 / 2, cy = S2 / 2;
  let dot = [cx - 20, cy];
  if (kind === 'circle') { rc.circle(cx + 2, cy, 40, o); dot = [cx - 18, cy]; }
  if (kind === 'square') { rc.rectangle(cx - 18, cy - 18, 36, 36, o); dot = [cx, cy]; }
  if (kind === 'triangle') { rc.polygon([[cx + 2, cy - 22], [cx + 24, cy + 18], [cx - 20, cy + 18]], o); dot = [cx - 20, cy]; }
  if (kind === 'cross') { rc.line(cx - 16, cy - 16, cx + 16, cy + 16, o); rc.line(cx + 16, cy - 16, cx - 16, cy + 16, o); dot = [cx, cy]; }
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(dot[0], dot[1], 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.kraft; ctx.beginPath(); ctx.arc(dot[0], dot[1], 5, 0, Math.PI * 2); ctx.fill();
  return tex(c);
}
function buildBulb() {
  const pad = 8, s = BULB.r * 2 + pad * 2;
  const c = paperSheet(s, s, C.kraft, 31, (r, ins) => tornCircle(s / 2, s / 2, BULB.r - ins, r, 1.8, 46), {
    after: (ctx, r) => { // printed dot texture on the kraft stock
      ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(59,60,52,0.10)';
      for (let y = 4; y < s; y += 9) for (let x = 4 + (y % 18 ? 4 : 0); x < s; x += 9) ctx.fillRect(x, y, 2, 1.2);
      ctx.restore();
    },
  });
  const zig = (col, w) => {
    const z = mkCanvas(130, 70);
    z.ctx.strokeStyle = col; z.ctx.lineWidth = w; z.ctx.lineJoin = 'bevel';
    z.ctx.beginPath(); z.ctx.moveTo(15, 60); z.ctx.lineTo(40, 20); z.ctx.lineTo(65, 60); z.ctx.lineTo(90, 20); z.ctx.lineTo(115, 60); z.ctx.stroke();
    return tex(z.c);
  };
  const base = (w, h, seed) => {
    const p = 4;
    return tex(paperSheet(w + p * 2, h + p * 2, C.ink, seed, (r, ins) => tornRect(p + ins, p + ins, w - ins * 2, h - ins * 2, r, 1.2, 6), { rimW: 2 }));
  };
  const ray = (i) => {
    const w = 38, h = 12, p = 4;
    return tex(paperSheet(w + p * 2, h + p * 2, C.mustard, 60 + i, (r, ins) => tornRect(p + ins, p + ins, w - ins * 2, h - ins * 2, r, 1.2, 5), { rimW: 2 }));
  };
  const sh = shadowCircle(BULB.r, 8);
  return {
    body: tex(c), size: s, dim: zig('#6A5440', 12), lit: zig(C.cream, 12),
    base1: base(86, 24, 41), base2: base(70, 20, 42), rays: RAYS.map((_, i) => ray(i)),
    shadow: tex(sh.c), shadowSize: sh.s,
  };
}

// ---- PixiJS scene ----------------------------------------------------------------------------------
const app = new Application();
const N = {};
let connG;

function draw() {
  // titles
  for (const t of TITLES) {
    const n = N[t.id], st = S[t.id];
    n.view.position.set(t.x + st.dx, t.y + st.dy);
    n.view.rotation = (t.rot + st.dr) * DEG;
    n.view.scale.set(1 + 0.06 * st.lift);
    n.view.alpha = st.alpha;
    n.shadow.position.set(3 + 14 * st.lift, 5 + 18 * st.lift);
    n.shadow.alpha = 0.55 - 0.25 * st.lift;
  }
  // bulb: hinged on a pivot at its base
  {
    const st = S.bulb, n = N.bulb;
    n.view.position.set(BULB.pivotX, BULB.pivotY + st.dy);
    n.view.rotation = st.dr * DEG;
    n.view.scale.set(1 + 0.05 * st.lift);
    n.view.alpha = st.alpha;
    n.shadow.position.set(BULB.x - BULB.pivotX + 4 + 16 * st.lift, BULB.y - BULB.pivotY + 6 + 20 * st.lift);
    n.shadow.alpha = 0.5 - 0.22 * st.lift;
    const lit = Math.round(st.pose) % 2 === 1;
    n.dim.visible = !lit; n.lit.visible = lit;
    for (const r of n.rays) r.visible = lit;
  }
  // connector strips unrolling from a shrinking paper roll
  connG.clear();
  for (const k of CONNS) {
    const p = S[k.id].p;
    if (p <= 0) continue;
    const dx = k.bx - k.ax, dy = k.by - k.ay, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const ex = k.ax + dx * p, ey = k.ay + dy * p;
    const quad = (x0, y0, x1, y1, hw, o = 0) => [
      x0 + nx * hw + o, y0 + ny * hw + o * 1.4, x1 + nx * hw + o, y1 + ny * hw + o * 1.4,
      x1 - nx * hw + o, y1 - ny * hw + o * 1.4, x0 - nx * hw + o, y0 - ny * hw + o * 1.4];
    connG.poly(quad(k.ax, k.ay, ex, ey, 9, 4)).fill({ color: 0x08141a, alpha: 0.38 });
    connG.poly(quad(k.ax, k.ay, ex, ey, 10.2)).fill(C.rim);
    connG.poly(quad(k.ax, k.ay, ex, ey, 8.4)).fill(C.kraft);
    if (p < 1) {
      const rr = 3 + 8 * (1 - p); // remaining roll radius shrinks as the strip unrolls
      const cx = ex + ux * rr, cy = ey + uy * rr;
      const rq = (a, b, hw) => quad(cx - ux * a, cy - uy * a, cx + ux * b, cy + uy * b, hw);
      connG.poly(quad(cx - ux * rr, cy - uy * rr, cx + ux * rr, cy + uy * rr, 11, 3 + rr * 0.5)).fill({ color: 0x08141a, alpha: 0.4 });
      connG.poly(rq(rr, rr, 11)).fill(C.rim);
      connG.poly(rq(rr - 1.2, rr - 1.2, 9.6)).fill(C.kraftDark);
      connG.poly(rq(rr * 0.55, -rr * 0.05, 9.6)).fill(C.kraftLight);
      connG.poly(rq(-rr * 0.55, rr - 1.2, 9.6)).fill({ color: 0x2a2018, alpha: 0.35 });
    }
  }
  for (const p of PORTS) {
    const s = S[p.id].s, g = N[p.id];
    g.visible = s > 0.001; g.scale.set(Math.max(0.01, s));
  }
  // cards with procedural fold
  for (const c of CARDS) {
    const st = S[c.id], n = N[c.id];
    n.view.position.set(c.x + st.dx, c.y + st.dy);
    n.view.rotation = (c.rot + st.dr) * DEG;
    n.view.scale.set(1 + 0.05 * st.lift);
    n.view.alpha = st.alpha;
    n.fold.update(st.fold, st.lift, 1);
    n.icon.visible = st.icon > 0.001;
    n.icon.scale.set(INV * Math.max(0.01, 0.6 + 0.4 * st.icon));
    n.icon.alpha = Math.min(1, st.icon * 1.5);
  }
  app.renderer.render(app.stage);
}

async function init() {
  await app.init({
    width: W, height: H, background: C.field, antialias: true, autoStart: false,
    sharedTicker: false, preference: 'webgl', preserveDrawingBuffer: true, resolution: 1,
  });
  app.ticker.stop();
  const mount = document.getElementById('stage');
  app.canvas.style.width = '100%'; app.canvas.style.height = '100%'; app.canvas.style.display = 'block';
  app.canvas.setAttribute('data-layout-allow-overflow', '');
  mount.appendChild(app.canvas);

  const field = new Sprite(tex(buildField())); field.scale.set(INV);
  app.stage.addChild(field);
  connG = new Graphics();
  app.stage.addChild(connG);

  // bulb (pieces organised under one pivot at the base)
  const b = buildBulb();
  const bv = new Container();
  const ox = BULB.x - BULB.pivotX, oy = BULB.y - BULB.pivotY;
  const shadow = new Sprite(b.shadow); shadow.anchor.set(0.5); shadow.scale.set(INV);
  const rays = RAYS.map((deg, i) => {
    const s = new Sprite(b.rays[i]); s.anchor.set(0.5); s.scale.set(INV);
    const a = deg * DEG, rr = BULB.r + 30;
    s.position.set(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr); s.rotation = a; return s;
  });
  const body = new Sprite(b.body); body.anchor.set(0.5); body.scale.set(INV); body.position.set(ox, oy);
  const dim = new Sprite(b.dim); dim.anchor.set(0.5); dim.scale.set(INV); dim.position.set(ox, oy - 10);
  const lit = new Sprite(b.lit); lit.anchor.set(0.5); lit.scale.set(INV); lit.position.set(ox, oy - 10);
  const base1 = new Sprite(b.base1); base1.anchor.set(0.5); base1.scale.set(INV); base1.position.set(0, -30); base1.rotation = -3 * DEG;
  const base2 = new Sprite(b.base2); base2.anchor.set(0.5); base2.scale.set(INV); base2.position.set(0, -4); base2.rotation = 2 * DEG;
  bv.addChild(shadow, ...rays, base2, base1, body, dim, lit);
  app.stage.addChild(bv);
  N.bulb = { view: bv, shadow, rays, dim, lit };
  for (const p of PORTS) {
    const g = new Graphics();
    g.circle(1.5, 2.5, 9.5).fill({ color: 0x08141a, alpha: 0.35 });
    g.circle(0, 0, 9.5).fill(C.ink).stroke({ width: 1.6, color: C.rim });
    g.circle(0, 0, 5).fill(C.kraft);
    g.position.set(p.x, p.y); g.visible = false;
    app.stage.addChild(g); N[p.id] = g;
  }

  const cardShadow = shadowRect(CARD_W, CARD_H, 7);
  const cardShadowTex = { tex: tex(cardShadow.c), ph: cardShadow.ph };
  for (const c of CARDS) {
    const fold = new FoldCard(tex(buildCardFront(c.seed)), tex(buildCardBack(c.seed)), cardShadowTex);
    const icon = new Sprite(buildIcon(c.icon, c.seed + 7)); icon.anchor.set(0.5); icon.scale.set(INV);
    fold.view.addChild(icon);
    app.stage.addChild(fold.view);
    N[c.id] = { view: fold.view, fold, icon };
  }
  for (const t of TITLES) {
    const a = buildTitle(t);
    const view = new Container();
    const shadow = new Sprite(a.shadow); shadow.anchor.set(0.5); shadow.scale.set(INV);
    const sp = new Sprite(a.tex); sp.anchor.set(0.5); sp.scale.set(INV);
    view.addChild(shadow, sp);
    app.stage.addChild(view);
    N[t.id] = { view, shadow };
  }
  ready = true;
  draw();
}
window.addEventListener('hf-seek', () => { if (ready) draw(); });
window.__styleSceneReady = init();
