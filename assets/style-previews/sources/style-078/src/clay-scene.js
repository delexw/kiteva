// Clay-Style 3D scene: "an idea becomes a connected system".
// Digital clay-like treatment (no physical clay was filmed): rounded meshes, matte
// MeshStandardMaterial with seeded bump grain, broad soft lights, contact shadows.
// All state is a pure function of composition time t (seconds). The XPBD rope bake is
// computed once at load with fixed steps and cached, so any seek order gives the same frame.
import * as THREE from 'three';

const W = 1280, H = 720, FPS = 30, DURATION = 3, NF = DURATION * FPS + 1;
const COL = { clay: '#C7917B', sage: '#93AD9E', ink: '#3E4A46', stage: '#2C3A37' };

// ------------------------------------------------------------ deterministic helpers
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

function grainTexture(seed) {
  // tileable value noise, two octaves: restrained handmade surface variation
  const N = 256, rnd = mulberry32(seed), c = document.createElement('canvas');
  c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N);
  const lat = (P) => { const a = new Float32Array(P * P); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const octs = [[8, lat(8), 0.6], [32, lat(32), 0.4]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const [P, L, amp] of octs) {
      const fx = (x / N) * P, fy = (y / N) * P, x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0), x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
      const a = L[y0 * P + x0], b = L[y0 * P + x1], c2 = L[y1 * P + x0], d = L[y1 * P + x1];
      v += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + d * tx) * ty);
    }
    const k = (y * N + x) * 4, u = Math.round(v * 255);
    img.data[k] = img.data[k + 1] = img.data[k + 2] = u; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 2);
  return tex;
}

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------ layout (solved from camera projection)
const HEAD_R = 2.0, SOCK_H = 0.95, HEAD_CY = SOCK_H + HEAD_R * 0.975;
const HEAD_BASE = new THREE.Vector3(-2.98, 0, 2.91);
const ORB_R = 0.95, TUBE_R = 0.21, NP = 18;
const ORBS = {
  D: { pos: new THREE.Vector3(1.31, 0, 3.93), col: 'sage', land: 1.08 },
  A: { pos: new THREE.Vector3(2.73, 0, -3.72), col: 'sage', land: 1.26 },
  C: { pos: new THREE.Vector3(3.82, 0, 1.24), col: 'clay', land: 1.42 },
  B: { pos: new THREE.Vector3(6.93, 0, -0.92), col: 'sage', land: 1.95 },
};
const TUBES = [ // from, to, growStart, growEnd
  ['H', 'D', 0.66, 1.10], ['H', 'A', 0.74, 1.28], ['H', 'C', 0.84, 1.44],
  ['A', 'B', 1.40, 1.92], ['C', 'B', 1.52, 1.96],
];

// ------------------------------------------------------------ analytic keyed motion
function headState(t) {
  const tc = 0.42;
  if (t < tc) { const u = t / tc; return { y: 5.2 * (1 - u * u), sxy: 0.96, sz: 1.06 }; }
  const v = t - tc, a = 0.17 * Math.exp(-7 * v) * Math.cos((2 * Math.PI * v) / 0.34), sz = 1 - a;
  return { y: 0, sxy: 1 / Math.sqrt(sz), sz };
}
const ORB_FALL = 0.26;
function orbState(k, t) {
  const land = ORBS[k].land, t0 = land - ORB_FALL;
  if (t < t0) return { s: 0, y: 1.6, sxy: 0.95, sz: 1.06 }; // hidden, waiting at drop height
  if (t < land) { const u = (t - t0) / ORB_FALL; return { s: 0.55 + 0.45 * Math.min(1, u * 1.6), y: 1.6 * (1 - u * u), sxy: 0.95, sz: 1.06 }; }
  const v = t - land, a = 0.2 * Math.exp(-9 * v) * Math.cos((2 * Math.PI * v) / 0.26), sz = 1 - a;
  return { s: 1, y: 0, sxy: 1 / Math.sqrt(sz), sz };
}
function headMatrix(t) {
  const s = headState(t);
  return new THREE.Matrix4().makeTranslation(HEAD_BASE.x, s.y, HEAD_BASE.z)
    .multiply(new THREE.Matrix4().makeScale(s.sxy, s.sz, s.sxy));
}
function orbCenter(k, t) {
  const s = orbState(k, t);
  return ORBS[k].pos.clone().add(new THREE.Vector3(0, s.y + ORB_R * s.sz * Math.max(s.s, 0.55), 0));
}
function restCenter(k) {
  return k === 'H' ? HEAD_BASE.clone().setY(HEAD_CY) : ORBS[k].pos.clone().setY(ORB_R);
}
function anchor(k, other, t) {
  const toward = restCenter(other);
  if (k === 'H') {
    const M = headMatrix(t), c = new THREE.Vector3(0, HEAD_CY - 0.35, 0);
    const wc = c.clone().applyMatrix4(M), d = toward.clone().sub(wc); d.y = 0; d.normalize();
    const local = c.clone().add(new THREE.Vector3(d.x, -0.2, d.z).normalize().multiplyScalar(HEAD_R * 0.85));
    return local.applyMatrix4(M);
  }
  const c = orbCenter(k, t), d = toward.sub(c); d.y = 0; d.normalize();
  return c.add(d.multiplyScalar(ORB_R * 0.75));
}

