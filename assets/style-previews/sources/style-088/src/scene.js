// Object Animation preview — digital simulation of a photographed tabletop
// object-animation shot. Three.js renders the set (fixed camera, fixed key
// light); one paused GSAP timeline owns every animated proxy value. Poses are
// exposed "on twos" (15 pose changes per second) to imitate held stop-motion
// exposures inside a 30 fps delivery.
import * as THREE from 'three';

const gsap = window.gsap;
const W = 1280, H = 720, DURATION = 3, EXPOSURE_FPS = 15;

// ---- palette (approved tokens + scene-dependent set colours) -------------
const C = {
  paper: '#F1E9DD',      // approved token: paper cards, title copy
  ink: '#3B423E',        // approved token: pins, thread, board frame
  felt: '#8D8977',       // approved token: pinboard felt, printed card rules
  table: '#2B333A',      // scene: cool slate desk at dusk
  room: '#1A2026',       // scene: unlit room beyond the desk
  keyLight: '#FFE2BC',   // scene: warm practical lamp (light colour, not a surface)
  fillSky: '#AFC3D6',    // scene: cool window fill
  fillGround: '#20262B',
  brass: '#8D8977'
};

// ---- deterministic helpers ---------------------------------------------
function rng(seed) { // mulberry32, seeded
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const D2R = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
// Held-exposure ease: pose only changes on 15 fps exposure boundaries.
function held(base, dur) {
  const f = gsap.parseEase(base);
  const n = Math.max(1, Math.round(dur * EXPOSURE_FPS));
  return (t) => f(Math.min(1, Math.ceil(t * n - 1e-6) / n));
}

// ---- procedural textures (built once at load) -----------------------------
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
function feltTexture() {
  return canvasTex(1024, 552, (g, w, h) => {
    g.fillStyle = C.felt; g.fillRect(0, 0, w, h);
    const r = rng(88);
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) {
      g.globalAlpha = 0.10 + r() * 0.06; g.fillStyle = r() > 0.5 ? C.paper : C.ink;
      g.beginPath(); g.arc(x + (r() - 0.5), y + (r() - 0.5), 1.1, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  });
}
function paperTexture(seed) {
  return canvasTex(512, 332, (g, w, h) => {
    g.fillStyle = C.paper; g.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 900; i++) { // paper fibre
      g.globalAlpha = 0.05; g.fillStyle = r() > 0.5 ? C.felt : '#ffffff';
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
    }
    g.globalAlpha = 1; g.strokeStyle = C.felt; g.lineCap = 'round'; g.lineWidth = 15;
    const lens = [0.70, 0.52, 0.36];
    lens.forEach((L, i) => { g.beginPath(); const y = 118 + i * 58; g.moveTo(72, y); g.lineTo(72 + (w - 144) * L, y - 4 + i * 1.5); g.stroke(); });
  });
}
function haloTexture() {
  return canvasTex(256, 256, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,226,188,0.95)'); gr.addColorStop(0.35, 'rgba(255,226,188,0.35)'); gr.addColorStop(1, 'rgba(255,226,188,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}

// ---- renderer, camera, fixed lights ----------------------------------------
const canvas = document.getElementById('set');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.room);
const camera = new THREE.PerspectiveCamera(38, W / H, 0.5, 80);
camera.position.set(-0.9, 9.5, 9.0); camera.lookAt(-0.9, 0, 0.4);

scene.add(new THREE.HemisphereLight(C.fillSky, C.fillGround, 0.75));
const key = new THREE.SpotLight(C.keyLight, 3.1, 0, 0.78, 0.65, 0);
key.position.set(-5.5, 11, 2.5); key.target.position.set(0.2, 0, 0.4);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
key.shadow.camera.near = 4; key.shadow.camera.far = 30;
scene.add(key, key.target);

// ---- set dressing ---------------------------------------------------------
const table = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ color: C.table, roughness: 0.82, metalness: 0 }));
table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);

const BOARD_W = 10, BOARD_D = 5.4, BOARD_TOP = 0.12;
const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, BOARD_TOP, BOARD_D), [
  new THREE.MeshStandardMaterial({ color: C.ink }), new THREE.MeshStandardMaterial({ color: C.ink }),
  new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 1 }), new THREE.MeshStandardMaterial({ color: C.ink }),
  new THREE.MeshStandardMaterial({ color: C.ink }), new THREE.MeshStandardMaterial({ color: C.ink })
]);
board.position.y = BOARD_TOP / 2; board.receiveShadow = true; board.castShadow = true; scene.add(board);
const frameMat = new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.55 });
const FT = 0.16, FH = 0.2;
[[0, -(BOARD_D / 2 + FT / 2), BOARD_W + FT * 2, FT], [0, BOARD_D / 2 + FT / 2, BOARD_W + FT * 2, FT],
 [-(BOARD_W / 2 + FT / 2), 0, FT, BOARD_D], [BOARD_W / 2 + FT / 2, 0, FT, BOARD_D]].forEach(([x, z, w, d]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, FH, d), frameMat); m.position.set(x, FH / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
});

