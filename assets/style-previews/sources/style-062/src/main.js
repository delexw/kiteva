// style-062 Particle Art — "an idea becomes a connected system"
// Style renderer: Three.js + Points (ShaderMaterial, BufferGeometry) + UnrealBloomPass.
// Motion owners: GLSL evaluates every per-particle position analytically from uniforms;
// GSAP (paused timeline in index.html) is the only writer of those uniforms (via `proxy`).
// Nothing is integrated frame-to-frame, so any seek (forward, backward, direct) is exact.
import {
  WebGLRenderer, Scene, PerspectiveCamera, BufferGeometry, BufferAttribute, Points,
  ShaderMaterial, AdditiveBlending, Color, Vector2, SRGBColorSpace, NoToneMapping
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ---------- shared tokens ----------
const W = 1280, H = 720;
const PAL = { bg: '#111C29', fg: '#EFF5EE', cool: '#65BEC2', warm: '#CEAF79' };
const C = {
  cool: new Color(PAL.cool), warm: new Color(PAL.warm), hi: new Color(PAL.fg)
}; // THREE.Color converts sRGB hex to linear working space; OutputPass converts back.

// ---------- seeded PRNG ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(62062);
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };

// pixel (SVG reference) -> world (origin at frame centre, y up, z toward camera)
const wx = px => px - W / 2;
const wy = py => H / 2 - py;

// ---------- pose B: the connected-system silhouette (pixel space, from ILLUSTRATION.svg) ----------
const B = [];   // entries: [px, py, z, color, size, alpha, group]
function push(px, py, z, col, size, alpha, group = 0) { B.push([px, py, z, col, size, alpha, group]); }

// Bulb SDF-ish shape: circle (420,330) r110 ∪ neck 352..488 × 380..456
const BC = { x: 420, y: 330, r: 110 };
function inBulb(x, y) {
  const d = Math.hypot(x - BC.x, y - BC.y);
  return d <= BC.r || (y >= 380 && y <= 456 && Math.abs(x - BC.x) <= 68);
}
// outline polyline (arc + neck sides + bottom)
const outline = [];
{
  const a0 = Math.atan2(416 - BC.y, 488 - BC.x); // right join (~0.90 rad)
  const a1 = Math.PI - a0;                       // left join
  // arc from right join, going up (negative angle in screen space) to left join
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const a = a0 - (i / steps) * (2 * Math.PI - (a1 - a0));
    outline.push([BC.x + BC.r * Math.cos(a), BC.y + BC.r * Math.sin(a)]);
  }
  outline.push([352, 456], [488, 456], [488, 416]);
}
function samplePolyline(pts) {
  const seg = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); total += l; }
  return () => {
    let r = rnd() * total, i = 0;
    while (i < seg.length - 1 && r > seg[i]) { r -= seg[i]; i++; }
    const t = seg[i] > 0 ? r / seg[i] : 0;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
  };
}
const bulbZ = (x, y) => { const d = Math.hypot(x - BC.x, y - BC.y); return d < BC.r ? Math.sqrt(BC.r * BC.r - d * d) * 0.18 : 0; };

