// Surrealism preview — "An idea becomes a connected system".
// Renderer: Three.js (WebGL) with physically based materials and shadow maps.
// Motion owner: one paused GSAP timeline (window.__timelines.video) tweening a plain
// state object. Every frame is rebuilt from that state; no clocks, tickers or randomness.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Fog, Vector3, Vector2, Quaternion,
  HemisphereLight, DirectionalLight, PointLight, Mesh, Group, LatheGeometry, SphereGeometry,
  CylinderGeometry, BoxGeometry, PlaneGeometry, MeshPhysicalMaterial, MeshStandardMaterial,
  MeshBasicMaterial, CanvasTexture, RepeatWrapping, SRGBColorSpace, PCFSoftShadowMap,
  DoubleSide, NoToneMapping
} from 'three';

const gsap = window.gsap;
const W = 1280, H = 720;
const C = {
  shell: '#EDE5D7', ink: '#302D35', blue: '#617C8B', copper: '#B26E51',
  ground: '#272B37', horizon: '#8A9AA2', tether: '#E4DBCB'
};

const canvas = document.getElementById('stage');
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;

const scene = new Scene();
scene.fog = new Fog(new Color(C.horizon), 26, 150);

// Camera keeps a fixed orientation (pure translation dolly), so the horizon and the
// stationary CSS sky behind the transparent canvas always register at y = 488 px.
const camera = new PerspectiveCamera(34, W / H, 0.1, 400);
const VIEW_DIR = new Vector3(0, 0.10871, -1).normalize();

// ---------- lighting: one low key light for every object, impossible or not ----------
scene.add(new HemisphereLight(new Color('#8496A8'), new Color('#1E212A'), 1.15));
const key = new DirectionalLight(new Color('#F4E7D2'), 2.7);
key.position.set(-3.2, 11, 7.5);
key.target.position.set(3.2, 0, -1);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -9; key.shadow.camera.right = 9;
key.shadow.camera.top = 9; key.shadow.camera.bottom = -9;
key.shadow.camera.near = 1; key.shadow.camera.far = 40;
key.shadow.bias = -0.0004;
key.shadow.radius = 4;
scene.add(key, key.target);

