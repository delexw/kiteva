// Minimalist Product Motion — "An idea, connected."
// Three.js renders the hub product; GSAP (global, local gsap.min.js) owns time.
// Every 3D state is a pure function of composition time t (no clocks, no carried state).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const gsap = window.gsap;
const W = 1280, H = 720, DURATION = 3;

// ---------- resolved scene palette (scene_dependent policy) ----------
const PAL = {
  product: '#2A3030',   // graphite hub material (kept from the approved illustration)
  thread: '#D9E3E5',    // cool off-white connection filaments
  accent: '#7FE0C8',    // single accent: status light / linked state
  ring: '#8C9CA2'
};

// ---------- renderer ----------
const canvas = document.getElementById('stage3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);

// Rim-dominant studio lighting, soft key from upper front.
const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-4, 7, 6); scene.add(key);
const rimL = new THREE.DirectionalLight(0xcfe6ff, 2.4); rimL.position.set(-7, 2.5, -6); scene.add(rimL);
const rimR = new THREE.DirectionalLight(0xffffff, 2.0); rimR.position.set(7, 2, -5); scene.add(rimR);

// ---------- materials ----------
const productMat = new THREE.MeshPhysicalMaterial({
  color: PAL.product, metalness: 0.55, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.25
});
const grooveMat = new THREE.MeshStandardMaterial({ color: '#141818', metalness: 0.3, roughness: 0.6 });
const portMat = new THREE.MeshStandardMaterial({ color: '#0C0F10', metalness: 0.2, roughness: 0.7 });

// ---------- hub (lathe with bevelled edges) ----------
function puckProfile(r, h, b) {
  const pts = [new THREE.Vector2(0, 0)];
  const steps = 6;
  for (let i = 0; i <= steps; i++) { const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2); pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, b + Math.sin(a) * b)); }
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * (Math.PI / 2); pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, h - b + Math.sin(a) * b)); }
  pts.push(new THREE.Vector2(0, h));
  return pts;
}
const hub = new THREE.Group();
const hubBody = new THREE.Mesh(new THREE.LatheGeometry(puckProfile(2.0, 0.5, 0.07), 128), productMat);
hub.add(hubBody);
const groove = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.012, 8, 160), grooveMat);
groove.rotation.x = Math.PI / 2; groove.position.y = 0.502; hub.add(groove);
// Side port + seam: small physical details that make the hub's turn readable.
const port = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.06), portMat);
port.position.set(0, 0.25, 2.0); hub.add(port);
const seam = new THREE.Mesh(new THREE.TorusGeometry(2.003, 0.006, 6, 160), grooveMat);
seam.rotation.x = Math.PI / 2; seam.position.y = 0.16; hub.add(seam);
// Status light
const ledMat = new THREE.MeshBasicMaterial({ color: '#1A2222', toneMapped: false });
const led = new THREE.Mesh(new THREE.CircleGeometry(0.16, 48), ledMat);
led.rotation.x = -Math.PI / 2; led.position.y = 0.505; hub.add(led);

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = glowTexture();
const ledGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PAL.accent, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
ledGlow.position.y = 0.56; ledGlow.scale.set(1.1, 1.1, 1); hub.add(ledGlow);
scene.add(hub);

// ---------- orbit ring ----------
const ORBIT = 4.4;
const ringPts = []; for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * ORBIT, 0.06, Math.sin(a) * ORBIT)); }
const ringMat = new THREE.LineBasicMaterial({ color: PAL.ring, transparent: true, opacity: 0, toneMapped: false });
const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), ringMat);
scene.add(ring);

// ---------- satellite nodes + threads ----------
const NODE_ANGLES = [Math.PI, -Math.PI / 3, 0]; // left, rear-right, right (azimuth in x/z plane, -z is away)
const THREAD_TIMES = [[1.15, 0.5], [1.32, 0.5], [1.49, 0.5]];
const NODE_IN = [0.72, 0.86, 1.0];
const TUB = 96, RAD = 8;
const nodes = NODE_ANGLES.map((ang, i) => {
  const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(puckProfile(0.42, 0.14, 0.035), 64), productMat);
  g.add(body);
  const lm = new THREE.MeshBasicMaterial({ color: '#1A2222', toneMapped: false });
  const l = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 48), lm); l.rotation.x = -Math.PI / 2; l.position.y = 0.143; g.add(l);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PAL.accent, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  glow.position.y = 0.18; glow.scale.set(0.9, 0.9, 1); g.add(glow);
  g.position.copy(dir.clone().multiplyScalar(ORBIT));
  scene.add(g);
  // Thread: lifted arc from hub rim to node rim
  const a0 = dir.clone().multiplyScalar(2.02).setY(0.22);
  const a2 = dir.clone().multiplyScalar(ORBIT - 0.44).setY(0.08);
  const a1 = dir.clone().multiplyScalar((2.02 + ORBIT - 0.44) / 2).setY(0.62);
  const curve = new THREE.QuadraticBezierCurve3(a0, a1, a2);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, TUB, 0.024, RAD, false), new THREE.MeshBasicMaterial({ color: PAL.thread, toneMapped: false }));
  tube.geometry.setDrawRange(0, 0);
  scene.add(tube);
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PAL.accent, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  head.scale.set(0.5, 0.5, 1); scene.add(head);
  return { g, lm, glow, curve, tube, head };
});