// 1) bulb outline (gold, readable edge)
{
  const s = samplePolyline(outline);
  for (let i = 0; i < 7600; i++) {
    const [x, y] = s();
    const j = Math.abs(gauss()) * 2.6;
    const dx = x - BC.x, dy = y - BC.y, l = Math.hypot(dx, dy) || 1;
    const px = x - (dx / l) * j, py = y - (dy / l) * j;
    const hi = rnd() < 0.14;
    push(px, py, bulbZ(px, py), hi ? C.hi : C.warm, hi ? 2.4 : 2.9, hi ? 0.75 : 0.62);
  }
}
// 2) bulb body (gold glass fill, sparser)
for (let n = 0; n < 6400;) {
  const x = 300 + rnd() * 240, y = 215 + rnd() * 245;
  if (!inBulb(x, y)) continue;
  const hi = rnd() < 0.08;
  push(x, y, bulbZ(x, y), hi ? C.hi : C.warm, hi ? 2.2 : 2.4, hi ? 0.5 : 0.3); n++;
}
// 3) filament + bright core (highlights)
{
  const fil = [[402, 452], [404, 372], [396, 340], [410, 322], [420, 340], [430, 322], [444, 340], [436, 372], [438, 452]];
  const s = samplePolyline(fil);
  for (let i = 0; i < 1300; i++) { const [x, y] = s(); push(x + gauss() * 1.2, y + gauss() * 1.2, 22, C.hi, 2.4, 0.7); }
  for (let i = 0; i < 500; i++) { push(420 + gauss() * 6, 320 + gauss() * 6, 24, C.hi, 3.2, 0.7); }
}
// 4) base / screw bands (teal)
for (const [y0, x0, x1] of [[466, 370, 470], [478, 372, 468], [490, 380, 460]]) {
  for (let i = 0; i < 1000; i++) {
    const hi = rnd() < 0.12;
    push(x0 + rnd() * (x1 - x0), y0 + rnd() * 8, 0, hi ? C.hi : C.cool, 2.6, hi ? 0.7 : 0.6);
  }
}
// 5) warm halo (sparse, faint, around the bulb)
for (let n = 0; n < 2200;) {
  const x = 420 + gauss() * 80, y = 335 + gauss() * 80;
  if (Math.hypot(x - 420, y - 335) > 175) continue;
  push(x, y, -30, C.warm, 3.6, 0.12); n++;
}
// 6) dotted links (cubic béziers from the reference)
const links = [
  { p: [[500, 300], [620, 220], [720, 200], [820, 210]], col: C.cool, w: 2.0 },
  { p: [[505, 380], [640, 440], [760, 470], [880, 470]], col: C.cool, w: 2.0 },
  { p: [[820, 210], [900, 260], [960, 300], [1030, 330]], col: C.hi, w: 1.6 },
  { p: [[880, 470], [940, 420], [990, 380], [1030, 330]], col: C.hi, w: 1.6 },
  { p: [[820, 210], [840, 297], [860, 383], [880, 470]], col: C.cool, w: 1.3 }
];
const bez = (P, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]); };
for (const L of links) {
  const poly = []; for (let i = 0; i <= 80; i++) poly.push(bez(L.p, i / 80));
  let len = 0; for (let i = 0; i < 80; i++) len += Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
  const dots = Math.floor(len / 12);
  for (let d = 0; d <= dots; d++) {
    const c = bez(L.p, d / dots);
    for (let k = 0; k < 26; k++) push(c[0] + gauss() * L.w, c[1] + gauss() * L.w, 0, L.col, 2.4, 0.55);
  }
}
// 7) nodes (teal discs, bright centres) — group 1 receives the finale flash
const NODES = [[820, 210], [880, 470], [1030, 330]];
for (const [cx, cy] of NODES) {
  for (let i = 0; i < 2200; i++) {
    const ring = rnd() < 0.62;
    const r = ring ? 30 + gauss() * 1.6 : 34 * Math.sqrt(rnd());
    const a = rnd() * 6.2831853;
    const hi = rnd() < 0.1;
    push(cx + r * Math.cos(a), cy + r * Math.sin(a), 0, hi ? C.hi : C.cool, ring ? 2.6 : 2.3, ring ? 0.6 : 0.3, 1);
  }
  for (let i = 0; i < 320; i++) push(cx + gauss() * 3.2, cy + gauss() * 3.2, 4, C.hi, 3, 0.7, 1);
}

// density (8px grid) -> size and brightness modulation
const N = B.length;
{
  const cell = 8, grid = new Map();
  const key = (x, y) => ((x / cell) | 0) * 1000 + ((y / cell) | 0);
  for (const b of B) { const k = key(b[0], b[1]); grid.set(k, (grid.get(k) || 0) + 1); }
  for (const b of B) {
    const dn = Math.min(1, (grid.get(key(b[0], b[1])) || 1) / 40);
    b.push(dn);
  }
}

