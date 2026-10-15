// style-110 · 3D Motion Graphics — procedural Three.js assembly scene.
// All state is a pure function of composition time t (seconds). The only
// simulation (XPBD node seating) is baked once at load with a fixed step and
// sampled by time, so direct, backward and out-of-order seeks are identical.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const PALETTE = { background: '#EDE9E1', foreground: '#303C40', accent1: '#748E8A', accent2: '#B9866C' };
const DURATION = 3;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, u) => a + (b - a) * u;
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2); // power2.inOut
const easeOut = (u) => 1 - Math.pow(1 - u, 3); // power3.out-like
const backOut = (u, s = 1.4) => { const c = s + 1; return 1 + c * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2); };

// ---------- assembly layout (world units, floor at y = 0) ----------
const PEDESTAL_H = 0.2;
const CORE_R = 1.1;
const CORE = new THREE.Vector3(0, PEDESTAL_H + CORE_R, 0);
const NODES = [
  // rel offset from core centre, radius, rod start time, activation time
  { rel: [-1.6, 1.1, -1.4], r: 0.42, rod: 0.32, act: 0.5 },   // upper-left (back)
  { rel: [1.7, 1.2, -1.2], r: 0.46, rod: 0.44, act: 0.64 },   // upper-right (back)
  { rel: [-2.0, -0.7, 1.1], r: 0.6, rod: 0.56, act: 0.78 },   // lower-left, rests on floor
  { rel: [2.1, -0.75, 0.9], r: 0.55, rod: 0.68, act: 0.92 },  // lower-right, rests on floor
].map((n) => {
  const rel = new THREE.Vector3(...n.rel);
  const target = CORE.clone().add(rel);
  const dir = rel.clone().normalize();
  // exploded start: lifted and pushed outward along the rod axis
  const start = target.clone().addScaledVector(dir, 1.5).add(new THREE.Vector3(0, 2.0, 0));
  return { ...n, rel, target, dir, L: rel.length(), start };
});
const ROD_GROW = 0.36;

// ---------- XPBD bake: compliant attachment + unilateral rod-length contact ----------
const BAKE_HZ = 240;
const STEPS = Math.ceil(DURATION * BAKE_HZ);
function bakeNode(n) {
  const h = 1 / BAKE_HZ;
  const alpha = 0.0055;          // attachment compliance (m/N, unit mass)
  const alphaT = alpha / (h * h);
  const damping = 9.0;           // 1/s velocity damping
  const gravity = -3.6;
  const out = new Float32Array((STEPS + 1) * 3);
  const x = n.start.clone();
  const v = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i <= STEPS; i++) {
    const t = i * h;
    if (t >= n.act) {
      prev.copy(x);
      v.y += gravity * h;
      x.addScaledVector(v, h);
      // attachment constraint C = |x - target| (rest 0), lambda reset per step
      d.subVectors(x, n.target);
      const C = d.length();
      if (C > 1e-9) {
        const dl = -C / (1 + alphaT);
        x.addScaledVector(d, dl / C);
      }
      // rod contact: node cannot be pushed closer to the core than the rod length (alpha = 0)
      d.subVectors(x, CORE);
      const dist = d.length();
      if (dist < n.L) x.addScaledVector(d, (n.L - dist) / dist);
      // floor contact
      if (x.y < n.r) x.y = n.r;
      v.subVectors(x, prev).multiplyScalar(1 / h).multiplyScalar(Math.exp(-damping * h));
    }
    out[i * 3] = x.x; out[i * 3 + 1] = x.y; out[i * 3 + 2] = x.z;
  }
  return out;
}
const BAKED = NODES.map(bakeNode);
function sampleNode(i, t, target) {
  const f = clamp01(t / DURATION) * STEPS;
  const a = Math.floor(f), b = Math.min(STEPS, a + 1), u = f - a;
  const s = BAKED[i];
  target.set(lerp(s[a * 3], s[b * 3], u), lerp(s[a * 3 + 1], s[b * 3 + 1], u), lerp(s[a * 3 + 2], s[b * 3 + 2], u));
  // Final hold: the authored scene is exactly seated after 2.4s.
  const lock = clamp01((t - 2.2) / 0.3);
  if (lock > 0) target.lerp(NODES[i].target, easeInOut(lock));
  return target;
}

