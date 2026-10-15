// Mixed-media collage scene for style-107. PixiJS renders the material layers;
// Rough.js (seeded) generates pencil geometry once at init. Every frame is a pure
// function of composition time t (seconds) — no ticker, clock or carried state.
const { Application, Container, Graphics, Sprite, Texture } = window.PIXI;
import rough from 'roughjs';

const W = 1280, H = 720;
const C = {
  slate: 0x1b262b, slateDot: 0x26353b, newsprint: 0xdce0d9, fiber: 0xf4f5f0,
  ink: 0x263236, teal: 0x688e87, copper: 0xb97a5c, shadow: 0x0b1114,
};

// ---------- deterministic helpers ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
let EASE = {};
function seg(t, start, dur, ease) {
  const p = clamp((t - start) / dur);
  return ease ? EASE[ease](p) : p;
}

// ---------- tear edge (seeded) ----------
function tearEdge() {
  const r = mulberry32(107);
  const pts = [];
  for (let y = -12; y <= H + 12; y += 14) {
    const base = 612 - (y / H) * 22; // leans slightly
    pts.push([base + (r() - 0.5) * 18 + Math.sin(y * 0.031) * 7, y]);
  }
  return pts;
}

// ---------- textures (built once) ----------
function paperCanvas() {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#DCE0D9'; g.fillRect(0, 0, W, H);
  const r = mulberry32(31);
  for (let i = 0; i < 9000; i++) {
    const v = r();
    g.fillStyle = v > 0.5 ? 'rgba(38,50,54,0.07)' : 'rgba(255,255,255,0.22)';
    g.fillRect(r() * W, r() * H, 1 + r() * 1.6, 1 + r() * 1.6);
  }
  g.strokeStyle = 'rgba(38,50,54,0.06)'; g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = r() * H, a = r() * Math.PI, l = 6 + r() * 16;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.fillStyle = 'rgba(38,50,54,0.075)';
  for (let y = 27; y < H; y += 28) g.fillRect(0, y, W, 1);
  return cv;
}
function slateCanvas() {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#1B262B'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#26353B';
  for (let y = 4; y < H; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < W; x += 8) {
    g.beginPath(); g.arc(x, y, 1.25, 0, Math.PI * 2); g.fill();
  }
  const r = mulberry32(77);
  g.fillStyle = 'rgba(220,224,217,0.05)';
  for (let i = 0; i < 1400; i++) g.fillRect(r() * W, r() * H, 1, 1);
  const vg = g.createRadialGradient(W * 0.7, H * 0.45, 120, W * 0.7, H * 0.45, 900);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return cv;
}

// ---------- rough geometry flattened to polylines ----------
function flatten(drawable, ox, oy, s) {
  const strokes = [];
  for (const set of drawable.sets) {
    if (set.type !== 'path') continue;
    let cur = null, pts = null;
    for (const op of set.ops) {
      const d = op.data;
      if (op.op === 'move') {
        if (pts && pts.length > 1) strokes.push(pts);
        cur = [d[0], d[1]]; pts = [cur];
      } else if (op.op === 'lineTo') {
        cur = [d[0], d[1]]; pts.push(cur);
      } else if (op.op === 'bcurveTo') {
        const [x0, y0] = cur;
        for (let k = 1; k <= 8; k++) {
          const u = k / 8, m = 1 - u;
          pts.push([
            m * m * m * x0 + 3 * m * m * u * d[0] + 3 * m * u * u * d[2] + u * u * u * d[4],
            m * m * m * y0 + 3 * m * m * u * d[1] + 3 * m * u * u * d[3] + u * u * u * d[5],
          ]);
        }
        cur = [d[4], d[5]];
      }
    }
    if (pts && pts.length > 1) strokes.push(pts);
  }
  return strokes.map((p) => {
    const q = p.map(([x, y]) => [ox + x * s, oy + y * s]);
    let L = 0; const acc = [0];
    for (let i = 1; i < q.length; i++) { L += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); acc.push(L); }
    return { pts: q, acc, L };
  });
}
function drawPartial(g, strokes, p, style) {
  const total = strokes.reduce((a, s) => a + s.L, 0);
  let budget = total * clamp(p);
  for (const s of strokes) {
    if (budget <= 0) break;
    const lim = Math.min(budget, s.L); budget -= s.L;
    g.moveTo(s.pts[0][0], s.pts[0][1]);
    for (let i = 1; i < s.pts.length; i++) {
      if (s.acc[i] <= lim) g.lineTo(s.pts[i][0], s.pts[i][1]);
      else {
        const a = s.acc[i - 1], f = (lim - a) / Math.max(1e-6, s.acc[i] - a);
        g.lineTo(lerp(s.pts[i - 1][0], s.pts[i][0], f), lerp(s.pts[i - 1][1], s.pts[i][1], f));
        break;
      }
    }
  }
  g.stroke(style);
}
function cubicPartial(g, c, p) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = c;
  const n = 40, end = clamp(p);
  g.moveTo(x0, y0);
  for (let k = 1; k <= n; k++) {
    const u = (k / n) * end, m = 1 - u;
    g.lineTo(m * m * m * x0 + 3 * m * m * u * x1 + 3 * m * u * u * x2 + u * u * u * x3,
      m * m * m * y0 + 3 * m * m * u * y1 + 3 * m * u * u * y2 + u * u * u * y3);
  }
}

