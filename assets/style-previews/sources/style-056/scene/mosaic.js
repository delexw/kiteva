// Mosaic (style-056) — "An idea becomes a connected system"
// Three.js InstancedMesh tesserae (fallback for the reviewed Blender/Cycles route,
// which cannot launch in this sandbox). Every tile stores an exact target
// transform; render(t) evaluates flips / travel / return as pure functions of
// composition time. No clocks, no carried state, seeded randomness only.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const PAL = {
  wall: '#1A2022', grout: '#0E1213', field: '#1F2A30', slate: '#39494B',
  teal: '#47777B', terracotta: '#9B694C', gold: '#B19A61', limestone: '#E4D8BE',
  bisque: '#5E5852', plaque: '#141A1C',
};
export const PLAQUE = [586, 556, 1016, 646];

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sineIO = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
const pow2IO = (x) => { x = clamp01(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) {
  const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const t = clamp01(((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2);
  return dist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}

// ---------- layout (follows ILLUSTRATION composition, composition pixels)
const BULB_C = [340, 350], BULB_R = 196, GLASS_C = [340, 310], GLASS_R = 98;
const BASE = [296, 404, 384, 468];
const FIL = [[318, 360], [318, 300], [340, 280], [362, 300], [362, 360]];
const NODES = { A: [760, 190], B: [1000, 250], C: [1140, 150], D: [780, 470], E: [1080, 520], F: [1140, 380] };
const S1 = [540, 300], S2 = [540, 400];
const EDGES = [[S1, 'A'], ['A', 'B'], ['B', 'C'], [S2, 'D'], ['D', 'B'], ['D', 'E'], ['E', 'F'], ['F', 'B']];
const INNER = [66, 66, 1214, 654];
const H = 6; // tile thickness in px
const pt = (k) => (typeof k === 'string' ? NODES[k] : k);

const ND = {};
for (let it = 0; it < 10; it++) for (const [a, b] of EDGES) {
  const L = dist(pt(a), pt(b));
  const da = typeof a === 'string' ? (ND[a] ?? 1e9) : 0, db = ND[b] ?? 1e9;
  if (da + L < db) ND[b] = da + L;
  if (typeof a === 'string' && db + L < (ND[a] ?? 1e9)) ND[a] = db + L;
}
const DMAX = Math.max(...Object.values(ND));
const cascade = (d) => 0.92 + (d / DMAX) * 0.72;

export function buildTiles() {
  const R = mulberry(56);
  const U = (a, b) => a + (b - a) * R();
  const tiles = [];
  const add = (kind, col, px, py, w, h = w, rot = 0, jitter = 0.06, group = 'field') => {
    const v = 1 + U(-jitter, jitter), hue = U(-0.02, 0.02);
    const c = new THREE.Color(col);
    c.setRGB(Math.min(1, c.r * v * (1 + hue)), Math.min(1, c.g * v), Math.min(1, c.b * v * (1 - hue)));
    const rec = { kind, color: c, px, py, w, h, rot: rot + U(-0.04, 0.04), tx: U(-0.05, 0.05), ty: U(-0.05, 0.05), group };
    tiles.push(rec);
    return rec;
  };
  const ring = (inset, pitch, size, col, kind = 'stone', jitter = 0.05) => {
    const x0 = inset, y0 = inset, x1 = 1280 - inset, y1 = 720 - inset;
    const n = Math.floor((x1 - x0) / pitch), m = Math.floor((y1 - y0) / pitch);
    for (let i = 0; i <= n; i++) { const px = x0 + (i * (x1 - x0)) / n; add(kind, col, px, y0, size, size, 0, jitter, 'border'); add(kind, col, px, y1, size, size, 0, jitter, 'border'); }
    for (let j = 1; j < m; j++) { const py = y0 + (j * (y1 - y0)) / m; add(kind, col, x0, py, size, size, 0, jitter, 'border'); add(kind, col, x1, py, size, size, 0, jitter, 'border'); }
  };
  ring(34, 18, 15, PAL.slate);
  ring(48, 12, 6, PAL.limestone, 'stone', 0.03);
  ring(59, 14, 11, PAL.terracotta);

  const occupied = (p, pad = 0) => {
    if (dist(p, BULB_C) < 224 + pad) return true;
    for (const c of Object.values(NODES)) if (dist(p, c) < 56 + pad) return true;
    for (const [a, b] of EDGES) if (segDist(p, pt(a), pt(b)) < 12 + pad) return true;
    const [x0, y0, x1, y1] = PLAQUE;
    return p[0] > x0 - 6 - pad && p[0] < x1 + 6 + pad && p[1] > y0 - 6 - pad && p[1] < y1 + 6 + pad;
  };
  const pitch = 20;
  const cols = Math.floor((INNER[2] - INNER[0]) / pitch), rows = Math.floor((INNER[3] - INNER[1]) / pitch);
  const ox = INNER[0] + ((INNER[2] - INNER[0]) - cols * pitch) / 2 + pitch / 2;
  const oy = INNER[1] + ((INNER[3] - INNER[1]) - rows * pitch) / 2 + pitch / 2;
  const cells = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const p = [ox + i * pitch, oy + j * pitch]; if (!occupied(p)) cells.push(p); }
  const SR = mulberry(5602);
  const cand = cells.filter((c) => !occupied(c, 30));
  const stars = new Set();
  while (stars.size < 16 && cand.length) stars.add(cand.splice(Math.floor(SR() * cand.length), 1)[0]);
  for (const p of cells) {
    if (stars.has(p)) add('gold', PAL.gold, p[0], p[1], 14, 14, Math.PI / 4, 0.05, 'star');
    else add('stone', PAL.field, p[0], p[1], 17, 17, 0, 0.1, 'field');
  }
  for (let i = 0; i < 96; i++) { const a = (2 * Math.PI * i) / 96; add('stone', PAL.slate, BULB_C[0] + 216 * Math.cos(a), BULB_C[1] + 216 * Math.sin(a), 12, 12, a, 0.06, 'ring'); }
  for (let i = 0; i < 104; i++) { const a = (2 * Math.PI * (i + 0.5)) / 104; add('gold', PAL.gold, BULB_C[0] + 204 * Math.cos(a), BULB_C[1] + 204 * Math.sin(a), 8, 8, a, 0.04, 'ring'); }

  const STRAYS = [[255, 235], [435, 465], [205, 425]];
  for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++) {
    const p = [BULB_C[0] + i * 20, BULB_C[1] + j * 20];
    if (dist(p, BULB_C) > 188 || dist(p, GLASS_C) < GLASS_R + 6) continue;
    if (p[0] > BASE[0] - 6 && p[0] < BASE[2] + 6 && p[1] > BASE[1] - 6 && p[1] < BASE[3] + 6) continue;
    if (STRAYS.some((s) => dist(p, s) < 11)) add('gold', PAL.gold, p[0], p[1], 12, 12, 0.35, 0.06, 'teal');
    else add('glass', PAL.teal, p[0], p[1], 17, 17, 0, 0.08, 'teal');
  }
  const fil = [];
  for (let s = 0; s < FIL.length - 1; s++) {
    const a = FIL[s], b = FIL[s + 1], n = Math.max(1, Math.floor(dist(a, b) / 11));
    const last = s === FIL.length - 2 ? 1 : 0;
    for (let k = 0; k < n + last; k++) { const t = k / n; fil.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])]); }
  }
  const c45 = Math.SQRT1_2;
  for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++) {
    const u = i * 14, v = j * 14, p = [GLASS_C[0] + u * c45 - v * c45, GLASS_C[1] + u * c45 + v * c45];
    if (dist(p, GLASS_C) > GLASS_R - 4 || fil.some((f) => dist(p, f) < 9)) continue;
    add('gold', PAL.gold, p[0], p[1], 11.5, 11.5, Math.PI / 4, 0.07, 'bulb');
  }
  for (const f of fil) add('stone', PAL.slate, f[0], f[1], 9, 9, -f[2], 0.06, 'filament');
  for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) add('stone', PAL.terracotta, BASE[0] + 12 + i * 16, BASE[1] + 8 + j * 16, 13, 13, 0, 0.06, 'base');

  for (const [a, b] of EDGES) {
    const pa = pt(a), pb = pt(b), L = dist(pa, pb), ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
    const da = typeof a === 'string' ? ND[a] : 0, db = ND[b], n = Math.floor(L / 18);
    for (let k = 0; k <= n; k++) {
      const s = (k * L) / n, p = [pa[0] + ((pb[0] - pa[0]) * s) / L, pa[1] + ((pb[1] - pa[1]) * s) / L];
      if (dist(p, BULB_C) < 226 || Object.values(NODES).some((c) => dist(p, c) < 54)) continue;
      const r = add('stone', PAL.terracotta, p[0], p[1], 14, 10, -ang, 0.07, 'link');
      r.d = Math.min(da + s, db + (L - s));
    }
  }
  for (const [key, c] of Object.entries(NODES)) {
    for (let i = 0; i < 30; i++) { const a = (2 * Math.PI * i) / 30; const r = add('stone', PAL.slate, c[0] + 46 * Math.cos(a), c[1] + 46 * Math.sin(a), 11, 11, a, 0.06, 'node'); r.node = key; r.rad = 46; }
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      const u = i * 12, v = j * 12, p = [c[0] + u * c45 - v * c45, c[1] + u * c45 + v * c45], rr = dist(p, c);
      if (rr > 36) continue;
      const r = add('gold', PAL.gold, p[0], p[1], 10, 10, Math.PI / 4, 0.07, 'node'); r.node = key; r.rad = rr;
    }
  }
  // ---- stored motion schedule (target = exact cell; motion returns there)
  const M = mulberry(5650);
  const MU = (a, b) => a + (b - a) * M();
  for (const r of tiles) {
    r.mode = 'still';
    if (r.group === 'teal') { r.mode = 'flip'; r.axis = 0; r.t0 = 0.16 + (dist([r.px, r.py], BULB_C) / BULB_R) * 0.5 + MU(0, 0.04); r.dur = 0.34; }
    else if (r.group === 'bulb' || r.group === 'filament' || r.group === 'base') { r.mode = 'flip'; r.axis = 1; r.t0 = 0.42 + (dist([r.px, r.py], GLASS_C) / 120) * 0.32 + MU(0, 0.03); r.dur = 0.32; }
    else if (r.group === 'link') {
      r.mode = 'travel'; r.t0 = cascade(r.d) - 0.12; r.dur = 0.36;
      const a = MU(0, Math.PI * 2), m = MU(35, 70);
      r.sx = Math.cos(a) * m; r.sy = Math.sin(a) * m; r.srot = MU(-1.1, 1.1);
    } else if (r.group === 'node') { r.mode = 'flip'; r.axis = r.rad < 40 ? 1 : 0; r.t0 = cascade(ND[r.node]) + 0.02 + (r.rad / 46) * 0.08; r.dur = 0.32; }
  }
  return tiles;
}

