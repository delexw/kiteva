// Painterly 3D scene: "An idea becomes a connected system".
// Fallback renderer: Three.js WebGL (Blender could not start in this sandbox; see production.json).
// Every visual state is a pure function of composition time t (seconds). No clocks, no carried state.
import * as THREE from 'three';

// ---------- resolved scene palette (cool dawn alpine lake) ----------
export const PALETTE = {
  skyTop: '#BAC5D6', // pale lavender-blue
  horizon: '#E1E6DF', // pale mint-grey haze (also haze colour)
  waterNear: '#3D6170',
  waterFar: '#8DADB0',
  contour: '#EEF3EF',
  ridgeFar: '#9AA1B6',
  ridgeMid: '#7F8E8E',
  shore: '#A58C73', // warm ground plane vs cool water
  conifer: '#3E5A4E',
  shadowTint: '#6C6890', // cool lilac coloured shadow (never black)
  warmLight: '#F4D8B8',
  idea: '#BB7C65', // approved accent_2 — "idea" nodes
  node: '#7D9A95', // approved accent_1 — connected nodes
  ink: '#38454A', // approved foreground — rods + type
};

const W = 1280, H = 720, FOV = 34;
const C = (h) => new THREE.Color(h);

// ---------- deterministic helpers ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t, s, d) => clamp((t - s) / d);
const sineInOut = (p) => -(Math.cos(Math.PI * p) - 1) / 2;
const power2InOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const power2Out = (p) => 1 - (1 - p) * (1 - p);
const backOut = (p, s = 1.2) => (p <= 0 ? 0 : 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2));

// ---------- stable brush texture (seeded, generated once) ----------
function makeBrushTexture() {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, size, size);
  const rnd = mulberry32(35035);
  g.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size;
    const len = 18 + rnd() * 42;
    const ang = -0.45 + (rnd() - 0.5) * 0.5; // consistent brush direction
    const bend = (rnd() - 0.5) * 14;
    const v = rnd() < 0.5 ? 70 + rnd() * 40 : 160 + rnd() * 60;
    g.strokeStyle = `rgba(${v},${v},${v},${0.35 + rnd() * 0.4})`;
    g.lineWidth = 3 + rnd() * 6;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const sx = x + ox, sy = y + oy;
      const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo((sx + ex) / 2 - Math.sin(ang) * bend, (sy + ey) / 2 + Math.cos(ang) * bend, ex, ey);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------- shaders ----------
const LIGHT_DIR = new THREE.Vector3(-0.7, 0.45, 0.35).normalize();

const common = /* glsl */ `
uniform vec3 uHaze; uniform float uHazeK; uniform vec3 uCam;
vec3 applyHaze(vec3 col, vec3 wp){ float d = length(wp - uCam); float f = 1.0 - exp(-max(d - 8.0, 0.0)*uHazeK); return mix(col, uHaze, clamp(f,0.0,0.92)); }
`;

const paintVert = /* glsl */ `
uniform float uLenNow; uniform float uRodR; uniform float uIsRod;
varying vec3 vWorld; varying vec3 vObj; varying vec3 vObjN;
void main(){
  vec4 w = modelMatrix * vec4(position,1.0);
  vWorld = w.xyz;
  // brush coordinates are locked to the surface; rods use absolute distance from their base so growth reveals, not stretches
  vObj = uIsRod > 0.5 ? vec3(position.x*uRodR, position.y*uLenNow, position.z*uRodR)*3.0 : position*1.6;
  vObjN = normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const paintFrag = /* glsl */ `
