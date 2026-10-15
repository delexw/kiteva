// Origami "an idea becomes a connected system" — Three.js WebGL scene.
// All visual state is a pure function of composition time t (seconds).
// Kite folds: rigid facets on crease-hinge pivots (parent-child transforms).
// Pleated connectors: XPBD cross-section solve, precomputed once with a fixed
// step and replayed from cache (no carried state between seeks).
import * as THREE from 'three';

const W = 1280, H = 720, DURATION = 3;
const PAL = { fg: '#304347', terracotta: '#BA6F5C', sage: '#7C9A86', ivory: '#F4F0E5' };
const chroma = window.chroma;
const MAT = chroma.mix(PAL.fg, '#000000', 0.3, 'rgb').hex(); // scene-dependent cutting mat

// ---------- deterministic helpers ----------
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const prog = (t, a, b) => clamp01((t - a) / (b - a));
const inOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2); // power2.inOut
const backOut = (p) => { const c = 1.2, c3 = c + 1; return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- schedule (seconds) ----------
const S = {
  centerFlapL: [0.15, 0.6], centerFlapR: [0.4, 0.85],
  pleat: [0.75, 1.65],
  endFlapL: [1.5, 1.85], endFlapR: [1.7, 2.05],
  link: [1.55, 2.0],
  smallA: [1.85, 2.2], smallA2: [2.0, 2.35],
  smallB: [2.0, 2.35], smallB2: [2.15, 2.5],
};

// ---------- XPBD pleat solve (2D cross-section x/z) ----------
const N = 10, L = 38, D0 = 4, DF = 34, PLEAT_W = 56;
const SIM_HZ = 120, SUBSTEPS = 8;
const targetSpan = (t) => N * (D0 + (DF - D0) * inOut(prog(t, ...S.pleat)));
function solvePleats() {
  const n = N + 1;
  const x = new Float64Array(n), z = new Float64Array(n), px = new Float64Array(n), pz = new Float64Array(n);
  const vx = new Float64Array(n), vz = new Float64Array(n), w = new Float64Array(n);
  const h0 = Math.sqrt(L * L - D0 * D0);
  for (let i = 0; i < n; i++) { x[i] = i * D0; z[i] = i % 2 ? h0 : 0; w[i] = i === 0 ? 0 : 1; }
  const frames = [];
  const steps = Math.round(DURATION * SIM_HZ);
  const hstep = 1 / SIM_HZ / SUBSTEPS;
  const a2 = (c) => c / (hstep * hstep);
  let maxLenErr = 0, minZ = 0, minDx = Infinity;
  const record = () => {
    const f = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { f[2 * i] = x[i]; f[2 * i + 1] = z[i]; }
    frames.push(f);
    for (let i = 0; i < N; i++) {
      maxLenErr = Math.max(maxLenErr, Math.abs(Math.hypot(x[i + 1] - x[i], z[i + 1] - z[i]) - L));
      minDx = Math.min(minDx, x[i + 1] - x[i]);
    }
    for (let i = 0; i < n; i++) minZ = Math.min(minZ, z[i]);
  };
  record();
  for (let s = 1; s <= steps; s++) {
    const tTarget = s / SIM_HZ;
    for (let sub = 0; sub < SUBSTEPS; sub++) {
      for (let i = 0; i < n; i++) { px[i] = x[i]; pz[i] = z[i]; if (w[i]) { x[i] += vx[i] * hstep; z[i] += vz[i] * hstep; } }
      // end attachment to authored span target (compliant)
      { const i = N, C = x[i] - targetSpan(tTarget), dl = -C / (w[i] + a2(1e-7)); x[i] += w[i] * dl; }
      // pleat memory: interior hinges stay centred between neighbours (soft)
      for (let i = 1; i < N; i++) {
        const C = x[i] - 0.5 * (x[i - 1] + x[i + 1]);
        const g = [-0.5, 1, -0.5], ids = [i - 1, i, i + 1];
        let den = a2(2e-5); for (let k = 0; k < 3; k++) den += w[ids[k]] * g[k] * g[k];
        const dl = -C / den; for (let k = 0; k < 3; k++) x[ids[k]] += w[ids[k]] * g[k] * dl;
      }
      // valley hinges rest on the mat; all hinges stay above it
      for (let i = 1; i < n; i++) {
        if (i % 2 === 0) { const dl = -z[i] / (w[i] + a2(1e-8)); z[i] += w[i] * dl; }
        else if (z[i] < 0) z[i] = 0;
      }
      // inextensible panels (compliance 0)
      for (let it = 0; it < 2; it++) for (let i = 0; i < N; i++) {
        const dx = x[i + 1] - x[i], dz = z[i + 1] - z[i], len = Math.hypot(dx, dz) || 1e-9;
        const C = len - L, ws = w[i] + w[i + 1]; if (!ws) continue;
        const dl = -C / ws, nx = dx / len, nz = dz / len;
        x[i] -= w[i] * dl * nx; z[i] -= w[i] * dl * nz; x[i + 1] += w[i + 1] * dl * nx; z[i + 1] += w[i + 1] * dl * nz;
      }
      for (let i = 0; i < n; i++) { vx[i] = ((x[i] - px[i]) / hstep) * 0.995; vz[i] = ((z[i] - pz[i]) / hstep) * 0.995; }
    }
    record();
  }
  return { frames, maxLenErr, minZ, minDx };
}
const PLEATS = solvePleats();
function pleatAt(t) {
  const f = clamp01(t / DURATION) * (PLEATS.frames.length - 1);
  const i0 = Math.floor(f), i1 = Math.min(PLEATS.frames.length - 1, i0 + 1), a = f - i0;
  const A = PLEATS.frames[i0], B = PLEATS.frames[i1], out = new Float32Array(A.length);
  for (let k = 0; k < A.length; k++) out[k] = A[k] + (B[k] - A[k]) * a;
  return out;
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('origami-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(MAT, 1);
const scene = new THREE.Scene();
const TILT = THREE.MathUtils.degToRad(18);
const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 10, 6000);
camera.position.set(0, -Math.sin(TILT) * 2500, Math.cos(TILT) * 2500);
camera.up.set(0, 1, 0);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(-420, 560, 1300);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -760, right: 760, top: 520, bottom: -520, near: 100, far: 3200 });
sun.shadow.bias = -0.0006;
sun.shadow.radius = 4;
scene.add(sun);