// ---------- pose A: drifting sphere shell (world space, before rotation) ----------
const SPHERE_R = 195;
const posA = new Float32Array(N * 3), posB = new Float32Array(N * 3), col = new Float32Array(N * 3);
const aSeed = new Float32Array(N), aSize = new Float32Array(N), aAlpha = new Float32Array(N), aGroup = new Float32Array(N), aDens = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const b = B[i];
  const u = rnd() * 2 - 1, th = rnd() * 6.2831853, s = Math.sqrt(1 - u * u);
  const r = SPHERE_R * (0.86 + 0.14 * Math.cbrt(rnd()));
  posA[i * 3] = r * s * Math.cos(th); posA[i * 3 + 1] = r * u; posA[i * 3 + 2] = r * s * Math.sin(th);
  posB[i * 3] = wx(b[0]); posB[i * 3 + 1] = wy(b[1]); posB[i * 3 + 2] = b[2];
  col[i * 3] = b[3].r; col[i * 3 + 1] = b[3].g; col[i * 3 + 2] = b[3].b;
  // stagger: particles nearer the bulb settle first, links and nodes later (left → right flow)
  aSeed[i] = Math.min(1, Math.max(0, (b[0] - 300) / 780 * 0.75 + rnd() * 0.25));
  aSize[i] = b[4]; aAlpha[i] = b[5]; aGroup[i] = b[6]; aDens[i] = b[7];
}
const geo = new BufferGeometry();
geo.setAttribute('position', new BufferAttribute(posA, 3));
geo.setAttribute('aB', new BufferAttribute(posB, 3));
geo.setAttribute('aColor', new BufferAttribute(col, 3));
geo.setAttribute('aSeed', new BufferAttribute(aSeed, 1));
geo.setAttribute('aSize', new BufferAttribute(aSize, 1));
geo.setAttribute('aAlpha', new BufferAttribute(aAlpha, 1));
geo.setAttribute('aGroup', new BufferAttribute(aGroup, 1));
geo.setAttribute('aDens', new BufferAttribute(aDens, 1));

const FOV = 35;
const CAM_Z = (H / 2) / Math.tan((FOV / 2) * Math.PI / 180);