${common}
uniform sampler2D uBrush; uniform vec3 uBase; uniform vec3 uShadow; uniform vec3 uWarm; uniform vec3 uSkyRim;
uniform vec3 uL; uniform float uLight; uniform float uGlow; uniform float uOpacity;
varying vec3 vWorld; varying vec3 vObj; varying vec3 vObjN;
float tri(vec3 p, vec3 n){
  vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x+b.y+b.z);
  return texture2D(uBrush, p.yz*0.5).r*b.x + texture2D(uBrush, p.xz*0.5).r*b.y + texture2D(uBrush, p.xy*0.5).r*b.z;
}
void main(){
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld))); // faceted low-poly normal
  vec3 V = normalize(uCam - vWorld);
  if (dot(N,V) < 0.0) N = -N;
  float brush = tri(vObj, normalize(vObjN)) - 0.5;
  float brush2 = tri(vObj*2.3 + 7.1, normalize(vObjN)) - 0.5;
  float ndl = dot(N, uL) + brush*0.42;
  float s1 = smoothstep(-0.12, 0.02, ndl);
  float s2 = smoothstep(0.42, 0.56, ndl + brush2*0.25);
  vec3 shade = mix(uBase*0.62, uShadow, 0.42);
  vec3 lit = mix(uBase, uWarm, 0.30 + uGlow*0.35);
  vec3 col = mix(mix(shade, uBase, s1), lit, s2*uLight);
  col += brush2 * 0.07;
  float rim = pow(1.0 - clamp(dot(N,V),0.0,1.0), 2.5);
  col = mix(col, uSkyRim, rim*0.18);
  col = mix(col, uWarm, uGlow*0.12);
  gl_FragColor = vec4(applyHaze(col, vWorld), uOpacity);
}`;

const waterVert = /* glsl */ `
varying vec3 vWorld;
void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;

const waterFrag = /* glsl */ `
${common}
uniform sampler2D uBrush; uniform vec3 uNear; uniform vec3 uFar; uniform vec3 uLine; uniform vec3 uShadow;
uniform vec3 uL; uniform float uTime; uniform float uLight;
uniform vec4 uSph[5]; uniform vec3 uRodA[5]; uniform vec3 uRodB[5]; uniform float uRodR; uniform vec4 uRip[5];
varying vec3 vWorld;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }
vec2 proj(vec3 c){ return c.xz - uL.xz * (c.y / uL.y); }
float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-5),0.0,1.0); return length(pa-ba*h); }
void main(){
  vec2 p = vWorld.xz;
  float d = length(vWorld - uCam);
  vec3 col = mix(uNear, uFar, smoothstep(4.0, 40.0, d));
  // painterly horizontal strokes, world-locked
  float b = texture2D(uBrush, vec2(p.x*0.05, p.y*0.35)).r - 0.5;
  col += b*0.07;
  // stylized white contour lines (shallows), static
  float n = fbm(p*vec2(0.16,0.24)) * 4.0;
  float c = fract(n); float e = min(c, 1.0-c);
  float line = 1.0 - smoothstep(0.0, fwidth(n)*1.4 + 0.012, e);
  line *= smoothstep(48.0, 10.0, d) * 0.75;
  col = mix(col, uLine, line);
  // coloured analytic cast shadows (light-direction projection onto the water plane)
  vec2 dl = normalize(uL.xz); vec2 pl = vec2(-dl.y, dl.x);
  float elong = 1.0/max(uL.y,0.2);
  float sh = 0.0;
  for(int i=0;i<5;i++){
    vec4 s = uSph[i]; if (s.w <= 0.001) continue;
    vec2 q = p - proj(s.xyz);
    float r = length(vec2(dot(q,dl)/(s.w*elong), dot(q,pl)/s.w));
    sh = max(sh, 1.0 - smoothstep(0.55, 1.08, r));
  }
  for(int i=0;i<5;i++){
    if (distance(uRodA[i], uRodB[i]) < 0.01) continue;
    float sd = segDist(p, proj(uRodA[i]), proj(uRodB[i]));
    sh = max(sh, (1.0 - smoothstep(uRodR*1.0, uRodR*2.6, sd))*0.85);
  }
  col = mix(col, uShadow*0.85, sh*0.55);
  // expanding ripple rings (crisp white, with a soft inner ring)
  float ring = 0.0;
  for(int i=0;i<5;i++){
    vec4 r = uRip[i]; float age = uTime - r.z; if (age <= 0.0 || r.w <= 0.0) continue;
    float life = clamp(1.0 - age/1.25, 0.0, 1.0);
    float rad = 0.25 + age*1.9*r.w;
    float dd = length((p - r.xy)*vec2(1.0, 1.0));
    float w = 0.05 + age*0.02;
    ring = max(ring, (1.0 - smoothstep(w*0.5, w, abs(dd-rad))) * life);
    ring = max(ring, (1.0 - smoothstep(w*0.6, w*1.4, abs(dd-rad*0.62))) * life*0.45);
  }
  col = mix(col, uLine, ring);
  col *= mix(0.9, 1.0, uLight);
  gl_FragColor = vec4(applyHaze(col, vWorld), 1.0);
}`;

const skyVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const skyFrag = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHor; uniform sampler2D uBrush; varying vec2 vUv;
void main(){
  float k = smoothstep(0.42, 1.0, vUv.y);
  vec3 col = mix(uHor, uTop, k);
  float cl = texture2D(uBrush, vec2(vUv.x*1.4, vUv.y*0.55)).r - 0.5;
  col += cl * 0.035 * smoothstep(0.45, 0.9, vUv.y); // soft painted cloud marks, stationary
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------- geometry helpers ----------
function flatIco(detail) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  // jitter vertices deterministically for a hand-cut low-poly silhouette
  const pos = g.attributes.position;
  const key = (x, y, z) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
  const cache = new Map();
  const rnd = mulberry32(911);
  for (let i = 0; i < pos.count; i++) {
    const k = key(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (!cache.has(k)) cache.set(k, 0.94 + rnd() * 0.1);
    const s = cache.get(k);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

function ridgeGeometry(seed, x0, x1, steps, z, hFn) {
  const rnd = mulberry32(seed);
  const verts = [];
  let prevTop = null, prevBase = null;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const top = new THREE.Vector3(x, hFn(x, rnd), z - rnd() * 6);
    const base = new THREE.Vector3(x + (rnd() - 0.5) * 3, -0.5, z + 4);
    if (prevTop) {
      const mid = new THREE.Vector3((x + prevTop.x) / 2, (top.y + prevTop.y) * 0.32, z + 1.5 + rnd() * 2);
      verts.push(prevBase, prevTop, mid, prevTop, top, mid, top, base, mid, base, prevBase, mid);
    }
    prevTop = top; prevBase = base;
  }
  const g = new THREE.BufferGeometry().setFromPoints(verts);
  g.computeVertexNormals();
  return g;
}

// ---------- scene build ----------
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 400);
  const CAM_FINAL = new THREE.Vector3(0, 1.4, 11);
  const CAM_START = new THREE.Vector3(0.35, 1.5, 12.4);
  const LOOK_OFFSET = new THREE.Vector3(0, 0.5, -11); // translation-only dolly: orientation never changes

  const brush = makeBrushTexture();
  const hazeCol = C(PALETTE.horizon);
  const shared = { uHaze: { value: hazeCol }, uHazeK: { value: 0.021 }, uCam: { value: new THREE.Vector3() } };
  const uLight = { value: 1 };

  // sky (screen-space, stationary)
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag, depthWrite: false, depthTest: false,
    uniforms: { uTop: { value: C(PALETTE.skyTop) }, uHor: { value: C(PALETTE.horizon) }, uBrush: { value: brush } },
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  function paintMaterial(hex, { rod = false, rodR = 0.06 } = {}) {
    return new THREE.ShaderMaterial({
      vertexShader: paintVert, fragmentShader: paintFrag,
      uniforms: {
        ...shared,
        uBrush: { value: brush }, uBase: { value: C(hex) }, uShadow: { value: C(PALETTE.shadowTint) },
        uWarm: { value: C(PALETTE.warmLight) }, uSkyRim: { value: C(PALETTE.skyTop) }, uL: { value: LIGHT_DIR },
        uLight, uGlow: { value: 0 }, uOpacity: { value: 1 },
        uLenNow: { value: 1 }, uRodR: { value: rodR }, uIsRod: { value: rod ? 1 : 0 },
      },
    });
  }

  // distant ridges (haze-based depth); low on the left to keep the title on open sky
  const ridgeFar = new THREE.Mesh(ridgeGeometry(71, -140, 140, 26, -95, (x, r) => 7 + Math.max(0, x + 20) * 0.11 + r() * 6), paintMaterial(PALETTE.ridgeFar));
  const ridgeMid = new THREE.Mesh(ridgeGeometry(72, -110, 110, 30, -62, (x, r) => 2.5 + Math.max(0, x + 10) * 0.05 + r() * 3.5), paintMaterial(PALETTE.ridgeMid));
  scene.add(ridgeFar, ridgeMid);

  // far shore: warm ground band + conifers
  const shoreGeo = new THREE.BoxGeometry(260, 0.6, 10, 40, 1, 2);
  const shore = new THREE.Mesh(shoreGeo, paintMaterial(PALETTE.shore));
  shore.position.set(0, 0.05, -40);
  scene.add(shore);
  const coneGeo = new THREE.ConeGeometry(1, 1, 6, 1);
  const coneMat = paintMaterial(PALETTE.conifer);
  const rt = mulberry32(4242);
  for (let i = 0; i < 70; i++) {
    const x = -75 + rt() * 150;
    const h = 2.2 + rt() * 3.2;
    if (x < -25 && rt() < 0.55) continue; // sparser on the left under the headline
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.scale.set(h * 0.32, h, h * 0.32);
    cone.position.set(x, 0.3 + h / 2, -37 - rt() * 5);
    cone.rotation.y = rt() * Math.PI;
    scene.add(cone);
  }

  // water plane
  const waterU = {
    ...shared, uBrush: { value: brush }, uNear: { value: C(PALETTE.waterNear) }, uFar: { value: C(PALETTE.waterFar) },
    uLine: { value: C(PALETTE.contour) }, uShadow: { value: C(PALETTE.shadowTint) }, uL: { value: LIGHT_DIR },
    uTime: { value: 0 }, uLight,
    uSph: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) },
    uRodA: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) },
    uRodB: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) },
    uRodR: { value: 0.07 },
    uRip: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) },
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 80, 1, 1), new THREE.ShaderMaterial({ vertexShader: waterVert, fragmentShader: waterFrag, uniforms: waterU }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0, -25);
  scene.add(water);

  // ---- system layout: place nodes at illustration screen positions for the settled camera ----
  camera.position.copy(CAM_FINAL);
  camera.lookAt(CAM_FINAL.clone().add(LOOK_OFFSET));
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const pxPerUnit = (z) => H / (2 * (CAM_FINAL.z - z) * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  function place(px, py, z) {
    const ndc = new THREE.Vector3(px / (W / 2) - 1, 1 - py / (H / 2), 0.5).unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const k = (z - camera.position.z) / dir.z;
    return camera.position.clone().add(dir.multiplyScalar(k));
  }
  const NODES = [
    { id: 'A', px: 640, py: 330, rpx: 150, z: 0, color: PALETTE.idea },
    { id: 'B', px: 300, py: 430, rpx: 58, z: 1.0, color: PALETTE.node },
    { id: 'C', px: 960, py: 240, rpx: 72, z: -1.5, color: PALETTE.node },
    { id: 'D', px: 1050, py: 475, rpx: 52, z: 0.8, color: PALETTE.idea },
    { id: 'E', px: 1160, py: 130, rpx: 36, z: -2.5, color: PALETTE.node },
  ].map((n) => ({ ...n, pos: place(n.px, n.py, n.z), r: n.rpx / pxPerUnit(n.z) }));
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

  // authored keyframes (seconds)
  const NODE_KEYS = {
    A: { start: 0.15, dur: 0.8, rise: 1.2 },
    B: { start: 1.15, dur: 0.45, rise: 0.5 },
    C: { start: 1.25, dur: 0.45, rise: 0.5 },
    D: { start: 1.35, dur: 0.45, rise: 0.5 },
    E: { start: 1.8, dur: 0.4, rise: 0.4 },
  };
  const RODS = [
    { a: 'A', b: 'B', start: 0.8, dur: 0.42 },
    { a: 'A', b: 'C', start: 0.9, dur: 0.42 },
    { a: 'A', b: 'D', start: 1.0, dur: 0.42 },
    { a: 'C', b: 'E', start: 1.48, dur: 0.38 },
    { a: 'C', b: 'D', start: 1.58, dur: 0.42 },
  ];

  const sphereGeo = flatIco(2);
  for (const n of NODES) {
    n.mesh = new THREE.Mesh(sphereGeo, paintMaterial(n.color));
    n.mesh.rotation.set(0.3 * n.z, n.px * 0.01, 0.2);
    scene.add(n.mesh);
  }
  const ROD_R = 0.07;
  const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
  rodGeo.translate(0, 0.5, 0);
  for (const r of RODS) {
    r.mat = paintMaterial(PALETTE.ink, { rod: true, rodR: ROD_R });
    r.mesh = new THREE.Mesh(rodGeo, r.mat);
    const A = byId[r.a].pos, B = byId[r.b].pos;
    r.dir = B.clone().sub(A);
    r.len = r.dir.length();
    r.dir.normalize();
    r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), r.dir);
    r.mesh.position.copy(A);
    scene.add(r.mesh);
  }
  waterU.uRodR.value = ROD_R;

  const tmp = new THREE.Vector3();

  function nodeState(n, t) {
    const k = NODE_KEYS[n.id];
    const p = prog(t, k.start, k.dur);
    const s = backOut(p, 1.2);
    const y = n.pos.y - k.rise * (1 - power2Out(p));
    return { s, y, p };
  }

  function render(tIn) {
    const t = clamp(Number(tIn) || 0, 0, 3);
    // camera: translation-only dolly, settled by 2.4 s
    const cp = sineInOut(prog(t, 0, 2.4));
    camera.position.lerpVectors(CAM_START, CAM_FINAL, cp);
    camera.lookAt(tmp.copy(camera.position).add(LOOK_OFFSET));
    camera.updateMatrixWorld();
    shared.uCam.value.copy(camera.position);
    // lighting: dawn key brightens, the idea's warm glow peaks at birth then settles
    uLight.value = 0.78 + 0.22 * power2InOut(prog(t, 0, 1.4));
    const glowUp = prog(t, 0.2, 0.5), glowDown = prog(t, 0.75, 0.9);
    byId.A.mesh.material.uniforms.uGlow.value = 0.9 * power2Out(glowUp) * (1 - 0.8 * power2InOut(glowDown));

    NODES.forEach((n, i) => {
      const st = nodeState(n, t);
      const sc = Math.max(st.s, 0) * n.r;
      n.mesh.visible = sc > 0.002;
      n.mesh.scale.setScalar(Math.max(sc, 0.0001));
      n.mesh.position.set(n.pos.x, st.y, n.pos.z);
      n.mesh.rotation.y = n.px * 0.01 + 0.5 * (1 - sineInOut(st.p)); // settling turn reveals locked brushwork
      n.cur = n.mesh.position;
      n.curR = sc;
      waterU.uSph.value[i].set(n.pos.x, Math.max(st.y, 0.01), n.pos.z, sc);
      const k = NODE_KEYS[n.id];
      waterU.uRip.value[i].set(n.pos.x, n.pos.z, k.start + k.dur * 0.25, n.id === 'A' ? 1.25 : 0.8);
    });

    RODS.forEach((r, i) => {
      const p = power2InOut(prog(t, r.start, r.dur));
      const A = byId[r.a].cur;
      const lenNow = r.len * p;
      r.mesh.visible = lenNow > 0.01;
      r.mesh.position.copy(A);
      r.mesh.scale.set(ROD_R, Math.max(lenNow, 0.0001), ROD_R);
      r.mat.uniforms.uLenNow.value = lenNow;
      waterU.uRodA.value[i].copy(A);
      waterU.uRodB.value[i].copy(A).addScaledVector(r.dir, lenNow);
    });
    waterU.uTime.value = t;
    renderer.render(scene, camera);
  }

  return { render, nodes: NODES, palette: PALETTE };
}