// light bulb object — the "idea"
const bulb = new THREE.Group(); bulb.position.set(-6.6, 0, 1.9); scene.add(bulb);
const brassMat = new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.75, roughness: 0.35 });
const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.46, 24), brassMat); base.position.y = 0.23; base.castShadow = true; bulb.add(base);
for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.025, 8, 24), brassMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1 + i * 0.12; bulb.add(ring); }
const glassMat = new THREE.MeshStandardMaterial({ color: C.paper, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32, emissive: new THREE.Color(C.keyLight), emissiveIntensity: 0, depthWrite: false });
const glass = new THREE.Mesh(new THREE.SphereGeometry(0.6, 40, 28), glassMat); glass.position.y = 1.05; glass.castShadow = true; bulb.add(glass);
const filMat = new THREE.MeshStandardMaterial({ color: C.ink, emissive: new THREE.Color(C.keyLight), emissiveIntensity: 0, roughness: 0.5 });
const fil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 24, Math.PI), filMat); fil.position.y = 0.98; bulb.add(fil);
const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), filMat); stem.position.y = 0.72; bulb.add(stem);
const haloMat = new THREE.SpriteMaterial({ map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
const halo = new THREE.Sprite(haloMat); halo.scale.set(2.8, 2.8, 1); halo.position.y = 1.05; bulb.add(halo);

// ---- object actors: five index cards, five pins, six threads ---------------
const CARD_W = 2.0, CARD_D = 1.3, CARD_T = 0.02;
const STACK = new THREE.Vector3(-6.5, 0, -0.9);
// targets mirror the illustration layout (board pixel coords -> board units)
const CARDS = [
  { id: 1, x: -3.10, z: -0.53, yaw: 4, start: 0.36, dur: 0.58, tilt: 1 },
  { id: 2, x: 0.00, z: -1.03, yaw: -3, start: 0.62, dur: 0.58, tilt: -1 },
  { id: 4, x: -1.28, z: 1.57, yaw: -5, start: 0.88, dur: 0.58, tilt: 1 },
  { id: 3, x: 3.12, z: -0.53, yaw: 2, start: 1.14, dur: 0.64, tilt: -1 },
  { id: 5, x: 1.47, z: 1.47, yaw: 3, start: 1.40, dur: 0.66, tilt: 1 }
];
const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_D);
const edgeMat = new THREE.MeshStandardMaterial({ color: C.paper, roughness: 0.95 });
const sr = rng(5);
CARDS.forEach((c, i) => {
  const top = new THREE.MeshStandardMaterial({ map: paperTexture(100 + c.id), roughness: 0.92 });
  c.mesh = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, top, edgeMat, edgeMat, edgeMat]);
  c.mesh.rotation.order = 'YXZ'; c.mesh.castShadow = c.mesh.receiveShadow = true; scene.add(c.mesh);
  const level = CARDS.length - 1 - i; // first to leave sits on top
  c.from = { x: STACK.x + (sr() - 0.5) * 0.12, y: CARD_T / 2 + level * (CARD_T + 0.004), z: STACK.z + (sr() - 0.5) * 0.12, yaw: (sr() - 0.5) * 10 };
  c.to = { x: c.x, y: BOARD_TOP + CARD_T / 2 + 0.002, z: c.z, yaw: c.yaw };
  c.p = 0; c.land = 0; // GSAP-owned proxies
  // pin location: card top-centre, in world space of the settled pose
  const yawR = c.yaw * D2R, lz = -CARD_D / 2 + 0.2;
  c.pinAt = new THREE.Vector3(c.x + Math.sin(yawR) * lz, 0, c.z + Math.cos(yawR) * lz);
});
const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));

const pinMat = new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.25, metalness: 0.1 });
const shaftMat = new THREE.MeshStandardMaterial({ color: C.felt, roughness: 0.3, metalness: 0.8 });
const PIN_REST = BOARD_TOP + CARD_T + 0.005;
CARDS.forEach((c) => {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), pinMat); head.position.y = 0.2; head.castShadow = true;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8), shaftMat); shaft.position.y = 0.1; shaft.castShadow = true;
  g.add(head, shaft); g.position.copy(c.pinAt); g.visible = false; scene.add(g);
  c.pin = g; c.drop = 0;
});