// Stationary cutting mat with seeded grain (never animated).
function matTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1280;
  const g = c.getContext('2d'); g.fillStyle = MAT; g.fillRect(0, 0, c.width, c.height);
  const rnd = mulberry32(48);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const step = 2048 / 2560 * 40;
  for (let k = 0, xg = 0; xg <= c.width; xg += step, k++) { g.strokeStyle = chroma(PAL.sage).alpha(k % 5 ? 0.07 : 0.14).css(); g.lineWidth = k % 5 ? 1 : 1.5; g.beginPath(); g.moveTo(xg, 0); g.lineTo(xg, c.height); g.stroke(); }
  for (let k = 0, yg = 0; yg <= c.height; yg += step, k++) { g.strokeStyle = chroma(PAL.sage).alpha(k % 5 ? 0.07 : 0.14).css(); g.lineWidth = k % 5 ? 1 : 1.5; g.beginPath(); g.moveTo(0, yg); g.lineTo(c.width, yg); g.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
const mat = new THREE.Mesh(new THREE.PlaneGeometry(2560, 1600), new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 1, metalness: 0 }));
mat.receiveShadow = true;
scene.add(mat);

// ---------- paper materials ----------
const paperCache = new Map();
function paper(hex) {
  if (!paperCache.has(hex)) {
    paperCache.set(hex, {
      front: new THREE.MeshStandardMaterial({ color: hex, roughness: 0.88, metalness: 0, side: THREE.FrontSide, flatShading: true }),
      back: new THREE.MeshStandardMaterial({ color: chroma(hex).darken(0.35).hex(), roughness: 0.92, metalness: 0, side: THREE.BackSide, flatShading: true }),
      edge: new THREE.LineBasicMaterial({ color: PAL.fg, transparent: true, opacity: 0.55 }),
    });
  }
  return paperCache.get(hex);
}
function facet(points, hex) {
  // points: array of [x,y] in the facet's local frame (z=0), CCW seen from +z
  const g = new THREE.BufferGeometry();
  const pos = [];
  for (let i = 1; i < points.length - 1; i++) pos.push(...points[0], 0, ...points[i], 0, ...points[i + 1], 0);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const m = paper(hex), grp = new THREE.Group();
  const f = new THREE.Mesh(g, m.front), b = new THREE.Mesh(g, m.back);
  f.castShadow = b.castShadow = true; f.receiveShadow = true;
  grp.add(f, b);
  for (const dz of [0.15, -0.15]) { // crease edges visible from either paper side
    const loop = points.map((p) => new THREE.Vector3(p[0], p[1], dz));
    grp.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loop), m.edge));
  }
  return grp;
}