// ---------- ground: dark plain with receding furrow lines (procedural, cached) ----------
function furrowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = C.ground; g.fillRect(0, 0, 8, 64);
  g.fillStyle = '#3B4150'; g.fillRect(0, 60, 8, 3);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, 420);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const ground = new Mesh(new PlaneGeometry(600, 600), new MeshStandardMaterial({ map: furrowTexture(), roughness: 0.95, metalness: 0 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- the egg: porcelain shell lathed from a true egg profile, split at the rim ----------
const EGG = { x: 2.6, y: 3.0, z: 0, Wd: 1.22, Ht: 1.75 };
const CUT_Y = 0.34;
const thetaCut = Math.acos(-CUT_Y / EGG.Ht);
function eggPoint(th) { return new Vector2(Math.max(1e-4, EGG.Wd * Math.sin(th) * (1 + 0.1 * Math.cos(th))), -EGG.Ht * Math.cos(th)); }
function profile(a, b, n) { const pts = []; for (let i = 0; i <= n; i++) pts.push(eggPoint(a + (b - a) * i / n)); return pts; }
const rimR = eggPoint(thetaCut).x;

const shellMat = new MeshPhysicalMaterial({
  color: new Color(C.shell), roughness: 0.4, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3,
  sheen: 0.35, sheenColor: new Color('#F6EEE0'), side: DoubleSide
});
const innerMat = new MeshStandardMaterial({ color: new Color('#C9BBA6'), roughness: 0.8, side: DoubleSide });

const eggRoot = new Group();
eggRoot.position.set(EGG.x, EGG.y, EGG.z);
scene.add(eggRoot);

const cup = new Mesh(new LatheGeometry(profile(0, thetaCut, 48), 96), shellMat);
cup.castShadow = true; cup.receiveShadow = true;
eggRoot.add(cup);
// slightly inset inner wall gives the opened cup a readable thickness
const cupInner = new Mesh(new LatheGeometry(profile(0.05, thetaCut, 40).map(p => new Vector2(p.x * 0.965, p.y * 0.975)), 96), innerMat);
cupInner.receiveShadow = true;
eggRoot.add(cupInner);

// cap hinges on the left rim point and lifts away under the same light
const capHinge = new Group();
capHinge.position.set(-rimR, CUT_Y, 0);
eggRoot.add(capHinge);
const cap = new Mesh(new LatheGeometry(profile(thetaCut, Math.PI, 40), 96), shellMat);
cap.position.set(rimR, -CUT_Y, 0);
cap.castShadow = true; cap.receiveShadow = true;
capHinge.add(cap);

// ---------- inner weather: a small sun and a cloud living inside the shell ----------
const SUN_HOME = new Vector3(0.05, 0.62, 0);
const sun = new Mesh(new SphereGeometry(0.36, 48, 32), new MeshStandardMaterial({
  color: new Color(C.copper), emissive: new Color(C.copper), emissiveIntensity: 0.85, roughness: 0.5
}));
eggRoot.add(sun);
const sunLight = new PointLight(new Color('#E8A27A'), 0, 3.2, 2);
eggRoot.add(sunLight);

const cloud = new Group();
cloud.position.set(-0.42, 0.42, 0.32);
eggRoot.add(cloud);
const cloudMat = new MeshStandardMaterial({ color: new Color(C.blue), roughness: 0.92 });
const PUFFS = [[0, 0, 0, 0.27], [0.3, 0.04, 0.04, 0.22], [-0.27, -0.03, 0.02, 0.2], [0.12, 0.17, -0.02, 0.21], [-0.1, 0.13, 0.08, 0.18], [0.5, -0.04, 0.0, 0.15]];
for (const [x, y, z, r] of PUFFS) {
  const p = new Mesh(new SphereGeometry(r, 32, 20), cloudMat);
  p.position.set(x, y, z); p.castShadow = true; cloud.add(p);
}

// ---------- the connected system: satellites, tethers and cross links ----------
const SATS = [
  { off: [-1.95, -1.05, 0.45], color: C.blue, r: 0.34 },
  { off: [2.25, -0.8, 0.3], color: C.copper, r: 0.34 },
  { off: [-1.4, 1.22, -0.35], color: C.blue, r: 0.3 },
  { off: [2.15, 1.1, -0.45], color: C.copper, r: 0.3 }
];
const satGeo = new SphereGeometry(1, 48, 32);
const sats = SATS.map(s => {
  const m = new Mesh(satGeo, new MeshPhysicalMaterial({ color: new Color(s.color), roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
  m.castShadow = true; m.receiveShadow = true;
  eggRoot.add(m);
  return m;
});
const rodGeo = new CylinderGeometry(1, 1, 1, 10, 1);
rodGeo.translate(0, 0.5, 0); // origin at one end so scale.y = length
const rodMat = new MeshBasicMaterial({ color: new Color(C.tether), transparent: true, opacity: 0.9 });
function makeRod(radius) { const m = new Mesh(rodGeo, rodMat); m.userData.radius = radius; m.castShadow = true; eggRoot.add(m); return m; }
const tethers = SATS.map(() => makeRod(0.018));
const LINKS = [[0, 2], [3, 1]];
const links = LINKS.map(() => makeRod(0.014));
const UP = new Vector3(0, 1, 0), tmpA = new Vector3(), tmpB = new Vector3(), tmpD = new Vector3(), tmpQ = new Quaternion();
function placeRod(rod, a, b, progress) {
  tmpD.subVectors(b, a);
  const len = tmpD.length() * progress;
  rod.visible = len > 0.01;
  if (!rod.visible) return;
  rod.position.copy(a);
  tmpQ.setFromUnitVectors(UP, tmpD.normalize());
  rod.quaternion.copy(tmpQ);
  rod.scale.set(rod.userData.radius, len, rod.userData.radius);
}

// ---------- a distant free-standing door frame sets an ambiguous scale ----------
const doorMat = new MeshStandardMaterial({ color: new Color(C.ink), roughness: 0.7 });
const door = new Group();
for (const [x, y, w, h] of [[-0.55, 1.1, 0.14, 2.2], [0.55, 1.1, 0.14, 2.2], [0, 2.25, 1.24, 0.14]]) {
  const b = new Mesh(new BoxGeometry(w, h, 0.14), doorMat); b.position.set(x, y, 0); b.castShadow = true; door.add(b);
}
door.position.set(15.5, 0, -24);
door.rotation.y = -0.35;
scene.add(door);

// ---------- state owned by GSAP ----------
const S = {
  camX: 0.6, camY: 1.78, camZ: 11.9,
  eggS: 0.32, eggLift: 1.5,
  capLift: 0, capTilt: 0,
  sunUp: 0, cloudS: 0,
  sat0: 0, sat1: 0, sat2: 0, sat3: 0,
  link0: 0, link1: 0
};
const satKeys = ['sat0', 'sat1', 'sat2', 'sat3'];
const linkKeys = ['link0', 'link1'];

function render() {
  camera.position.set(S.camX, S.camY, S.camZ);
  camera.lookAt(tmpA.copy(camera.position).add(VIEW_DIR));

  eggRoot.position.set(EGG.x, EGG.y + S.eggLift, EGG.z);
  eggRoot.scale.setScalar(S.eggS);

  capHinge.position.y = CUT_Y + S.capLift;
  capHinge.rotation.z = S.capTilt;

  const su = S.sunUp;
  sun.position.set(SUN_HOME.x, -0.35 + (SUN_HOME.y + 0.35) * su, SUN_HOME.z);
  sun.scale.setScalar(0.4 + 0.6 * su);
  sun.visible = su > 0.001;
  sunLight.position.copy(sun.position);
  sunLight.intensity = 3.2 * su;
  cloud.scale.setScalar(Math.max(0.0001, S.cloudS));
  cloud.visible = S.cloudS > 0.001;

  const satPos = SATS.map((s, i) => {
    const p = S[satKeys[i]];
    const pos = new Vector3().copy(sun.position).lerp(tmpB.set(...s.off), p);
    const m = sats[i];
    m.position.copy(pos);
    m.scale.setScalar(s.r * (0.25 + 0.75 * Math.min(1, p)));
    m.visible = p > 0.001;
    placeRod(tethers[i], sun.position, pos, p > 0.001 ? 1 : 0);
    return pos;
  });
  LINKS.forEach(([a, b], i) => placeRod(links[i], satPos[a], satPos[b], S[linkKeys[i]]));

  renderer.render(scene, camera);
}

// ---------- populate the paused timeline created and registered inline in index.html ----------
function build(tl) {
tl.eventCallback('onUpdate', render);
tl.to(S, { camY: 1.5, camZ: 11.0, duration: 2.5, ease: 'sine.inOut' }, 0);
tl.to(S, { eggS: 1, eggLift: 0, duration: 0.85, ease: 'power2.inOut' }, 0);
tl.to(S, { capLift: 0.24, capTilt: 0.34, duration: 0.6, ease: 'back.out(1.2)' }, 0.78);
tl.to(S, { sunUp: 1, duration: 0.6, ease: 'sine.inOut' }, 0.95);
tl.to(S, { cloudS: 1, duration: 0.5, ease: 'back.out(1.2)' }, 1.1);
satKeys.forEach((k, i) => tl.to(S, { [k]: 1, duration: 0.65, ease: 'back.out(1.2)' }, 1.3 + i * 0.12));
linkKeys.forEach((k, i) => tl.to(S, { [k]: 1, duration: 0.45, ease: 'power2.inOut' }, 2.0 + i * 0.1));

// HTML copy (GSAP owns opacity and y of each line)
const lines = ['#t1', '#t2', '#t3', '#t4'].map(id => document.querySelector(id));
gsap.set(lines, { opacity: 0, y: 16 });
[[0.12, 0.55], [0.42, 0.55], [1.5, 0.5], [1.78, 0.45]].forEach(([at, d], i) =>
  tl.to(lines[i], { opacity: 1, y: 0, duration: d, ease: 'power2.inOut' }, at));
tl.to({}, { duration: 0.001 }, 2.999);

// Redraw after any seek path (forward, backward, direct, out-of-order).
const baseTotalTime = tl.totalTime.bind(tl);
tl.totalTime = function (...args) { const r = baseTotalTime(...args); if (args.length) render(); return r; };
window.addEventListener('hf-seek', render);
document.addEventListener('hf-seek', render);

tl.seek(0);
render();
return tl;
}
window.SurrealScene = { build, render };