// ---------- scene data ----------
const PIN0 = [478, 380];
const NODES = [
  { id: 'A', poly: [[760, 240], [840, 226], [870, 258], [800, 300]], fill: C.teal, echo: C.copper, pin: [800, 262], at: 1.30, rot0: -0.22 },
  { id: 'B', poly: [[1042, 186], [1162, 196], [1155, 286], [1035, 276]], fill: C.copper, echo: C.teal, pin: [1100, 236], at: 1.42, rot0: 0.2 },
  { id: 'D', poly: [[880, 470], [960, 456], [972, 520], [892, 530]], fill: C.teal, echo: C.copper, pin: [930, 492], at: 1.52, rot0: 0.18 },
  { id: 'C', poly: [[1000, 420], [1090, 404], [1110, 470], [1020, 486]], fill: C.teal, echo: C.copper, pin: [1055, 446], at: 1.62, rot0: -0.16 },
];
// threads: [cubic, start, duration, arrival pin index or -1]
const THREADS = [
  { c: [478, 380, 580, 330, 650, 300, 800, 262], at: 1.50, dur: 0.38, pin: 'A' },
  { c: [800, 262, 880, 300, 1000, 260, 1100, 236], at: 1.84, dur: 0.26, pin: 'B' },
  { c: [800, 262, 860, 420, 900, 470, 930, 492], at: 1.90, dur: 0.26, pin: 'D' },
  { c: [930, 492, 980, 470, 1020, 460, 1055, 446], at: 2.12, dur: 0.16, pin: 'C' },
  { c: [1100, 236, 1110, 320, 1080, 380, 1055, 446], at: 2.12, dur: 0.20, pin: 'C' },
];
const DISC = { x: 930, y: 352, r: 190 };

let app, L = {}, data = {}, ready = null;

