// Stop-motion clay tabletop: an idea (yellow clay ball) becomes a connected system
// (clay blocks joined by rolled clay coils). Three.js owns rendering only; every pose is a
// pure function of composition time quantized to 12 exposures per second ("on twos").
import * as THREE from 'three';

export const EXPOSURES_PER_SECOND = 12;
const W = 1280, H = 720;

// ---------- deterministic helpers ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(i, j) { // stable per-exposure hand-placement offset in [-1,1]
  let h = Math.imul(i * 374761393 + j * 668265263, 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;

// ---------- procedural textures (built once, cached) ----------
function canvasTex(size, draw, srgb) {
  const c = document.createElement('canvas');
  c.width = size[0]; c.height = size[1];
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Painted sage card backdrop: flat, low detail, soft falloff + fine brush grain.
function backdropTexture() {
  return canvasTex([1024, 512], (g, w, h) => {
    const rnd = mulberry32(83);
    g.fillStyle = '#B7C9B3'; g.fillRect(0, 0, w, h);
    const v = g.createRadialGradient(w * 0.42, h * 0.62, h * 0.2, w * 0.5, h * 0.6, w * 0.72);
    v.addColorStop(0, 'rgba(196,212,190,0.55)');
    v.addColorStop(1, 'rgba(120,145,122,0.2)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { // short horizontal brush strokes
      const x = rnd() * w, y = rnd() * h, l = 6 + rnd() * 26;
      g.strokeStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(40,60,44,0.035)';
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (rnd() - 0.5) * 2); g.stroke();
    }
  }, true);
}

// Kraft card tabletop with faint corrugation ribs and paper fibres.
function tableTexture() {
  return canvasTex([1024, 1024], (g, w, h) => {
    const rnd = mulberry32(1083);
    g.fillStyle = '#B49A78'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = 'rgba(80,60,36,0.07)'; g.fillRect(x, 0, 6, h);
      g.fillStyle = 'rgba(255,240,215,0.05)'; g.fillRect(x + 8, 0, 4, h);
    }
    for (let i = 0; i < 5200; i++) {
      const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, l = 3 + rnd() * 10;
      g.strokeStyle = rnd() > 0.55 ? 'rgba(90,66,40,0.16)' : 'rgba(235,215,185,0.14)';
      g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }, true);
}

// Grey-scale clay bump: soft thumb dents and fine fingerprint arcs.
function clayBump(seed) {
  return canvasTex([512, 512], (g, w, h) => {
    const rnd = mulberry32(seed);
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = rnd() * w, y = rnd() * h, r = 14 + rnd() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const d = rnd() > 0.5 ? 0 : 255;
      gr.addColorStop(0, `rgba(${d},${d},${d},0.18)`); gr.addColorStop(1, `rgba(${d},${d},${d},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 18; i++) {
      const x = rnd() * w, y = rnd() * h;
      for (let k = 0; k < 7; k++) {
        g.strokeStyle = 'rgba(60,60,60,0.22)'; g.lineWidth = 1;
        g.beginPath(); g.arc(x, y, 5 + k * 3.2, rnd() * 6, rnd() * 6 + 1.6); g.stroke();
      }
    }
  }, false);
}

// ---------- clay geometry ----------
function lumpy(geo, seed, amount) {
  const rnd = mulberry32(seed);
  const ph = Array.from({ length: 9 }, () => rnd() * 6.283);
  const p = geo.attributes.position, n = new THREE.Vector3(), v = new THREE.Vector3();
  geo.computeVertexNormals();
  const nr = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
    const d = Math.sin(v.x * 5.1 + ph[0]) * Math.sin(v.y * 4.3 + ph[1]) * Math.sin(v.z * 4.7 + ph[2])
      + 0.5 * Math.sin(v.x * 11.0 + ph[3] + v.z * 3.0) * Math.sin(v.y * 9.0 + ph[4])
      + 0.25 * Math.sin(v.z * 17.0 + ph[5]) * Math.sin(v.x * 15.0 + ph[6]);
    v.addScaledVector(n, d * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
function roundedBlock(sx, sy, sz, r, seed) {
  const geo = new THREE.BoxGeometry(sx, sy, sz, 18, 18, 18);
  const p = geo.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = sx / 2 - r, hy = sy / 2 - r, hz = sz / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    v.sub(c).normalize().multiplyScalar(r).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.translate(0, sy / 2, 0); // pivot on the contact face
  return lumpy(geo, seed, 0.012);
}
function clayMat(hex, seed) {
  const bump = clayBump(seed);
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.86, metalness: 0, bumpMap: bump, bumpScale: 1.2 });
}

// ---------- choreography (exposure-quantized) ----------
// Idea ball: lowered drop 0.08–0.50 s, squash exposure, small rebound, settle by 0.83 s.
// Blocks k land at LAND[k]; the clay coil reaching each block is rolled out just before it lands.
const LAND = [1.17, 1.5, 1.83, 2.17];
const COIL = [ // [fromNode, toNode]; node 0 = idea ball
  [0, 1], [1, 2], [2, 3], [0, 4],
];

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  camera.position.set(0, 4.1, 10.2);
  camera.lookAt(0, 1.05, 0);

  // Painted backdrop: unlit so its value under the title stays predictable.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), new THREE.MeshBasicMaterial({ map: backdropTexture() }));
  wall.position.set(0, 6.5 - 0.02, -3.2);
  scene.add(wall);
  // Kraft table top (receives contact shadows).
  const table = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), new THREE.MeshStandardMaterial({ map: tableTexture(), roughness: 0.95, metalness: 0 }));
  table.rotation.x = -Math.PI / 2; table.position.set(0, 0, 2.8); table.receiveShadow = true;
  scene.add(table);

  // Broad soft frontal key, warm; cool sky fill (as in the reviewed source's soft frontal light).
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x7a6448, 1.15));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.1);
  key.position.set(-3.5, 7.5, 6.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.camera.near = 1; key.shadow.camera.far = 25;
  key.shadow.radius = 6; key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.5); rim.position.set(4, 3, -4); scene.add(rim);

  // Props.
  const R = 0.62;
  const ballGeo = lumpy(new THREE.SphereGeometry(R, 72, 48), 7, 0.014);
  ballGeo.translate(0, R, 0);
  const ball = new THREE.Mesh(ballGeo, clayMat('#E9B634', 11));
  ball.castShadow = true; ball.receiveShadow = true;
  const ballHome = new THREE.Vector3(-3.05, 0, 0.55);
  scene.add(ball);

  const blockSpec = [
    { pos: [-0.75, 0, 1.25], size: [1.05, 0.78, 0.8], color: '#C9432C', rot: 0.18 },
    { pos: [0.85, 0, -0.75], size: [0.95, 0.72, 0.78], color: '#2F5FA6', rot: -0.22 },
    { pos: [2.95, 0, 0.55], size: [1.0, 0.82, 0.78], color: '#ECE4D4', rot: 0.12 },
    { pos: [0.95, 0, 2.55], size: [1.05, 0.7, 0.8], color: '#3C443C', rot: -0.1 },
  ];
  const blocks = blockSpec.map((s, k) => {
    const m = new THREE.Mesh(roundedBlock(s.size[0], s.size[1], s.size[2], 0.13, 31 + k), clayMat(s.color, 41 + k));
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return { mesh: m, home: new THREE.Vector3(...s.pos), rot: s.rot };
  });

  // Rolled clay coils lying on the kraft card.
  const nodes = [ballHome, ...blocks.map((b) => b.home)];
  const coilMat = clayMat('#3C443C', 77);
  const coilR = 0.055, TUB = 120, RAD = 10;
  const coils = COIL.map(([a, b], k) => {
    const A = nodes[a], B = nodes[b];
    const mid = A.clone().lerp(B, 0.5);
    const dir = B.clone().sub(A); const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const bend = (k % 2 ? -1 : 1) * 0.55 + (k === 3 ? 0.9 : 0);
    const pts = [A, A.clone().lerp(B, 0.25).addScaledVector(side, bend * 0.8), mid.clone().addScaledVector(side, bend), A.clone().lerp(B, 0.75).addScaledVector(side, bend * 0.6), B]
      .map((p) => new THREE.Vector3(p.x, coilR * 0.92, p.z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, TUB, coilR, RAD, false);
    const mesh = new THREE.Mesh(geo, coilMat); mesh.castShadow = true; mesh.receiveShadow = true;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(coilR * 1.02, 16, 12), coilMat); tip.castShadow = true;
    scene.add(mesh); scene.add(tip);
    return { mesh, tip, curve, geo };
  });

  // ---------- pose evaluation ----------
  function placeJitter(mesh, exposure, id, moving) {
    if (!moving) return;
    mesh.position.x += hash(exposure, id) * 0.012;
    mesh.position.z += hash(exposure, id + 50) * 0.012;
    mesh.rotation.y += hash(exposure, id + 90) * 0.012;
  }

  function poseBall(tq, ex) {
    ball.position.copy(ballHome); ball.scale.set(1, 1, 1); ball.rotation.set(0, 0, 0);
    let y = 0, sy = 1, moving = true;
    if (tq < 0.08) { y = 4.2; }
    else if (tq < 0.5) { const k = (tq - 0.08) / 0.42; y = 4.2 * (1 - k * k); ball.rotation.z = (1 - k) * 0.5; }
    else if (tq < 0.58) { y = 0; sy = 0.78; }       // contact exposure: squash
    else if (tq < 0.67) { y = 0.16; sy = 1.08; }    // rebound
    else if (tq < 0.75) { y = 0.05; sy = 0.97; }
    else { moving = tq < 0.83; }
    ball.position.y = y;
    ball.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    placeJitter(ball, ex, 1, moving && tq >= 0.5);
  }

  function poseBlock(b, k, tq, ex) {
    const L = LAND[k];
    const m = b.mesh;
    m.position.copy(b.home); m.rotation.set(0, b.rot, 0); m.scale.set(1, 1, 1);
    m.visible = tq >= L - 0.34;
    if (!m.visible) return;
    let y = 0, sy = 1, tilt = 0, moving = true;
    if (tq < L) { const k2 = (L - tq) / 0.34; y = 1.4 * k2 * k2; tilt = 0.22 * k2; }   // lowered into place
    else if (tq < L + 0.09) { sy = 0.86; }          // weight lands
    else if (tq < L + 0.17) { sy = 1.04; }
    else { moving = false; }
    m.position.y = y; m.rotation.z = tilt * (k % 2 ? -1 : 1);
    m.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    placeJitter(m, ex, 10 + k, moving);
  }

  function poseCoil(c, k, tq) {
    const L = LAND[k];
    const p = clamp01((tq - (L - 0.5)) / 0.5); // rolled out over 6 exposures, arrives as the block lands
    const segs = Math.round(p * TUB);
    c.geo.setDrawRange(0, segs * RAD * 6);
    c.mesh.visible = segs > 0;
    c.tip.visible = segs > 0 && segs < TUB;
    if (c.tip.visible) c.tip.position.copy(c.curve.getPointAt(segs / TUB));
  }

  function render(t) {
    const ex = Math.floor(Math.max(0, t) * EXPOSURES_PER_SECOND + 1e-6);
    const tq = ex / EXPOSURES_PER_SECOND;
    poseBall(tq, ex);
    blocks.forEach((b, k) => poseBlock(b, k, tq, ex));
    coils.forEach((c, k) => poseCoil(c, k, tq));
    renderer.render(scene, camera);
    return ex;
  }

  return { render, camera, nodes, exposure: (t) => Math.floor(Math.max(0, t) * EXPOSURES_PER_SECOND + 1e-6) };
}

if (typeof window !== 'undefined') window.StopMotionScene = { createScene, EXPOSURES_PER_SECOND };