// ------------------------------------------------------------ XPBD rope bake (fixed step, cached)
export function bakeRopes() {
  const SUB = 24, dt = 1 / FPS / SUB, g = -26;
  const aDist = 1e-7 / (dt * dt), aBend = 1e-3 / (dt * dt);
  return TUBES.map(([fa, fb]) => {
    const p0 = anchor(fa, fb, 0), p1 = anchor(fb, fa, 0);
    const L = anchor(fa, fb, DURATION).distanceTo(anchor(fb, fa, DURATION)) * 1.07, rest = L / (NP - 1);
    const P = [], V = [], Q = [];
    for (let i = 0; i < NP; i++) { P.push(p0.clone().lerp(p1, i / (NP - 1))); V.push(new THREE.Vector3()); Q.push(new THREE.Vector3()); }
    const frames = new Float32Array(NF * NP * 3), d = new THREE.Vector3();
    const store = (f) => { for (let i = 0; i < NP; i++) P[i].toArray(frames, (f * NP + i) * 3); };
    store(0);
    for (let f = 0; f < NF - 1; f++) {
      for (let s = 1; s <= SUB; s++) {
        const t = (f + s / SUB) / FPS;
        for (let i = 0; i < NP; i++) Q[i].copy(P[i]);
        for (let i = 1; i < NP - 1; i++) { V[i].multiplyScalar(0.985); V[i].y += g * dt; P[i].addScaledVector(V[i], dt); }
        P[0].copy(anchor(fa, fb, t)); P[NP - 1].copy(anchor(fb, fa, t));
        for (const [span, alpha, rl] of [[1, aDist, rest], [2, aBend, rest * 2 * 0.985]]) {
          for (let i = 0; i + span < NP; i++) {
            const j = i + span, wi = i === 0 ? 0 : 1, wj = j === NP - 1 ? 0 : 1;
            if (wi + wj === 0) continue;
            d.subVectors(P[j], P[i]); const ln = d.length(); if (ln < 1e-9) continue;
            const lam = -(ln - rl) / (wi + wj + alpha); d.multiplyScalar(1 / ln);
            P[i].addScaledVector(d, -lam * wi); P[j].addScaledVector(d, lam * wj);
          }
        }
        for (let i = 1; i < NP - 1; i++) if (P[i].y < TUBE_R) { // floor contact with friction
          P[i].y = TUBE_R; P[i].x = Q[i].x + (P[i].x - Q[i].x) * 0.2; P[i].z = Q[i].z + (P[i].z - Q[i].z) * 0.2;
        }
        for (let i = 1; i < NP - 1; i++) V[i].subVectors(P[i], Q[i]).multiplyScalar(1 / dt);
      }
      store(f + 1);
    }
    return frames;
  });
}