// ---------- time functions ----------
const ease = {
  io: gsap.parseEase('power2.inOut'), out: gsap.parseEase('power2.out'), back: gsap.parseEase('back.out(1.2)'), sine: gsap.parseEase('sine.inOut')
};
const seg = (t, s, d) => Math.min(1, Math.max(0, (t - s) / d));
const lerp = (a, b, k) => a + (b - a) * k;
const dark = new THREE.Color('#1A2222'), acc = new THREE.Color(PAL.accent);

// Camera: deliberate high-angle approach that settles into the low frontal product view.
const CAM0 = { el: 0.50, az: -0.34, dist: 12.2, ty: 0.15 };
const CAM1 = { el: 0.235, az: 0.0, dist: 14.6, ty: 0.55 };
function poseCamera(k) {
  const el = lerp(CAM0.el, CAM1.el, k), az = lerp(CAM0.az, CAM1.az, k), d = lerp(CAM0.dist, CAM1.dist, k);
  camera.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
  camera.lookAt(0, lerp(CAM0.ty, CAM1.ty, k), 0);
  camera.updateMatrixWorld();
}

function renderAt(t) {
  t = Math.min(DURATION, Math.max(0, t));
  poseCamera(ease.io(seg(t, 0, 1.4)));
  // Hub: rises out of the void, turns its port to camera and levels, then settles.
  const h = ease.out(seg(t, 0, 1.25));
  hub.position.y = lerp(-0.7, 0, h);
  hub.rotation.y = lerp(-1.1, 0, h);
  hub.rotation.x = lerp(0.2, 0, h);
  productMat.opacity = 1;
  ringMat.opacity = 0.32 * ease.sine(seg(t, 0.35, 0.6));
  // Status light switches on once the hub has landed.
  const on = ease.back(seg(t, 0.98, 0.32));
  ledMat.color.copy(dark).lerp(acc, Math.min(1, on));
  ledGlow.material.opacity = 0.85 * Math.min(1, on);
  ledGlow.scale.setScalar(lerp(0.4, 1.1, on));
  nodes.forEach((n, i) => {
    const s = ease.back(seg(t, NODE_IN[i], 0.4));
    n.g.scale.setScalar(Math.max(0.0001, s));
    n.g.visible = s > 0.001;
    const [ts, td] = THREAD_TIMES[i];
    const p = ease.io(seg(t, ts, td));
    const segs = Math.round(p * TUB);
    n.tube.geometry.setDrawRange(0, segs * RAD * 6);
    // Signal head rides the drawing tip, then dissolves into the node.
    const drawing = p > 0 && p < 1;
    n.head.visible = drawing || seg(t, ts + td, 0.2) < 1;
    n.head.position.copy(n.curve.getPoint(p));
    n.head.material.opacity = p <= 0 ? 0 : (drawing ? 0.9 : 0.9 * (1 - seg(t, ts + td, 0.2)));
    const lit = ease.out(seg(t, ts + td - 0.04, 0.25));
    n.lm.color.copy(dark).lerp(acc, lit);
    n.glow.material.opacity = 0.7 * lit;
  });
  renderer.render(scene, camera);
}

// Leader-line anchor: project the status light at the settled camera pose (deterministic).
poseCamera(1); hub.position.set(0, 0, 0); hub.rotation.set(0, 0, 0); hub.updateMatrixWorld();
const ledScreen = new THREE.Vector3(0, 0.505, 0).project(camera);
const lx = Math.round((ledScreen.x * 0.5 + 0.5) * W), ly = Math.round((-ledScreen.y * 0.5 + 0.5) * H);
const leader = document.getElementById('leader');
leader.setAttribute('d', `M${lx} ${ly - 8}V250H${lx + 60}`);
document.getElementById('status-label').setAttribute('x', String(lx + 68));

// ---------- renderer API (timeline is built and registered in index.html) ----------
renderAt(0);
window.__styleScene = { renderAt, duration: DURATION };
