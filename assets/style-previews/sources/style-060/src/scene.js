// Cel-Shaded 3D reward preview: "an idea becomes a connected system".
// Style renderer: Three.js + quantized toon shading (MeshToonMaterial, 3-step gradientMap)
// + EffectComposer depth/normal contour ShaderPass + OutputPass (tone mapping off).
// Motion owner: one paused GSAP timeline built in index.html (window.__timelines.video) tweens `state`.
// Every frame is drawn from timeline time; there are no clocks, tickers or carried simulation state.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const chroma = window.chroma;

// ---- Centralised tokens (STYLE.json palette, exact values) ----
const TOKENS = { background: '#F4ECD9', foreground: '#26394A', accent_1: '#547E8F', accent_2: '#BA7461' };
// Scene-dependent environment (BACKGROUND_REVIEW refresh): a cool mint studio cyclorama, stepped
// wall/floor bands (no gradient). Cool mid-light ground lets the warm hero and dark contours read.
const SCENE = { wall: '#C9E0DA', floor: '#AFCFC8' };
const FLOOR_LINE = 0.24; // floor band = lowest 24% of the frame (screen-space, stationary)
for (const [k, v] of Object.entries({ ...TOKENS, ...SCENE })) if (!chroma.valid(v) || chroma(v).hex().toUpperCase() !== v) throw Error('Invalid token ' + k);
const W = 1280, H = 720, OUTLINE_PX = 3; // contour width in output pixels at 720p

const C = (hex) => new THREE.Color(hex); // sRGB hex -> linear working colour; OutputPass returns exact sRGB

// ---- Renderer ----
const root = document.querySelector('[data-composition-id="video"]');
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const BG = C(SCENE.wall);
scene.background = BG;
const camera = new THREE.PerspectiveCamera(30, W / H, 1, 60);

// One fixed directional light (world space, upper-left-front).
const LIGHT_DIR = new THREE.Vector3(-0.55, 0.65, 0.55).normalize();
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.copy(LIGHT_DIR).multiplyScalar(10);
scene.add(sun);

// ---- 3-step toon ramp (shading data, not colour) ----
// 16 texels, 3 discrete levels: shadow band | base band | narrow highlight band.
const rampData = new Uint8Array(16);
for (let i = 0; i < 16; i++) rampData[i] = i < 5 ? 0 : (i < 15 ? 128 : 255);
const ramp = new THREE.DataTexture(rampData, 16, 1, THREE.RedFormat);
ramp.minFilter = THREE.NearestFilter;
ramp.magFilter = THREE.NearestFilter;
ramp.generateMipmaps = false;
ramp.colorSpace = THREE.NoColorSpace;
ramp.needsUpdate = true;

const shared = { uL: { value: new THREE.Vector3() }, uShadow: { value: C(TOKENS.foreground) }, uHigh: { value: C(TOKENS.background) } };

// MeshToonMaterial whose ramp level selects an explicit palette band (no smooth interpolation).
function toon(hex, rim = false) {
  const mat = new THREE.MeshToonMaterial({ color: C(hex), gradientMap: ramp });
  mat.userData.uRim = { value: 0 };
  mat.userData.hasRim = rim;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uL = shared.uL;
    shader.uniforms.uShadow = shared.uShadow;
    shader.uniforms.uHigh = shared.uHigh;
    shader.uniforms.uRim = mat.userData.uRim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uL; uniform vec3 uShadow; uniform vec3 uHigh; uniform float uRim;')
      .replace('#include <opaque_fragment>', `
        vec3 nV = normalize(normal);
        float ndl = dot(nV, uL);
        float lvl = texture2D(gradientMap, vec2(ndl * 0.5 + 0.5, 0.5)).r;
        vec3 band = lvl < 0.25 ? uShadow : (lvl < 0.75 ? diffuseColor.rgb : uHigh);
        float fres = 1.0 - abs(dot(nV, normalize(vViewPosition)));
        float rimBand = step(0.74, fres) * step(0.2, ndl) * uRim;
        outgoingLight = rimBand > 0.5 ? uHigh : band;
        #include <opaque_fragment>`);
  };
  return mat;
}
const flat = (hex) => new THREE.MeshBasicMaterial({ color: C(hex) });

// ---- Layout (world units; final camera ~84 px/unit) ----
const HERO = new THREE.Vector3(-2.38, 0, 0), HERO_R = 1.19;
const NODES = [
  { p: new THREE.Vector3(0.71, 1.67, -0.5), r: 0.71, delay: 0.0 },
  { p: new THREE.Vector3(1.43, -1.31, 0.5), r: 0.71, delay: 0.06 },
  { p: new THREE.Vector3(4.29, 0.71, -0.3), r: 0.57, delay: 0.12 },
];
const HUB_LINKS = [0, 1];             // hero -> node
const NET_LINKS = [[0, 2], [1, 2], [0, 1]]; // node -> node