const THREAD_Y = PIN_REST + 0.14;
const LINKS = [[1, 2, 0.35], [2, 3, 0.35], [1, 4, -0.15], [4, 5, -0.3], [2, 5, 0.2], [3, 5, -0.25]];
const threadMat = new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.7 });
const SEG = 40, RAD = 6;
const threads = LINKS.map(([a, b, bend]) => {
  const A = byId[a].pinAt.clone().setY(THREAD_Y), B = byId[b].pinAt.clone().setY(THREAD_Y);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const dir = B.clone().sub(A); const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const ctrl = mid.add(perp.multiplyScalar(bend * dir.length() * 0.35));
  const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(A, ctrl, B), SEG, 0.028, RAD, false);
  const mesh = new THREE.Mesh(geo, threadMat); mesh.castShadow = true; geo.setDrawRange(0, 0); scene.add(mesh);
  return { a, b, mesh, w: 0 };
});

// ---- pose evaluation (pure function of proxy values) ------------------------
const bulbState = { glow: 0 };
function applyPoses() {
  for (const c of CARDS) {
    const p = c.p, arc = Math.sin(Math.PI * p);
    const dist = Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z);
    c.mesh.position.set(lerp(c.from.x, c.to.x, p), lerp(c.from.y, c.to.y, p) + arc * (0.9 + dist * 0.07), lerp(c.from.z, c.to.z, p));
    const wob = Math.sin(Math.PI * c.land); // small landing rock, paper settles flat
    c.mesh.rotation.y = -lerp(c.from.yaw, c.to.yaw, p) * D2R;
    c.mesh.rotation.z = (arc * 13 * c.tilt + wob * 3 * c.tilt) * D2R;
    c.mesh.rotation.x = (-arc * 9 - wob * 2) * D2R;
    c.mesh.position.y += wob * 0.03;
    c.pin.visible = c.drop > 0;
    c.pin.position.y = PIN_REST + (1 - c.drop) * 1.5;
  }
  for (const t of threads) t.mesh.geometry.setDrawRange(0, Math.round(t.w * SEG) * RAD * 6);
  glassMat.emissiveIntensity = bulbState.glow * 0.55; filMat.emissiveIntensity = bulbState.glow * 2.2; haloMat.opacity = bulbState.glow * 0.7;
}
function draw() { applyPoses(); renderer.render(scene, camera); }

// ---- GSAP timeline: single owner of every animated value --------------------
const tl = gsap.timeline({ paused: true, onUpdate: draw });
const title = document.getElementById('title'), sub = document.getElementById('sub');
tl.fromTo(title, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' }, 0);
tl.fromTo(sub, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' }, 0.12);
// idea: bulb flickers on (stepped exposures)
tl.fromTo(bulbState, { glow: 0 }, { glow: 0.55, duration: 0.14, ease: held('none', 0.14) }, 0.06)
  .to(bulbState, { glow: 0.2, duration: 0.07, ease: 'steps(1)' }, 0.2)
  .to(bulbState, { glow: 1, duration: 0.13, ease: held('power2.out', 0.13) }, 0.27);
// cards leave the stack one at a time: hop, tilt, land, settle; then pin
CARDS.forEach((c) => {
  tl.fromTo(c, { p: 0 }, { p: 1, duration: c.dur, ease: held('power2.inOut', c.dur) }, c.start);
  tl.fromTo(c, { land: 0 }, { land: 1, duration: 0.2, ease: held('power1.out', 0.2) }, c.start + c.dur);
  tl.fromTo(c, { drop: 0 }, { drop: 1, duration: 0.2, ease: held('power2.in', 0.2) }, c.start + c.dur + 0.06);
});
// threads connect pins once both ends are pinned
const pinnedAt = (id) => byId[id].start + byId[id].dur + 0.26;
threads.forEach((t) => {
  const at = Math.max(pinnedAt(t.a), pinnedAt(t.b));
  tl.fromTo(t, { w: 0 }, { w: 1, duration: 0.3, ease: held('power1.inOut', 0.3) }, at);
});
tl.set({}, {}, DURATION);
// Registered on window.__timelines.video by the inline script in index.html.
window.__styleScene = { timeline: tl, draw };

window.addEventListener('hf-seek', (e) => {
  const t = e && e.detail && typeof e.detail.time === 'number' ? e.detail.time : tl.time();
  tl.totalTime(Math.min(DURATION, Math.max(0, t)), true);
  draw();
});
tl.totalTime(0, true);
draw();