function radialTexture(size, inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(0,0,0,${inner})`);
  grad.addColorStop(0.55, `rgba(0,0,0,${inner * 0.45})`);
  grad.addColorStop(1, `rgba(0,0,0,${outer})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Subtle deterministic satin microstructure as a roughness map (non-colour data).
function satinRoughnessTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = Math.sin(x * 0.37 + Math.sin(y * 0.11) * 3.0) * 0.5 + Math.sin((x + y) * 0.093) * 0.5;
    const v = Math.round(150 + n * 22);
    const k = (y * size + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

export function createScene(canvas) {
  const W = 1280, H = 720;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.foreground, 11, 26); // atmospheric depth toward the slate stage
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.38;

  const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 60);
  camera.setViewOffset(W, H, 220, 0, W, H); // frame the assembly in the left panel, copy on the right

  // Key light from upper left, soft fill, cool rim.
  const key = new THREE.DirectionalLight(PALETTE.background, 3.1);
  key.position.set(-6, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7; key.shadow.camera.right = 7;
  key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 1; key.shadow.camera.far = 30;
  key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(PALETTE.accent1, PALETTE.foreground, 0.7));
  const rim = new THREE.DirectionalLight(PALETTE.background, 1.6);
  rim.position.set(5, 4, -7);
  scene.add(rim);

  // Ground: shadow catcher over the CSS slate stage.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.42 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Pedestal (bevelled slate plinth with a copper inlay ring).
  const pedestal = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.58, PEDESTAL_H, 96),
    new THREE.MeshPhysicalMaterial({ color: PALETTE.foreground, roughness: 0.5, metalness: 0.15, clearcoat: 0.4, clearcoatRoughness: 0.4 }));
  plinth.position.y = PEDESTAL_H / 2;
  plinth.castShadow = true; plinth.receiveShadow = true;
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.018, 12, 128),
    new THREE.MeshStandardMaterial({ color: PALETTE.accent2, roughness: 0.3, metalness: 1 }));
  inlay.rotation.x = Math.PI / 2; inlay.position.y = PEDESTAL_H;
  pedestal.add(plinth, inlay);
  scene.add(pedestal);

  // Materials: copper core, satin nodes, dark rods.
  const satinRough = satinRoughnessTexture();
  const copper = new THREE.MeshPhysicalMaterial({ color: PALETTE.accent2, metalness: 1, roughness: 0.34, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  const satin = new THREE.MeshPhysicalMaterial({ color: PALETTE.accent1, metalness: 0.35, roughness: 0.42, roughnessMap: satinRough, clearcoat: 0.6, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new THREE.Color(PALETTE.background), sheenRoughness: 0.5 });
  const rodMat = new THREE.MeshPhysicalMaterial({ color: PALETTE.foreground, metalness: 0.85, roughness: 0.28, clearcoat: 0.5 });

  const core = new THREE.Mesh(new THREE.SphereGeometry(CORE_R, 96, 64), copper);
  core.castShadow = true; core.receiveShadow = true;
  scene.add(core);

  const rodGeo = new THREE.CylinderGeometry(0.075, 0.075, 1, 24, 1);
  rodGeo.translate(0, 0.5, 0);
  const sphereGeo = new THREE.SphereGeometry(1, 72, 48);
  const contactTex = radialTexture(128, 0.55, 0);
  const contactGeo = new THREE.PlaneGeometry(1, 1);

  const parts = NODES.map((n) => {
    const rod = new THREE.Mesh(rodGeo, rodMat);
    rod.castShadow = true;
    const node = new THREE.Mesh(sphereGeo, satin);
    node.castShadow = true; node.receiveShadow = true;
    const contact = new THREE.Mesh(contactGeo, new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, fog: false }));
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.004;
    scene.add(rod, node, contact);
    return { rod, node, contact };
  });
  const coreContact = new THREE.Mesh(contactGeo, new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, fog: false }));
  coreContact.rotation.x = -Math.PI / 2;
  coreContact.position.y = PEDESTAL_H + 0.004;
  scene.add(coreContact);

  const UP = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3(), seg = new THREE.Vector3();
  const camTarget = new THREE.Vector3(0, 1.25, 0);

  function render(tRaw) {
    const t = Math.min(DURATION, Math.max(0, Number(tRaw) || 0));

    // Authored camera navigation (replaces live orbit/raycast navigation): weighted 3/4 orbit + dolly settle.
    const cu = easeInOut(clamp01(t / 2.3));
    const az = lerp(-0.52, 0, cu), el = lerp(0.44, 0.3, cu), r = lerp(11.2, 9.4, cu);
    camera.position.set(camTarget.x + r * Math.sin(az) * Math.cos(el), camTarget.y + r * Math.sin(el), camTarget.z + r * Math.cos(az) * Math.cos(el));
    camera.lookAt(camTarget);

    // Core: drops onto the plinth and settles (back ease), never intersecting it.
    const cuCore = clamp01(t / 0.6);
    const cs = cuCore <= 0 ? 0.0001 : Math.max(0.0001, backOut(cuCore, 1.2));
    const coreScale = Math.min(cs, 1.06);
    core.scale.setScalar(coreScale);
    // keep the sphere resting on (never sinking into) the plinth while it overshoots
    core.position.set(0, PEDESTAL_H + CORE_R * coreScale + (1 - easeOut(cuCore)) * 1.4, 0);
    core.rotation.y = lerp(-0.9, 0, easeOut(cuCore));
    const coreSeat = clamp01((t - 0.25) / 0.35);
    coreContact.scale.setScalar(2.3 * Math.max(0.0001, coreSeat));
    coreContact.material.opacity = coreSeat;

    parts.forEach((p, i) => {
      const n = NODES[i];
      // node presence
      const pu = clamp01((t - n.act) / 0.28);
      const s = pu <= 0 ? 0.0001 : n.r * Math.min(1.08, backOut(pu, 1.6));
      p.node.scale.setScalar(Math.max(0.0001, s));
      p.node.visible = pu > 0;
      sampleNode(i, t, p.node.position);

      // rod grows out of the core, then tracks the seated node
      const g = easeOut(clamp01((t - n.rod) / ROD_GROW));
      seg.subVectors(p.node.position, CORE);
      const dist = seg.length();
      const dir = pu > 0 ? seg.normalize() : tmp.copy(n.dir);
      const len = Math.max(0.0001, Math.min(n.L * g, pu > 0 ? dist : n.L));
      p.rod.visible = g > 0.001;
      p.rod.position.copy(CORE);
      p.rod.quaternion.setFromUnitVectors(UP, dir);
      p.rod.scale.set(1, len, 1);

      // contact shadow strengthens as the node nears the floor
      const height = Math.max(0, p.node.position.y - n.r);
      const c = pu * clamp01(1 - height / 3.2);
      p.contact.position.x = p.node.position.x; p.contact.position.z = p.node.position.z;
      p.contact.scale.setScalar(Math.max(0.0001, n.r * (2.6 + height * 0.4)));
      p.contact.material.opacity = c;
    });

    renderer.render(scene, camera);
  }

  return { render, palette: PALETTE, duration: DURATION };
}

window.Style110Scene = { createScene };