// Kite base from one square sheet: half-diagonal s, diagonal vertical.
// Creases run from the top corner T along the 22.5° bisectors to P on the lower edges.
function makeKite(s, hex) {
  const T = [0, s], B = [0, -s], Lc = [-s, 0], Rc = [s, 0];
  const Pl = [-0.5858 * s, -0.4142 * s], Pr = [0.5858 * s, -0.4142 * s];
  const root = new THREE.Group();
  const body = facet([T, Pl, B, Pr], hex); root.add(body);
  // diagonal valley crease on the body
  const crease = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, s, 0.2), new THREE.Vector3(0, -s, 0.2)]), new THREE.LineDashedMaterial({ color: PAL.fg, dashSize: 5, gapSize: 4, transparent: true, opacity: 0.5 }));
  crease.computeLineDistances(); body.add(crease);
  const mkFlap = (corner, P) => {
    const pivot = new THREE.Group(); pivot.position.set(T[0], T[1], 0); // hinge at T, child of body
    const local = [[0, 0], [corner[0] - T[0], corner[1] - T[1]], [P[0] - T[0], P[1] - T[1]]];
    if (corner[0] > 0) local.reverse();
    const f = facet(local, hex); pivot.add(f);
    const axis = new THREE.Vector3(P[0] - T[0], P[1] - T[1], 0).normalize();
    body.add(pivot);
    return { pivot, axis, dir: corner[0] < 0 ? -1 : 1 };
  };
  const fl = mkFlap(Lc, Pl), fr = mkFlap(Rc, Pr);
  const q = new THREE.Quaternion();
  return {
    root,
    // a, b in [0,1]: fold progress of left/right flap (valley fold onto the diagonal)
    setFold(a, b) {
      for (const [flap, p] of [[fl, a], [fr, b]]) {
        q.setFromAxisAngle(flap.axis, flap.dir * Math.PI * p);
        flap.pivot.quaternion.copy(q);
        flap.pivot.position.z = 1.2 * p; // paper layer thickness: folded flap lies on top
      }
    },
  };
}

// Pleated connector panels (rigid rectangles placed on solved hinges).
function makeStrip(hex, mirrored) {
  const grp = new THREE.Group(); if (mirrored) grp.rotation.z = Math.PI;
  const panels = [];
  for (let i = 0; i < N; i++) {
    const g = new THREE.PlaneGeometry(L, PLEAT_W);
    const m = paper(hex);
    const p = new THREE.Group();
    const f = new THREE.Mesh(g, m.front), b = new THREE.Mesh(g, m.back);
    f.castShadow = b.castShadow = true; f.receiveShadow = b.receiveShadow = true;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), m.edge);
    p.add(f, b, e); grp.add(p); panels.push(p);
  }
  scene.add(grp);
  return {
    set(state) {
      for (let i = 0; i < N; i++) {
        const x0 = state[2 * i], z0 = state[2 * i + 1], x1 = state[2 * i + 2], z1 = state[2 * i + 3];
        panels[i].position.set((x0 + x1) / 2, 0, (z0 + z1) / 2 + 0.5);
        panels[i].rotation.set(0, -Math.atan2(z1 - z0, x1 - x0), 0);
      }
    },
  };
}

