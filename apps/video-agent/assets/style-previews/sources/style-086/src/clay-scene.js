// Claymation simulation scene (Three.js WebGL). No clocks, no unseeded randomness.
// All animated values live in `state`, which is written only by the GSAP pose timeline.
import * as THREE from 'three';

const W = 1280, H = 720;
const COL = {
  backdrop: '#4F7F96', // scene-chosen flat painted card (dusty cerulean), not clay pigment
  terracotta: '#C58D74',
  sage: '#A2A680',
  charcoal: '#444B3D',
  cream: '#F0E4D3',
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(n, k) {
  const r = mulberry32((n * 7919 + k * 104729 + 17) >>> 0);
  return r() * 2 - 1;
}

// svg px -> world (1 unit = 1 px on z=0 plane)
const wx = (x) => x - W / 2;
const wy = (y) => H / 2 - y;

// ---- procedural, seeded clay surface textures (built once at load) ----
function makeClayBump(seed) {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, s, s);
  // soft pressed dents
  for (let i = 0; i < 70; i++) {
    const x = r() * s, y = r() * s, rad = 8 + r() * 34;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const v = r() < 0.5 ? 0 : 255;
    grd.addColorStop(0, `rgba(${v},${v},${v},0.16)`);
    grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fingerprint whorls
  g.lineWidth = 1.3;
  for (let f = 0; f < 6; f++) {
    const cx = r() * s, cy = r() * s, rot = r() * Math.PI;
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    for (let k = 1; k < 9; k++) {
      g.strokeStyle = 'rgba(40,40,40,0.28)';
      g.beginPath();
      g.ellipse(0, 0, k * 3.2, k * 4.3, 0, 0.2, Math.PI * 1.85);
      g.stroke();
    }
    g.restore();
  }
  // fine grit
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 18;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeBackdropTex() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  const g = c.getContext('2d');
  g.fillStyle = COL.backdrop;
  g.fillRect(0, 0, 640, 360);
  // soft painted falloff toward edges (stationary)
  const grd = g.createRadialGradient(300, 170, 60, 320, 180, 420);
  grd.addColorStop(0, 'rgba(255,255,255,0.10)');
  grd.addColorStop(1, 'rgba(10,25,35,0.22)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 640, 360);
  const r = mulberry32(86);
  const img = g.getImageData(0, 0, 640, 360);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 6;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function clayMat(hex, bump) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.93,
    metalness: 0,
    bumpMap: bump,
    bumpScale: 1.6,
  });
}