export function init(gsapRef) {
  if (ready) return ready;
  EASE = {
    in2: gsapRef.parseEase('power2.in'), out2: gsapRef.parseEase('power2.out'),
    io2: gsapRef.parseEase('power2.inOut'), back: gsapRef.parseEase('back.out(1.6)'),
    sine: gsapRef.parseEase('sine.inOut'),
  };
  ready = (async () => {
    const a = new Application();
    await a.init({
      width: W, height: H, background: C.slate, antialias: true, autoStart: false,
      sharedTicker: false, preference: 'webgl', preserveDrawingBuffer: true, resolution: 1,
    });
    a.ticker.stop();
    const host = document.getElementById('stage');
    a.canvas.style.width = '100%'; a.canvas.style.height = '100%';
    host.appendChild(a.canvas);

    const paperTex = Texture.from(paperCanvas());
    const slateTex = Texture.from(slateCanvas());
    const edge = tearEdge();
    data.edge = edge;

    // layer 0: slate print ground (stationary)
    a.stage.addChild(new Sprite(slateTex));
    // layer 1: halftone disc + guide ring (dynamic)
    L.disc = new Graphics(); L.guide = new Graphics();
    a.stage.addChild(L.disc, L.guide);
    // layer 2: nodes
    L.nodes = NODES.map((n) => {
      const cx = n.poly.reduce((a, p) => a + p[0], 0) / 4, cy = n.poly.reduce((a, p) => a + p[1], 0) / 4;
      const local = n.poly.flatMap(([x, y]) => [x - cx, y - cy]);
      const ct = new Container(); ct.position.set(cx, cy);
      const shadow = new Graphics().poly(local.map((v, i) => v + (i % 2 ? 9 : 7))).fill({ color: C.shadow, alpha: 0.45 });
      const echo1 = new Graphics().poly(local).fill({ color: n.echo, alpha: 0.85 });
      const echo2 = new Graphics().poly(local).fill({ color: n.echo, alpha: 0.5 });
      const body = new Graphics().poly(local).fill({ color: n.fill });
      const gen = rough.generator();
      const dr = gen.polygon(n.poly.map(([x, y]) => [x - cx, y - cy]), { seed: 11 + cx | 0, roughness: 1.1, bowing: 0.8 });
      const outline = new Graphics();
      drawPartial(outline, flatten(dr, 0, 0, 1), 1, { width: 1.6, color: C.newsprint, alpha: 0.75 });
      ct.addChild(shadow, echo2, echo1, body, outline);
      a.stage.addChild(ct);
      return { ct, echo1, echo2, cx, cy };
    });
    // layer 3: threads + pins
    L.thread = new Graphics(); L.pins = new Graphics();
    // layer 4: paper remnant (left), stationary once present
    const remPoly = [[-20, -20], ...edge, [-20, H + 20]];
    const remShadow = new Graphics().poly(remPoly.flatMap(([x, y]) => [x + 10, y + 12])).fill({ color: C.shadow, alpha: 0.5 });
    const remFiber = new Graphics().poly([[-20, -20], ...edge.map(([x, y], i) => [x + 4 + ((i * 7) % 5), y]), [-20, H + 20]].flat()).fill({ color: C.fiber });
    const remMask = new Graphics().poly(remPoly.flat()).fill({ color: 0xffffff });
    const remPaper = new Sprite(paperTex); remPaper.mask = remMask;
    L.remnant = new Container();
    L.remnant.addChild(remShadow, remFiber, remPaper, remMask);
    // tape strips (translucent copper washi) on the remnant
    const tape = new Graphics()
      .poly([0, 0, 92, 0, 88, 24, 4, 26]).fill({ color: C.copper, alpha: 0.55 });
    tape.position.set(230, 206); tape.rotation = -0.1;
    const tape2 = new Graphics().poly([0, 0, 80, 0, 77, 22, 3, 24]).fill({ color: C.copper, alpha: 0.5 });
    tape2.position.set(548, 360); tape2.rotation = 0.22;
    L.remnant.addChild(tape, tape2);
    // bulb sketch (Rough.js pencil, seeded) — drawn progressively
    const gen = rough.generator();
    const bulb = gen.path('M45 0C-10 0 -20 80 22 110L26 150H66L70 110C112 80 102 0 45 0Z', { seed: 7, roughness: 1.3, bowing: 1.2 });
    const base1 = gen.line(30, 170, 62, 170, { seed: 8, roughness: 1 });
    const base2 = gen.line(34, 186, 58, 186, { seed: 9, roughness: 1 });
    const fil = gen.linearPath([[38, 60], [46, 88], [54, 60]], { seed: 10, roughness: 0.8 });
    const ox = 290 - 45 * 1.45, oy = 238;
    data.bulb = [...flatten(bulb, ox, oy, 1.45), ...flatten(base1, ox, oy, 1.45), ...flatten(base2, ox, oy, 1.45)];
    data.fil = flatten(fil, ox, oy, 1.45);
    L.sketch = new Graphics(); L.filament = new Graphics();
    L.remnant.addChild(L.sketch, L.filament);
    a.stage.addChild(L.remnant);
    a.stage.addChild(L.thread, L.pins);

    // layer 5: the torn-away piece (right), pivoting from its top-right corner
    const piecePoly = [...edge, [W + 40, H + 20], [W + 40, -20]];
    L.piece = new Container();
    L.pieceShadow = new Graphics().poly(piecePoly.flatMap(([x, y]) => [x + 14, y + 18])).fill({ color: C.shadow, alpha: 1 });
    const pFiber = new Graphics().poly([...edge.map(([x, y], i) => [x - 4 - ((i * 5) % 4), y]), [W + 40, H + 20], [W + 40, -20]].flat()).fill({ color: C.fiber });
    const pMask = new Graphics().poly(piecePoly.flat()).fill({ color: 0xffffff });
    const pPaper = new Sprite(paperTex); pPaper.mask = pMask;
    L.piece.addChild(L.pieceShadow, pFiber, pPaper, pMask);
    L.piece.pivot.set(W, 0); L.piece.position.set(W, 0);
    a.stage.addChild(L.piece);
    app = a;
  })().catch((err) => {
    app = null;
    console.error('[style-107] Pixi scene init failed:', err);
  });
  return ready;
}