const FRAG = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.25, d);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(vColor, min(vAlpha * a, 0.85)); // additive, alpha-capped soft disc
  }`;

const mainMat = new ShaderMaterial({
  uniforms: {
    uTime: { value: 0 }, uMorph: { value: 0 }, uFlash: { value: 0 },
    uCenterA: { value: [0, 70, 0] }, uCamZ: { value: CAM_Z }
  },
  vertexShader: /* glsl */`
    uniform float uTime, uMorph, uFlash, uCamZ; uniform vec3 uCenterA;
    attribute vec3 aB; attribute vec3 aColor;
    attribute float aSeed, aSize, aAlpha, aGroup, aDens;
    varying vec3 vColor; varying float vAlpha;
    void main() {
      // staggered ease of the morph (smootherstep), seed-delayed
      float m = clamp((uMorph - aSeed * 0.4) / 0.6, 0.0, 1.0);
      m = m * m * m * (m * (m * 6.0 - 15.0) + 10.0);
      // pose A: sphere slowly turning (analytic in uTime)
      float ang = 0.35 + uTime * 0.55;
      float c = cos(ang), s = sin(ang);
      vec3 a = position;
      a.xz = mat2(c, -s, s, c) * a.xz;
      float tilt = 0.32; float ct = cos(tilt), st = sin(tilt);
      a.yz = mat2(ct, -st, st, ct) * a.yz;
      a += uCenterA;
      vec3 p = mix(a, aB, m);
      // analytic curl-like flow offset; zero once the particle has settled (m = 1)
      vec3 q = p * 0.009 + aSeed * 6.2831;
      vec3 curl = vec3(
        sin(q.y * 2.1 + uTime * 1.3) - cos(q.z * 1.7 + uTime * 0.9),
        sin(q.z * 1.9 + uTime * 1.1) - cos(q.x * 2.3 + uTime * 1.4),
        sin(q.x * 1.6 + uTime * 1.2) - cos(q.y * 1.8 + uTime * 0.8));
      float amp = (1.0 - m) * 9.0 + sin(3.14159265 * m) * 38.0;
      p += curl * amp;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float persp = uCamZ / -mv.z;
      // density -> smaller, dimmer-per-point in crowded regions (keeps edges legible under bloom)
      float sz = aSize * mix(1.15, 0.85, aDens) * mix(1.15, 1.0, m);
      float flash = aGroup * uFlash;
      gl_PointSize = sz * persp * (1.0 + 0.35 * flash);
      float bright = mix(0.75, 1.0, m) * (1.0 + 0.9 * flash);
      vColor = aColor * bright;
      vAlpha = mix(max(aAlpha, 0.35), aAlpha, m) * mix(1.0, 0.8, aDens);
    }`,
  fragmentShader: FRAG,
  transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending
});
const mainPoints = new Points(geo, mainMat);
mainPoints.frustumCulled = false;

// ---------- particle_spectacle recipe: ignition sparks with analytic trajectories ----------
// p(t) = p0 + v·t + ½g·t² ; trails are the same formula sampled at earlier times.
const TRAIL = 8, G = -260;
const sparks = [];
const core = [wx(420), wy(320), 24];
// (a) radial ignition burst from the bulb core
for (let i = 0; i < 240; i++) {
  const a = rnd() * 6.2831853, sp = 130 + rnd() * 130;
  const birth = 1.40 + rnd() * 0.18, life = 0.38 + rnd() * 0.22;
  sparks.push({ v: [Math.cos(a) * sp, Math.sin(a) * sp + 60, 0], birth, life, col: rnd() < 0.5 ? C.warm : C.hi });
}
// (b) messenger sparks aimed to land on each node at t = birth + life (ballistic solve)
for (const [nx, ny] of NODES) {
  const tx = wx(nx), ty = wy(ny);
  for (let i = 0; i < 70; i++) {
    const T = 0.42 + rnd() * 0.14, birth = 1.50 + rnd() * 0.10;
    const ex = tx + gauss() * 8, ey = ty + gauss() * 8;
    const vx = (ex - core[0]) / T, vy = (ey - core[1] - 0.5 * G * T * T) / T;
    sparks.push({ v: [vx, vy, -24 / T], birth, life: T, col: rnd() < 0.6 ? C.hi : C.cool });
  }
}
const SN = sparks.length * TRAIL;
const sp0 = new Float32Array(SN * 3), sVel = new Float32Array(SN * 3), sTime = new Float32Array(SN * 2), sK = new Float32Array(SN), sCol = new Float32Array(SN * 3);
sparks.forEach((s, i) => {
  for (let k = 0; k < TRAIL; k++) {
    const j = i * TRAIL + k;
    sp0.set(core, j * 3); sVel.set(s.v, j * 3);
    sTime[j * 2] = s.birth; sTime[j * 2 + 1] = s.life; sK[j] = k;
    sCol[j * 3] = s.col.r; sCol[j * 3 + 1] = s.col.g; sCol[j * 3 + 2] = s.col.b;
  }
});
const sGeo = new BufferGeometry();
sGeo.setAttribute('position', new BufferAttribute(sp0, 3));
sGeo.setAttribute('aVel', new BufferAttribute(sVel, 3));
sGeo.setAttribute('aTime', new BufferAttribute(sTime, 2));
sGeo.setAttribute('aK', new BufferAttribute(sK, 1));
sGeo.setAttribute('aColor', new BufferAttribute(sCol, 3));
const sparkMat = new ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uTrail: { value: 0 }, uCamZ: { value: CAM_Z } },
  vertexShader: /* glsl */`
    uniform float uTime, uTrail, uCamZ;
    attribute vec3 aVel, aColor; attribute vec2 aTime; attribute float aK;
    varying vec3 vColor; varying float vAlpha;
    void main() {
      float age = uTime - aTime.x - aK * 0.026 * uTrail;
      float vis = step(0.0, age) * step(age, aTime.y) * (aK < 0.5 ? 1.0 : step(0.001, uTrail));
      float t = clamp(age, 0.0, aTime.y);
      vec3 p = position + aVel * t + 0.5 * vec3(0.0, ${G.toFixed(1)}, 0.0) * t * t;
      float life = t / aTime.y;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = (3.4 - aK * 0.28) * (uCamZ / -mv.z) * vis;
      vColor = aColor * (1.25 - aK * 0.08);
      vAlpha = vis * (1.0 - life * life * life) * (1.0 - aK / ${TRAIL.toFixed(1)}) * 0.9;
    }`,
  fragmentShader: FRAG,
  transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending
});
const sparkPoints = new Points(sGeo, sparkMat);
sparkPoints.frustumCulled = false;

// ---------- stationary dust field (never animated) ----------
const DUST = [];
for (let n = 0; n < 700;) {
  const x = rnd() * W, y = rnd() * H;
  if (x < 980 && y > 545) continue; // keep the copy block clean
  DUST.push([wx(x), wy(y), -60, rnd() < 0.6 ? C.cool : C.hi]); n++;
}
const dGeo = new BufferGeometry();
dGeo.setAttribute('position', new BufferAttribute(new Float32Array(DUST.flatMap(d => [d[0], d[1], d[2]])), 3));
dGeo.setAttribute('aColor', new BufferAttribute(new Float32Array(DUST.flatMap(d => [d[3].r, d[3].g, d[3].b])), 3));
const dustMat = new ShaderMaterial({
  uniforms: { uCamZ: { value: CAM_Z } },
  vertexShader: /* glsl */`
    uniform float uCamZ; attribute vec3 aColor; varying vec3 vColor; varying float vAlpha;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = 2.0 * (uCamZ / -mv.z); vColor = aColor; vAlpha = 0.3; }`,
  fragmentShader: FRAG,
  transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending
});
const dustPoints = new Points(dGeo, dustMat);
dustPoints.frustumCulled = false;

// ---------- renderer, camera, bloom ----------
const canvas = document.getElementById('gl');
const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(new Color(PAL.bg), 1);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NoToneMapping;

const scene = new Scene();
scene.background = new Color(PAL.bg);
scene.add(dustPoints, mainPoints, sparkPoints);
const camera = new PerspectiveCamera(FOV, W / H, 10, 4000);
camera.position.set(0, 0, CAM_Z);
camera.lookAt(0, 0, 0);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
// high threshold + low strength: only the hottest cores glow; silhouettes stay readable
const bloom = new UnrealBloomPass(new Vector2(W, H), 0.32, 0.35, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- evaluation: pure function of GSAP-owned state ----------
const state = { time: 0, morph: 0, trail: 0, flash: 0 };
function evaluate() {
  mainMat.uniforms.uTime.value = state.time;
  mainMat.uniforms.uMorph.value = state.morph;
  mainMat.uniforms.uFlash.value = state.flash;
  sparkMat.uniforms.uTime.value = state.time;
  sparkMat.uniforms.uTrail.value = state.trail;
  composer.render();
}
let pending = false;
const proxy = {};
for (const k of Object.keys(state)) {
  Object.defineProperty(proxy, k, {
    get: () => state[k],
    set: v => { state[k] = v; if (!pending) { pending = true; queueMicrotask(() => { pending = false; evaluate(); }); } },
    enumerable: true
  });
}

if (window.chroma) {
  console.info('[style-062] contrast fg/bg', window.chroma.contrast(PAL.fg, PAL.bg).toFixed(2),
    'cool/bg', window.chroma.contrast(PAL.cool, PAL.bg).toFixed(2),
    'warm/bg', window.chroma.contrast(PAL.warm, PAL.bg).toFixed(2), 'points', N + SN + DUST.length);
}

evaluate();
window.__scene062 = { evaluate, state, proxy, count: N + SN + DUST.length };