// lumpy hand-rolled ball: deterministic radial displacement
function lumpySphere(seed, amp = 0.045, wS = 96, hS = 64) {
  const geo = new THREE.SphereGeometry(1, wS, hS);
  const p = geo.attributes.position;
  const r = mulberry32(seed);
  const waves = [];
  for (let i = 0; i < 7; i++) {
    const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    waves.push({ d, f: 1.5 + r() * 3.5, ph: r() * 6.28, a: amp * (0.4 + r()) / 2 });
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let k = 1;
    for (const w of waves) k += w.a * Math.sin(v.dot(w.d) * w.f + w.ph);
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createClayScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;

  const scene = new THREE.Scene();
  const fov = 30;
  const dist = (H / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const camera = new THREE.PerspectiveCamera(fov, W / H, 10, 4000);
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);

  // broad soft frontal light, stable across exposures
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x3a4a52, 1.35));
  const key = new THREE.DirectionalLight(0xfff3e4, 1.9);
  key.position.set(-300, 380, 900);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 9;
  key.shadow.bias = -0.0008;
  const sc = key.shadow.camera;
  sc.left = -760; sc.right = 760; sc.top = 480; sc.bottom = -480; sc.near = 100; sc.far = 2400;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xdfeefa, 0.35);
  fill.position.set(500, -100, 600);
  scene.add(fill);

  // painted backdrop card (stationary)
  const BZ = -95;
  const bscale = (dist - BZ) / dist;
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(W * bscale * 1.04, H * bscale * 1.04),
    new THREE.MeshLambertMaterial({ map: makeBackdropTex() })
  );
  back.position.z = BZ;
  back.receiveShadow = true;
  scene.add(back);

  const bumps = [makeClayBump(11), makeClayBump(23), makeClayBump(37)];
  const mats = {
    terracotta: clayMat(COL.terracotta, bumps[0]),
    sage: clayMat(COL.sage, bumps[1]),
    charcoal: clayMat(COL.charcoal, bumps[2]),
    coil: clayMat(COL.sage, bumps[1]),
  };
  const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  // ---- idea: clay bulb-head character ----
  const idea = new THREE.Group();
  idea.position.set(wx(310), wy(470), 20);
  scene.add(idea);
  const headPivot = new THREE.Group(); // squash pivot at base
  idea.add(headPivot);
  const head = shadowed(new THREE.Mesh(lumpySphere(5, 0.05), mats.terracotta));
  head.scale.set(108, 104, 66);
  head.position.set(0, 52, 0);
  headPivot.add(head);
  // sculpted eyes (charcoal clay beads)
  const eyeGeo = lumpySphere(9, 0.06, 24, 16);
  const eyes = [-32, 30].map((ex) => {
    const e = new THREE.Mesh(eyeGeo, mats.charcoal);
    e.scale.set(9.5, 9.5, 5);
    e.position.set(ex, 70, 60);
    headPivot.add(e);
    return e;
  });
  // replacement mouths
  const mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(30, 4.2, 10, 40, Math.PI * 0.72), mats.charcoal);
  mouthSmile.rotation.z = Math.PI + Math.PI * 0.14;
  mouthSmile.position.set(-1, 52, 63);
  const mouthFlat = new THREE.Mesh(new THREE.CapsuleGeometry(4, 30, 4, 10), mats.charcoal);
  mouthFlat.rotation.z = Math.PI / 2;
  mouthFlat.position.set(-1, 26, 64);
  const mouthO = new THREE.Mesh(new THREE.TorusGeometry(10, 4.5, 10, 28), mats.charcoal);
  mouthO.scale.set(1, 1.2, 1);
  mouthO.position.set(-1, 24, 65);
  const mouthOInner = new THREE.Mesh(new THREE.CircleGeometry(10, 24), new THREE.MeshStandardMaterial({ color: 0x2b2f26, roughness: 1 }));
  mouthOInner.position.set(-1, 24, 64.5);
  mouthOInner.scale.set(1, 1.2, 1);
  const mouths = [mouthFlat, mouthO, mouthSmile];
  headPivot.add(mouthFlat, mouthO, mouthOInner, mouthSmile);
  // bulb base: rolled sage coils + charcoal cap
  const capsule = (r, len, mat, y) => {
    const m = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 20), mat));
    m.rotation.z = Math.PI / 2;
    m.scale.set(1, 1, 0.75);
    m.position.set(0, y, 0);
    idea.add(m);
    return m;
  };
  const base = [capsule(17, 94, mats.sage, wy(537) - wy(470)), capsule(15, 82, mats.sage, wy(565) - wy(470)), capsule(12, 56, mats.charcoal, wy(588) - wy(470))];

  // ---- coils (rolled clay snakes along bezier paths) ----
  const v3 = (x, y, z = 0) => new THREE.Vector3(wx(x), wy(y), z);
  const paths = [
    [[392, 382], [520, 260], [640, 250], [728, 236]],
    [[410, 470], [560, 520], [660, 540], [742, 532]],
    [[800, 230], [900, 260], [950, 300], [962, 336]],
    [[820, 540], [930, 560], [1000, 570], [1050, 568]],
    [[1000, 392], [1040, 450], [1080, 500], [1086, 540]],
  ];
  const SEG = 72, RAD = 12;
  const tipGeo = new THREE.SphereGeometry(RAD, 20, 14);
  const coils = paths.map((pts, i) => {
    const curve = new THREE.CubicBezierCurve3(...pts.map(([x, y], j) => v3(x, y, 4 + Math.sin(j + i) * 6)));
    // slightly uneven hand-rolled thickness
    const geo = new THREE.TubeGeometry(curve, SEG, RAD, 14, false);
    const pos = geo.attributes.position;
    const r = mulberry32(100 + i);
    const ph = r() * 6.28;
    const centre = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let s = 0; s <= SEG; s++) {
      curve.getPointAt(s / SEG, centre);
      const k = 1 + 0.09 * Math.sin(s * 0.45 + ph) + 0.05 * Math.sin(s * 1.3 + ph * 2);
      for (let rr = 0; rr <= 14; rr++) {
        const idx = s * 15 + rr;
        p.fromBufferAttribute(pos, idx).sub(centre).multiplyScalar(k).add(centre);
        pos.setXYZ(idx, p.x, p.y, p.z);
      }
    }
    geo.computeVertexNormals();
    const mesh = shadowed(new THREE.Mesh(geo, mats.coil));
    const tip = shadowed(new THREE.Mesh(tipGeo, mats.coil));
    const root = shadowed(new THREE.Mesh(tipGeo, mats.coil));
    root.position.copy(curve.getPointAt(0));
    scene.add(mesh, tip, root);
    return { curve, mesh, tip, root };
  });

  // ---- system nodes (hand-rolled balls) ----
  const nodeDefs = [
    { x: 770, y: 230, r: 53, mat: mats.sage, seed: 41 },
    { x: 990, y: 370, r: 50, mat: mats.charcoal, seed: 43 },
    { x: 790, y: 530, r: 53, mat: mats.terracotta, seed: 47 },
    { x: 1090, y: 578, r: 49, mat: mats.sage, seed: 53 },
  ];
  const nodes = nodeDefs.map((d) => {
    const g = new THREE.Group();
    g.position.set(wx(d.x), wy(d.y) - d.r * 0.9, 14); // pivot at contact/bottom
    const m = shadowed(new THREE.Mesh(lumpySphere(d.seed, 0.06, 64, 40), d.mat));
    m.scale.set(d.r, d.r * 0.96, d.r * 0.8);
    m.position.y = d.r * 0.9;
    g.add(m);
    scene.add(g);
    return { g, d };
  });

  // ---- pose state: written only by GSAP pose timeline ----
  const state = {
    head: 0, eyes: 1, mouth: 0, lean: 0,
    c0: 0, c1: 0, c2: 0, c3: 0, c4: 0,
    n0: 0, n1: 0, n2: 0, n3: 0,
    exposure: 0, boil: 1,
  };

  function squashScale(obj, v, base = 1) {
    // volume-preserving squash/stretch around a pop value v (0..~1.1)
    const s = Math.max(v, 0.0001);
    const k = (s - 1) * 1.8; // overshoot stretches up, undershoot squashes
    const sy = s * (1 + k);
    const sx = s / Math.sqrt(Math.max(1 + k, 0.2));
    obj.scale.set(sx * base, sy * base, sx * base);
  }

  function apply() {
    const n = state.exposure;
    const b = state.boil;
    // idea head
    const hv = state.head;
    idea.visible = hv > 0.001;
    squashScale(headPivot, hv);
    base.forEach((m, i) => { const s = Math.min(1, Math.max(0.001, hv * 1.4 - i * 0.12)); m.scale.set(s, s, 0.75 * s); });
    headPivot.rotation.z = THREE.MathUtils.degToRad(state.lean + hash(n, 1) * 0.7 * b);
    idea.position.x = wx(310) + hash(n, 2) * 0.8 * b;
    eyes.forEach((e) => { e.scale.y = 9.5 * Math.max(0.15, state.eyes); });
    const mi = Math.round(state.mouth);
    mouths.forEach((m, i) => { m.visible = i === mi; });
    mouthOInner.visible = mi === 1;

    // coils
    coils.forEach((c, i) => {
      const p = state['c' + i];
      const segs = Math.round(p * SEG);
      c.mesh.visible = segs > 0;
      c.root.visible = segs > 0;
      c.tip.visible = segs > 0;
      c.mesh.geometry.setDrawRange(0, segs * 14 * 6);
      if (segs > 0) {
        c.tip.position.copy(c.curve.getPointAt(Math.min(1, segs / SEG)));
        c.tip.position.y += hash(n, 10 + i) * 0.6 * b;
      }
    });
    // nodes
    nodes.forEach((o, i) => {
      const v = state['n' + i];
      o.g.visible = v > 0.001;
      squashScale(o.g, v);
      o.g.rotation.z = THREE.MathUtils.degToRad(hash(n, 20 + i) * 1.2 * b * Math.min(1, v));
      o.g.position.x = wx(o.d.x) + hash(n, 30 + i) * 0.7 * b;
    });
  }

  function render() {
    apply();
    renderer.render(scene, camera);
  }

  return { state, render, renderer };
}

if (typeof window !== 'undefined') window.ClayScene = { createClayScene };