const sphereGeo = new THREE.SphereGeometry(1, 64, 48);
const bondGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false);
const capGeo = new THREE.SphereGeometry(1, 24, 16);
const discGeo = new THREE.CircleGeometry(1, 128);

const heroMat = toon(TOKENS.accent_1, true);
const hero = new THREE.Mesh(sphereGeo, heroMat);
scene.add(hero);

const shadow = new THREE.Mesh(discGeo, flat(TOKENS.foreground));
scene.add(shadow);

// Glow card behind the hero: stepped bands (outer accent_1 ring, inner background band). No gradients.
const haloMat = flat(TOKENS.background);
const halo = new THREE.Mesh(discGeo, haloMat);
const cardInner = new THREE.Mesh(discGeo, flat(TOKENS.background));
scene.add(halo, cardInner);

const nodeMeshes = NODES.map(() => { const m = new THREE.Mesh(sphereGeo, toon(TOKENS.accent_1)); scene.add(m); return m; });
const bondMat = toon(TOKENS.background);
function makeBond() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bondGeo, bondMat);
  const cap = new THREE.Mesh(capGeo, bondMat);
  g.add(body, cap); scene.add(g);
  return { g, body, cap };
}
const hubBonds = HUB_LINKS.map(makeBond);
const netBonds = NET_LINKS.map(makeBond);
const BOND_R = 0.15;

// Seeded burst particles (mulberry32), launched from outside the hero silhouette.
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(60060);
const particleMats = [toon(TOKENS.accent_2), toon(TOKENS.accent_1), toon(TOKENS.background)];
const particles = Array.from({ length: 16 }, (_, i) => {
  const ang = (i / 16) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
  const m = new THREE.Mesh(capGeo, particleMats[i % 3]);
  scene.add(m);
  return { m, ang, dist: 1.3 + rnd() * 0.9, size: 0.1 + rnd() * 0.08, z: (rnd() - 0.5) * 0.5, lag: rnd() * 0.15 };
});

// ---- Postprocessing: normal+depth target, contour ShaderPass, OutputPass ----
const normalRT = new THREE.WebGLRenderTarget(W, H, { depthTexture: new THREE.DepthTexture(W, H), type: THREE.UnsignedByteType });
normalRT.texture.minFilter = normalRT.texture.magFilter = THREE.NearestFilter;
const normalMat = new THREE.MeshNormalMaterial();

const composerRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, composerRT);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const contour = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, tNormal: { value: normalRT.texture }, tDepth: { value: normalRT.depthTexture },
    uRes: { value: new THREE.Vector2(W, H) }, uPx: { value: (OUTLINE_PX / 2) * (H / 720) },
    uInk: { value: C(TOKENS.foreground) }, uWall: { value: C(SCENE.wall) }, uFloor: { value: C(SCENE.floor) }, uFloorLine: { value: FLOOR_LINE }, uNear: { value: camera.near }, uFar: { value: camera.far },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tNormal, tDepth; uniform vec2 uRes; uniform float uPx, uNear, uFar; uniform vec3 uInk, uWall, uFloor; uniform float uFloorLine;
    varying vec2 vUv;
    float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
    float edgeAt(vec2 o, float d0, vec3 n0){
      vec2 uv = vUv + o * uPx / uRes;
      float d = lin(texture2D(tDepth, uv).r);
      vec3 n = texture2D(tNormal, uv).rgb * 2.0 - 1.0;
      float de = step(0.035 * min(d, d0) + 0.02, abs(d - d0));
      float ne = (d < uFar * 0.99 && d0 < uFar * 0.99) ? step(dot(normalize(n), normalize(n0)), 0.72) : 0.0;
      return max(de, ne);
    }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      // Empty pixels (no geometry depth) take the fixed screen-space cyclorama band.
      if (texture2D(tDepth, vUv).r >= 0.99999) base.rgb = vUv.y < uFloorLine ? uFloor : uWall;
      float d0 = lin(texture2D(tDepth, vUv).r);
      vec3 n0 = texture2D(tNormal, vUv).rgb * 2.0 - 1.0;
      float h = 0.0;
      h += edgeAt(vec2( 1.0, 0.0), d0, n0); h += edgeAt(vec2(-1.0, 0.0), d0, n0);
      h += edgeAt(vec2( 0.0, 1.0), d0, n0); h += edgeAt(vec2( 0.0,-1.0), d0, n0);
      h += edgeAt(vec2( 0.707, 0.707), d0, n0); h += edgeAt(vec2(-0.707, 0.707), d0, n0);
      h += edgeAt(vec2( 0.707,-0.707), d0, n0); h += edgeAt(vec2(-0.707,-0.707), d0, n0);
      float ink = clamp(h / 2.0, 0.0, 1.0);
      gl_FragColor = vec4(mix(base.rgb, uInk, ink), 1.0);
    }`,
});
// ShaderPass clones uniforms; bind the live render-target textures after construction.
contour.uniforms.tNormal.value = normalRT.texture;
contour.uniforms.tDepth.value = normalRT.depthTexture;
composer.addPass(contour);
composer.addPass(new OutputPass());

// ---- Motion state: every animated property has exactly one GSAP owner ----
const state = {
  bob: 0, rarity: 0, heroS: 1, sx: 1, sy: 1, tremble: 0, shadow: 1,
  cx: HERO.x, cy: 0.65, cz: 9.5, tx: HERO.x, ty: 0.6,
  n0: 0, n1: 0, n2: 0, links: 0, burst: 0, card: 0, hold: 0,
};
// The GSAP timeline that owns `state` is built and registered inline in index.html.

// ---- Frame evaluation from timeline state only ----
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function placeBond(b, a, c, p) {
  if (p <= 0.001) { b.g.visible = false; return; }
  b.g.visible = true;
  tmpB.copy(c).sub(a);
  const len = tmpB.length() * p;
  tmpB.normalize();
  b.body.position.copy(a).addScaledVector(tmpB, len / 2);
  b.body.quaternion.setFromUnitVectors(UP, tmpB);
  b.body.scale.set(BOND_R, len, BOND_R);
  b.cap.position.copy(a).addScaledVector(tmpB, len);
  b.cap.scale.setScalar(BOND_R);
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function draw(t) {
  const tier = Math.round(state.rarity);
  // Rarity coordinates material, rim light and backing tone (page background stays fixed).
  heroMat.color.set(tier >= 2 ? TOKENS.accent_2 : TOKENS.accent_1);
  heroMat.userData.uRim.value = tier >= 3 ? 1 : 0;
  haloMat.color.set(tier >= 2 ? TOKENS.accent_1 : TOKENS.background);

  const bobY = 0.14 * Math.sin(state.bob * Math.PI * 2);
  const shake = state.tremble * 0.035 * Math.sin(t * Math.PI * 2 * 15);
  hero.position.set(HERO.x + shake, HERO.y + bobY, HERO.z);
  hero.scale.set(HERO_R * state.heroS * state.sx, HERO_R * state.heroS * state.sy, HERO_R * state.heroS * state.sx);

  // Ground shadow under the hero (unrelated to the clean reveal, removed at burst)
  shadow.visible = state.shadow > 0.001;
  shadow.position.set(HERO.x, -1.6, -0.2);
  shadow.scale.set(1.05 * state.shadow * (1 - bobY * 0.8) * state.sx, 0.2 * state.shadow, 1);

  // Halo / glow card behind the hero (stepped bands)
  halo.visible = tier >= 1;
  const outerR = 1.5 + 0.5 * state.card;
  halo.position.set(HERO.x, HERO.y, -1.7);
  halo.scale.setScalar(outerR);
  cardInner.visible = state.card > 0.001;
  cardInner.position.set(HERO.x, HERO.y, -1.65);
  cardInner.scale.setScalar(Math.max(0.001, 1.62 * state.card));

  // Nodes travel out of the hero and settle at their authored positions
  const nodePos = NODES.map((n, i) => {
    const p = state['n' + i];
    const m = nodeMeshes[i];
    m.visible = p > 0.001;
    const pos = tmpA.copy(HERO).lerp(n.p, p).clone();
    m.position.copy(pos);
    m.scale.setScalar(n.r * (0.35 + 0.65 * clamp01(p)) );
    return pos;
  });
  HUB_LINKS.forEach((ni, k) => placeBond(hubBonds[k], HERO, nodePos[ni], state['n' + ni] > 0.001 ? 1 : 0));
  NET_LINKS.forEach(([a, b], k) => placeBond(netBonds[k], nodePos[a], nodePos[b], clamp01(state.links * 1.15 - k * 0.075)));

  // Burst particles: outside the silhouette from launch, shrink away by ~2.5s
  for (const q of particles) {
    const p = clamp01((state.burst - q.lag) / (1 - q.lag));
    const live = state.burst > 0 && p < 1;
    q.m.visible = live && p > 0;
    if (!q.m.visible) continue;
    const r = HERO_R * 1.3 + q.dist * p;
    q.m.position.set(HERO.x + Math.cos(q.ang) * r, HERO.y + Math.sin(q.ang) * r * 0.62, 0.2 + q.z);
    q.m.scale.setScalar(Math.max(0.001, q.size * (1 - p) * 1.6));
  }

  camera.position.set(state.cx, state.cy, state.cz);
  camera.lookAt(state.tx, state.ty, 0);
  camera.updateMatrixWorld();
  shared.uL.value.copy(LIGHT_DIR).transformDirection(camera.matrixWorldInverse);

  // Pass 1: normals + depth for the contour detector
  scene.overrideMaterial = normalMat;
  scene.background = null;
  renderer.setRenderTarget(normalRT);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  scene.overrideMaterial = null;
  scene.background = BG;
  // Pass 2: toon colour -> contour ShaderPass -> OutputPass
  composer.render();
}

// Renderer API consumed by the inline timeline script in index.html.
window.__celScene = { state, draw, nodeDelays: NODES.map((n) => n.delay), hero: { x: HERO.x } };