// pose of one tile at time t (composition px; z up). Pure function.
export function poseAt(r, t) {
  let x = r.px, y = r.py, z = H / 2, flip = 0, spin = 0;
  if (r.mode === 'flip') {
    const u = clamp01((t - r.t0) / r.dur);
    flip = Math.PI * (1 - sineIO(u));          // face-down (bisque) -> glazed face up
    z += 14 * Math.sin(Math.PI * u);            // lift clears neighbours, lands exactly
  } else if (r.mode === 'travel') {
    const u = clamp01((t - r.t0) / r.dur), e = pow2IO(u);
    x += r.sx * (1 - e); y += r.sy * (1 - e);
    spin = r.srot * (1 - e);
    z += (u <= 0 ? H + 1 : (H + 1) * (1 - e)) + 20 * Math.sin(Math.PI * u);
  }
  return { x, y, z, flip, spin };
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(1280, 720, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.wall);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const cam = new THREE.OrthographicCamera(-640, 640, 360, -360, 1, 4000);
  cam.position.set(0, 0, 1500); cam.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xffe8c8, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -700, right: 700, top: 420, bottom: -420, near: 10, far: 4000 });
  key.shadow.bias = -0.0008; key.shadow.radius = 3;
  scene.add(key); scene.add(key.target);
  const fill = new THREE.HemisphereLight(0xcfdcff, 0x1a1410, 0.5);
  scene.add(fill);

  // wall: seeded stone noise texture (static), grout bed, polished plaque
  const wc = document.createElement('canvas'); wc.width = 640; wc.height = 360;
  const wx = wc.getContext('2d'); const WR = mulberry(77);
  wx.fillStyle = PAL.wall; wx.fillRect(0, 0, 640, 360);
  for (let i = 0; i < 2600; i++) { const v = WR(); wx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)'; const s = 2 + WR() * 10; wx.fillRect(WR() * 640, WR() * 360, s, s); }
  const wtex = new THREE.CanvasTexture(wc); wtex.colorSpace = THREE.SRGBColorSpace;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1400, 840), new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.95 }));
  wall.position.z = -2; wall.receiveShadow = true; scene.add(wall);
  const grout = new THREE.Mesh(new THREE.PlaneGeometry(1228, 668), new THREE.MeshStandardMaterial({ color: PAL.grout, roughness: 0.95 }));
  grout.receiveShadow = true; scene.add(grout);
  const [qx0, qy0, qx1, qy1] = PLAQUE;
  const plq = new THREE.Mesh(new RoundedBoxGeometry(qx1 - qx0 + 8, qy1 - qy0 + 8, 5, 2, 2), new THREE.MeshPhysicalMaterial({ color: PAL.plaque, roughness: 0.3, clearcoat: 0.6 }));
  plq.position.set((qx0 + qx1) / 2 - 640, 360 - (qy0 + qy1) / 2, 2.5); plq.receiveShadow = true; plq.castShadow = true; scene.add(plq);

  const tiles = buildTiles();
  const mats = {
    stone: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0, clearcoat: 0.15, envMapIntensity: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.06, ior: 1.52, specularIntensity: 1, envMapIntensity: 1.0 }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.26, metalness: 1, clearcoat: 0.3, envMapIntensity: 1.25 }),
  };
  const bisqueMat = new THREE.MeshStandardMaterial({ color: PAL.bisque, roughness: 0.92 });
  const body = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
  const back = new THREE.PlaneGeometry(0.92, 0.92); back.rotateX(Math.PI); back.translate(0, 0, -0.502);
  const groups = {};
  for (const kind of Object.keys(mats)) {
    const list = tiles.filter((r) => r.kind === kind);
    const im = new THREE.InstancedMesh(body, mats[kind], list.length);
    const bm = new THREE.InstancedMesh(back, bisqueMat, list.length);
    im.castShadow = true; im.receiveShadow = true; bm.receiveShadow = true;
    list.forEach((r, i) => im.setColorAt(i, r.color));
    im.instanceColor.needsUpdate = true;
    im.frustumCulled = false; bm.frustumCulled = false;
    scene.add(im); scene.add(bm);
    groups[kind] = { list, im, bm };
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'ZYX'), pos = new THREE.Vector3(), scl = new THREE.Vector3();

  function render(t) {
    t = Math.max(0, Math.min(3, t));
    // fade up from darkness (0–0.55 s), restrained highlight drift that stops at 2.3 s
    const lit = 0.12 + 0.88 * sineIO(t / 0.55);
    const drift = sineIO(t / 2.3);
    key.intensity = 0.95 * lit; fill.intensity = 0.3 * lit; scene.environmentIntensity = 0.55 * lit;
    key.position.set(-700 + 300 * drift, 520, 900); key.target.position.set(0, 0, 0);
    scene.environmentRotation.set(0.35, -0.5 + 0.6 * drift, 0);
    scene.backgroundIntensity = 1;
    wall.material.color.setScalar(0.35 + 0.65 * lit); grout.material.color.set(PAL.grout).multiplyScalar(0.35 + 0.65 * lit);
    for (const kind in groups) {
      const { list, im, bm } = groups[kind];
      for (let i = 0; i < list.length; i++) {
        const r = list[i], p = poseAt(r, t);
        pos.set(p.x - 640, 360 - p.y, p.z);
        // world rotation: z-spin of the cell, then tile's own flip axis + seeded micro-tilt
        e.set(r.tx + (r.axis === 0 ? p.flip : 0), r.ty + (r.axis === 1 ? p.flip : 0), -(r.rot + p.spin), 'ZYX');
        q.setFromEuler(e);
        scl.set(r.w, r.h, H);
        m4.compose(pos, q, scl);
        im.setMatrixAt(i, m4); bm.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true; bm.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, cam);
  }
  return { render, tileCount: tiles.length };
}

if (typeof window !== 'undefined') window.MosaicScene = { createScene, PAL, PLAQUE };