export function render(t) {
  if (!app) return;
  // --- bulb pencil line-draw sweep, then copper filament ---
  L.sketch.clear();
  drawPartial(L.sketch, data.bulb, seg(t, 0.15, 0.7, 'io2'), { width: 2.6, color: C.ink, cap: 'round', join: 'round' });
  L.filament.clear();
  drawPartial(L.filament, data.fil, seg(t, 0.68, 0.22, 'out2'), { width: 3, color: C.copper, cap: 'round' });

  // --- paper tear: anticipation lift, then rip away ---
  const lift = seg(t, 0.78, 0.24, 'sine');
  const tear = seg(t, 1.0, 0.48, 'in2');
  L.piece.rotation = 0.035 * lift + 0.46 * tear;
  L.piece.position.set(W + 14 * lift + 1180 * tear, -8 * lift - 260 * tear);
  L.pieceShadow.alpha = 0.5 * Math.max(lift, tear > 0 ? 1 : 0);
  L.piece.visible = tear < 1;

  // --- halftone disc: radial wipe build (luminance-modulated dots) ---
  const sweep = seg(t, 1.12, 0.55, 'io2');
  L.disc.clear();
  if (sweep > 0) {
    const A = sweep * Math.PI * 2;
    for (let y = DISC.y - DISC.r; y <= DISC.y + DISC.r; y += 12) {
      for (let x = DISC.x - DISC.r; x <= DISC.x + DISC.r; x += 12) {
        const dx = x - DISC.x, dy = y - DISC.y, d = Math.hypot(dx, dy);
        if (d > DISC.r) continue;
        let ang = Math.atan2(dx, -dy); if (ang < 0) ang += Math.PI * 2;
        if (ang > A) continue;
        const lum = 1 - Math.pow(d / DISC.r, 2) * 0.55 + 0.12 * Math.sin(dx * 0.03 + dy * 0.02);
        const grow = clamp((A - ang) / 0.5);
        const rr = 3.6 * clamp(lum, 0.25, 1) * grow;
        if (rr > 0.2) L.disc.circle(x, y, rr);
      }
    }
    L.disc.fill({ color: C.teal });
  }
  // dashed construction guide ring: turns while building, drifts off & fades
  const gIn = seg(t, 1.1, 0.25), gOut = seg(t, 1.85, 0.4, 'out2');
  L.guide.clear();
  const ga = gIn * (1 - gOut);
  if (ga > 0) {
    const rot = (t - 1.1) * 0.9, R = DISC.r + 24 + 30 * gOut;
    for (let k = 0; k < 48; k++) {
      const a0 = rot + (k / 48) * Math.PI * 2, a1 = a0 + 0.07;
      L.guide.moveTo(DISC.x + Math.sin(a0) * R, DISC.y - Math.cos(a0) * R)
        .lineTo(DISC.x + Math.sin(a1) * R, DISC.y - Math.cos(a1) * R);
    }
    L.guide.stroke({ width: 2, color: C.newsprint, alpha: 0.55 * ga });
  }

  // --- cut-paper nodes: slam in with misregistered echo layers converging ---
  NODES.forEach((n, i) => {
    const o = L.nodes[i];
    const p = seg(t, n.at, 0.42, 'back');
    const pl = seg(t, n.at, 0.42);
    o.ct.visible = pl > 0;
    o.ct.alpha = clamp(pl * 4);
    o.ct.scale.set(lerp(1.35, 1, p));
    o.ct.rotation = n.rot0 * (1 - p);
    const off = 4 + 22 * (1 - pl);
    o.echo1.position.set(off, off * 0.6);
    o.echo2.position.set(off * 2, off * 1.2);
  });

  // --- copper thread draws node to node; pins appear only on arrival ---
  L.thread.clear(); L.pins.clear();
  const pinScale = {};
  const pin0 = seg(t, 1.42, 0.12, 'back');
  THREADS.forEach((th) => {
    const p = seg(t, th.at, th.dur, 'io2');
    if (p <= 0) return;
    cubicPartial(L.thread, th.c, p);
    L.thread.stroke({ width: 3, color: C.copper, cap: 'round' });
    if (p >= 1) pinScale[th.pin] = Math.max(pinScale[th.pin] || 0, seg(t, th.at + th.dur, 0.14, 'back'));
  });
  const pinAt = (x, y, s) => {
    if (s <= 0) return;
    L.pins.circle(x, y, 10 * s).fill({ color: C.newsprint });
    L.pins.circle(x, y, 7 * s).fill({ color: C.copper });
  };
  pinAt(PIN0[0], PIN0[1], pin0);
  NODES.forEach((n) => pinAt(n.pin[0], n.pin[1], pinScale[n.id] || 0));

  app.render();
}

export function whenReady() { return ready; }