const stripR = makeStrip(PAL.sage, false), stripL = makeStrip(PAL.sage, true);
const center = makeKite(150, PAL.terracotta);
const endL = makeKite(85, PAL.sage), endR = makeKite(85, PAL.sage);
const smallA = makeKite(52, PAL.sage), smallB = makeKite(52, PAL.sage);
const SMALL_A = new THREE.Vector2(-235, 132), SMALL_B = new THREE.Vector2(235, -138);
for (const k of [center, endL, endR, smallA, smallB]) scene.add(k.root);
smallA.root.position.set(SMALL_A.x, SMALL_A.y, 0.8);
smallB.root.position.set(SMALL_B.x, SMALL_B.y, 0.8);

// Scored crease links on the mat (drawn from the centre outward).
function makeLink(to) {
  const pts = []; const SEG = 60;
  for (let i = 0; i <= SEG; i++) pts.push(new THREE.Vector3(to.x * i / SEG, to.y * i / SEG, 0.6));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: PAL.ivory, dashSize: 7, gapSize: 6, transparent: true, opacity: 0.6 }));
  line.computeLineDistances(); scene.add(line);
  return { set(p) { const n = Math.round(p * SEG) + 1; line.geometry.setDrawRange(0, p <= 0 ? 0 : n); line.visible = p > 0; } };
}
const linkA = makeLink(SMALL_A), linkB = makeLink(SMALL_B);

// ---------- validation (fold order, rigidity, self-intersection) ----------
const validation = {
  pleatMaxLengthError: PLEATS.maxLenErr,
  pleatMinHingeZ: PLEATS.minZ,
  pleatMinHingeAdvance: PLEATS.minDx,
  foldOrder: S.centerFlapL[0] < S.centerFlapR[0] && S.centerFlapR[1] <= S.pleat[1] && S.pleat[1] <= S.endFlapL[1] && S.endFlapL[0] < S.endFlapR[0] && S.link[0] < S.smallA[0],
  layering: 'flaps hinge at the top corner and land 1.2 units above the body; centre kite rides 3 units above the tallest pleat ridge',
};
validation.ok = validation.pleatMaxLengthError < 1.0 && validation.pleatMinHingeZ > -0.5 && validation.pleatMinHingeAdvance > 0 && validation.foldOrder;
window.__origamiValidation = validation;
if (!validation.ok) console.error('Origami fold validation failed', validation);

// ---------- pure state evaluation ----------
function ridge(state) { let m = 0; for (let i = 1; i < N + 1; i += 2) m = Math.max(m, state[2 * i + 1]); return m; }
function renderAt(t) {
  t = Math.min(DURATION, Math.max(0, t));
  const st = pleatAt(t);
  stripR.set(st); stripL.set(st);
  const span = st[2 * N], h = ridge(st);
  center.root.position.set(0, 0, h + 3);
  center.setFold(inOut(prog(t, ...S.centerFlapL)), inOut(prog(t, ...S.centerFlapR)));
  const lastRidge = st[2 * (N - 1) + 1];
  endR.root.position.set(span, 0, lastRidge + 1.5);
  endL.root.position.set(-span, 0, lastRidge + 1.5);
  const eL = inOut(prog(t, ...S.endFlapL)), eR = inOut(prog(t, ...S.endFlapR));
  endR.setFold(eL, eR); endL.setFold(eL, eR);
  const lp = inOut(prog(t, ...S.link)); linkA.set(lp); linkB.set(lp);
  smallA.setFold(backOutClamp(prog(t, ...S.smallA)), backOutClamp(prog(t, ...S.smallA2)));
  smallB.setFold(backOutClamp(prog(t, ...S.smallB)), backOutClamp(prog(t, ...S.smallB2)));
  renderer.render(scene, camera);
}
// back.out overshoot would push a flap through its own body; clamp to 1 (contact).
function backOutClamp(p) { return Math.min(1, backOut(p)); }

// ---------- export pure renderer; the composition HTML owns the GSAP timeline ----------
window.__origamiScene = { renderAt, duration: DURATION };
renderAt(0);