// ------------------------------------------------------------ scene construction
export function createClayScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.stage);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  camera.position.set(0.6, 12, 15.5); camera.lookAt(0.6, 0.6, -0.4);

  const grain = grainTexture(78);
  const mat = (hex, bump = 0.9, rough = 0.86) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, bumpMap: grain, bumpScale: bump });
  const M = { clay: mat(COL.clay), sage: mat(COL.sage), ink: mat(COL.ink, 0.4, 0.9), tube: mat(COL.clay, 0.7), stage: new THREE.MeshStandardMaterial({ color: COL.stage, roughness: 1, metalness: 0 }) };

  // seamless cyclorama sweep: floor -> cove -> wall
  {
    const prof = [];
    for (let i = 0; i <= 12; i++) prof.push([14 - i * 1.4, 0]);
    const R = 4.5, z0 = -2.8;
    for (let i = 1; i <= 18; i++) { const a = (i / 18) * Math.PI / 2; prof.push([z0 - R * Math.sin(a), R - R * Math.cos(a)]); }
    for (let i = 1; i <= 4; i++) prof.push([z0 - R, R + i * 4]);
    const pos = [], idx = [];
    for (const [z, y] of prof) { pos.push(-40, y, z, 40, y, z); }
    for (let j = 0; j < prof.length - 1; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const cyc = new THREE.Mesh(g, M.stage); cyc.receiveShadow = true; scene.add(cyc);
  }

  // broad soft lighting
  scene.add(new THREE.HemisphereLight('#E9F1EC', '#1E2826', 0.75));
  const key = new THREE.DirectionalLight('#FFF3E6', 1.25); key.position.set(-6, 14, 9); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 50 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 6; scene.add(key);
  const fill = new THREE.DirectionalLight('#D8E8EE', 0.35); fill.position.set(10, 5, 7); scene.add(fill);
  const rim = new THREE.DirectionalLight('#F2E9DA', 0.55); rim.position.set(2, 7, -12); scene.add(rim);
  const pool = new THREE.SpotLight('#F2E9DA', 0.9, 0, 0.62, 1, 0); pool.position.set(1.5, 18, 3); pool.target.position.set(1.5, 0, 0.5);
  scene.add(pool, pool.target);

  const blobTex = blobTexture();
  const blob = (size) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: '#0d1413' }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 1; scene.add(m); return m;
  };

  // idea bulb: clay head on an ink socket with sage grooves
  const head = new THREE.Group(); scene.add(head);
  const headBlob = blob(HEAD_R * 3.4);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 96, 64), M.clay);
  headMesh.position.y = HEAD_CY; headMesh.scale.set(1, 1.06, 0.95); headMesh.castShadow = headMesh.receiveShadow = true; head.add(headMesh);
  {
    const pts = [new THREE.Vector2(0, 0)]; const r = 0.82, h = SOCK_H + 0.25, b = 0.22;
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(r - b + b * Math.sin(a), b - b * Math.cos(a))); }
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(r - b + b * Math.cos(a), h - b + b * Math.sin(a))); }
    pts.push(new THREE.Vector2(0, h));
    const sock = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), M.ink); sock.castShadow = sock.receiveShadow = true; head.add(sock);
    for (const y of [0.36, 0.64]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.065, 16, 72), M.sage);
      ring.rotation.x = Math.PI / 2; ring.position.y = y; ring.castShadow = true; head.add(ring);
    }
  }
  { // brow arc pressed into the clay, facing the camera
    const c = new THREE.Vector3(0, HEAD_CY, 0), view = camera.position.clone().sub(HEAD_BASE.clone().setY(HEAD_CY));
    view.y = 0; view.normalize(); const right = new THREE.Vector3(view.z, 0, -view.x);
    const arc = [];
    for (let i = 0; i <= 12; i++) {
      const u = -1 + (2 * i) / 12, ah = u * 0.46, av = 0.26 + 0.2 * (1 - u * u);
      const d = view.clone().multiplyScalar(Math.cos(ah)).addScaledVector(right, Math.sin(ah)).multiplyScalar(Math.cos(av)).add(new THREE.Vector3(0, Math.sin(av), 0));
      arc.push(c.clone().add(new THREE.Vector3(d.x * HEAD_R, d.y * HEAD_R * 1.06, d.z * HEAD_R * 0.95).multiplyScalar(1.005)));
    }
    const brow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 48, 0.11, 12, false), M.ink);
    brow.castShadow = true; head.add(brow);
    for (const e of [arc[0], arc[12]]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), M.ink); cap.position.copy(e); head.add(cap); }
  }

  // orbs (origin at floor contact)
  const orbGeo = new THREE.SphereGeometry(ORB_R, 64, 40); orbGeo.translate(0, ORB_R, 0);
  const orbs = {};
  for (const k of Object.keys(ORBS)) {
    const m = new THREE.Mesh(orbGeo, M[ORBS[k].col]); m.castShadow = m.receiveShadow = true; scene.add(m);
    orbs[k] = { mesh: m, blob: blob(ORB_R * 3.3) };
  }

  // tubes
  const ropes = bakeRopes();
  const capGeo = new THREE.SphereGeometry(TUBE_R, 20, 14);
  const tubes = TUBES.map(() => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), M.tube); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
    const tip = new THREE.Mesh(capGeo, M.tube); tip.castShadow = true; scene.add(tip);
    return { mesh, tip };
  });
  const tmp = [];
  for (let i = 0; i < NP; i++) tmp.push(new THREE.Vector3());

  function ropeAt(ti, t) {
    const f = Math.min(NF - 1, Math.max(0, t * FPS)), f0 = Math.floor(f), f1 = Math.min(NF - 1, f0 + 1), w = f - f0, R = ropes[ti];
    return tmp.map((_, i) => {
      const a = (f0 * NP + i) * 3, b = (f1 * NP + i) * 3;
      return new THREE.Vector3(R[a] + (R[b] - R[a]) * w, R[a + 1] + (R[b + 1] - R[a + 1]) * w, R[a + 2] + (R[b + 2] - R[a + 2]) * w);
    });
  }

  function renderAt(time) {
    const t = Math.min(DURATION, Math.max(0, Number(time) || 0));
    const hs = headState(t);
    head.position.set(HEAD_BASE.x, hs.y, HEAD_BASE.z); head.scale.set(hs.sxy, hs.sz, hs.sxy);
    const hLift = Math.min(1, hs.y / 5.2);
    headBlob.position.set(HEAD_BASE.x + 0.25, 0.012, HEAD_BASE.z + 0.15);
    headBlob.scale.setScalar((1 + 0.5 * hLift) * hs.sxy); headBlob.material.opacity = 1 - 0.75 * hLift;
    for (const k of Object.keys(ORBS)) {
      const s = orbState(k, t), o = orbs[k];
      o.mesh.visible = s.s > 0; o.blob.visible = s.s > 0;
      o.mesh.position.set(ORBS[k].pos.x, s.y, ORBS[k].pos.z); o.mesh.scale.set(s.s * s.sxy, s.s * s.sz, s.s * s.sxy);
      const lift = Math.min(1, s.y / 1.6);
      o.blob.position.set(ORBS[k].pos.x + 0.12, 0.014, ORBS[k].pos.z + 0.08);
      o.blob.scale.setScalar(Math.max(0.01, s.s * s.sxy * (1 + 0.4 * lift))); o.blob.material.opacity = 1 - 0.7 * lift;
    }
    TUBES.forEach(([, , g0, g1], ti) => {
      const grow = smooth((t - g0) / (g1 - g0)), tb = tubes[ti];
      tb.mesh.geometry.dispose();
      if (grow <= 0.002) { tb.mesh.visible = tb.tip.visible = false; tb.mesh.geometry = new THREE.BufferGeometry(); return; }
      const curve = new THREE.CatmullRomCurve3(ropeAt(ti, t), false, 'centripetal');
      const seg = Math.max(4, Math.round(64 * grow)), part = [];
      for (let i = 0; i <= seg; i++) part.push(curve.getPointAt((i / seg) * grow));
      tb.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(part, false, 'centripetal'), seg, TUBE_R, 16, false);
      tb.mesh.visible = tb.tip.visible = true; tb.tip.position.copy(part[part.length - 1]);
    });
    renderer.render(scene, camera);
  }

  renderAt(0);
  return { renderAt, duration: DURATION };
}

if (typeof window !== 'undefined') window.ClayScene = { createClayScene };
