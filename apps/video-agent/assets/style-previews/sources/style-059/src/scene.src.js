// Low-Poly 3D — "An idea connects." Dusk-highland scene.
// Every visual state is a pure function of composition time t (seconds).
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, FogExp2, HemisphereLight,
  DirectionalLight, AmbientLight, PointLight, Mesh, MeshStandardMaterial, PlaneGeometry,
  IcosahedronGeometry, DodecahedronGeometry, CylinderGeometry, ConeGeometry,
  OctahedronGeometry, Float32BufferAttribute, Vector3, Quaternion, Group,
  PCFSoftShadowMap, SRGBColorSpace, NoToneMapping, CircleGeometry, MeshBasicMaterial
} from 'three';

export const W = 1280, H = 720, DURATION = 3;

// ---------- resolved scene palette (scene_dependent policy) ----------
export const PAL = {
  sky: '#2B464D',        // dusk teal atmosphere: clear colour + fog colour
  groundCool: '#3E5C57', // muted teal-moss terrain field
  groundCool2: '#35504C',
  plateau: '#A8775B',    // warm faceted plateau: dominant warm mid-value mass
  plateau2: '#946650',
  rock: '#6E7B7A',       // neutral pedestal rock
  mountain: '#3A5559',
  slate: '#34484C', sage: '#799C8C', terracotta: '#C28A68', cream: '#F1EBDF',
  spark: '#F2B65A',      // single high-chroma "idea" accent
  keyLight: '#FFE1C2', hemiSky: '#9FC3D0', hemiGround: '#3A3346'
};

// ---------- deterministic helpers ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const prog = (t, a, d) => clamp01((t - a) / d);
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInOutQuad = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const backOut = (x, s = 1.6) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2));
const lerp = (a, b, k) => a + (b - a) * k;

// smooth value noise from a fixed hash (no Math.random)
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
// Network sits on a low plateau centred near (2.6, 0, 0.2).
const PLATEAU = { x: 2.6, z: 0.2, r: 5.2 };
export function terrainHeight(x, z) {
  const n = vnoise(x * 0.18, z * 0.18) * 2.2 + vnoise(x * 0.45 + 7, z * 0.45 - 3) * 0.7 - 1.2;
  const d = Math.hypot(x - PLATEAU.x, z - PLATEAU.z);
  const m = clamp01((d - PLATEAU.r) / 4); // 0 on plateau, 1 outside
  return lerp(0.15 + n * 0.08, n * 1.4 - 0.4, m * m);
}

// ---------- network layout (world space, y up) ----------
// core + four linked forms = five faceted forms, five links (matches ILLUSTRATION)
export const NODES = [
  { id: 'core', x: 0.0, z: 0.0, ped: 0.9, r: 1.0, delay: 0 },
  { id: 'A', x: 3.0, z: -2.6, ped: 1.1, r: 0.48 },
  { id: 'D', x: 6.2, z: -1.0, ped: 0.6, r: 0.44 },
  { id: 'B', x: 3.7, z: 1.5, ped: 0.45, r: 0.52 },
  { id: 'E', x: 1.4, z: 3.0, ped: 0.25, r: 0.38 }
];
// from, to, colour role, start, duration
export const LINKS = [
  { a: 0, b: 1, col: 'slate', s: 0.78, d: 0.40 },
  { a: 0, b: 3, col: 'sage', s: 0.92, d: 0.40 },
  { a: 0, b: 4, col: 'terracotta', s: 1.06, d: 0.34 },
  { a: 1, b: 2, col: 'terracotta', s: 1.26, d: 0.40 },
  { a: 3, b: 2, col: 'slate', s: 1.44, d: 0.40 }
];
// node gem pops when its first incoming link arrives
const NODE_ARRIVAL = [0.12, 1.18, 1.66, 1.32, 1.40];

// ---------- geometry builders ----------
function facetColors(geo, colors, seed, jitter = 0.06) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const rnd = mulberry32(seed);
  const arr = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let f = 0; f < pos.count / 3; f++) {
    const pick = typeof colors === 'function' ? colors(f, g, rnd) : colors[f % colors.length];
    c.set(pick);
    const k = 1 + (rnd() - 0.5) * 2 * jitter;
    for (let v = 0; v < 3; v++) {
      arr[(f * 3 + v) * 3] = clamp01(c.r * k);
      arr[(f * 3 + v) * 3 + 1] = clamp01(c.g * k);
      arr[(f * 3 + v) * 3 + 2] = clamp01(c.b * k);
    }
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}
const flatMat = (opts = {}) => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, ...opts });

function buildTerrain() {
  const geo = new PlaneGeometry(70, 60, 34, 30);
  geo.rotateX(-Math.PI / 2);
  geo.translate(2, 0, -8); // world-space vertices: foreground to the far ridge
  const p = geo.getAttribute('position');
  const rnd = mulberry32(11);
  for (let i = 0; i < p.count; i++) {
    // jitter grid so triangles read as irregular facets
    const x = p.getX(i) + (rnd() - 0.5) * 1.1, z = p.getZ(i) + (rnd() - 0.5) * 1.1;
    p.setXYZ(i, x, terrainHeight(x, z), z);
  }
  const g = facetColors(geo, (f, gg, r) => {
    const pp = gg.getAttribute('position');
    const cx = (pp.getX(f * 3) + pp.getX(f * 3 + 1) + pp.getX(f * 3 + 2)) / 3;
    const cz = (pp.getZ(f * 3) + pp.getZ(f * 3 + 1) + pp.getZ(f * 3 + 2)) / 3;
    const d = Math.hypot(cx - PLATEAU.x, cz - PLATEAU.z);
    if (d < PLATEAU.r - 0.3) return r() < 0.5 ? PAL.plateau : PAL.plateau2;
    if (d < PLATEAU.r + 0.9 && r() < 0.5) return PAL.plateau2;
    return r() < 0.55 ? PAL.groundCool : PAL.groundCool2;
  }, 21, 0.07);
  const m = new Mesh(g, flatMat());
  m.receiveShadow = true;
  return m;
}

function buildMountains() {
  const grp = new Group();
  const rnd = mulberry32(5);
  for (let i = 0; i < 16; i++) {
    const ang = lerp(-1.25, 1.25, i / 15) + (rnd() - 0.5) * 0.12;
    const dist = 30 + rnd() * 10;
    const h = 6 + rnd() * 8;
    const geo = facetColors(new ConeGeometry(4 + rnd() * 4, h, 5 + Math.floor(rnd() * 3), 2), [PAL.mountain, '#46625F', '#33494D'], 40 + i, 0.08);
    const m = new Mesh(geo, flatMat());
    m.position.set(Math.sin(ang) * dist + 2, h / 2 - 1.5, -Math.cos(ang) * dist - 4);
    m.rotation.y = rnd() * 3;
    grp.add(m);
  }
  return grp;
}

function buildTrees() {
  const grp = new Group();
  const rnd = mulberry32(77);
  const spots = [];
  for (let i = 0; i < 60; i++) {
    const x = -16 + rnd() * 36, z = -26 + rnd() * 30;
    if (Math.hypot(x - PLATEAU.x, z - PLATEAU.z) < PLATEAU.r + 1.4) continue;
    if (x < -2 && z > -6) continue; // keep the copy region calm
    spots.push([x, z]);
  }
  spots.forEach(([x, z], i) => {
    const h = 1.2 + rnd() * 1.4;
    const cone = new Mesh(facetColors(new ConeGeometry(0.55 + rnd() * 0.3, h, 6, 1), ['#2F4A43', '#3B5A4E', '#284139'], 300 + i, 0.06), flatMat());
    const y = terrainHeight(x, z);
    cone.position.set(x, y + h / 2 + 0.25, z);
    cone.castShadow = true;
    const trunk = new Mesh(facetColors(new CylinderGeometry(0.09, 0.12, 0.5, 5), ['#5A4636'], 600 + i, 0.03), flatMat());
    trunk.position.set(x, y + 0.2, z);
    grp.add(cone, trunk);
  });
  return grp;
}

const GEM_FACETS = [PAL.sage, PAL.slate, PAL.terracotta, PAL.cream, PAL.terracotta, PAL.slate, PAL.sage];

// ---------- scene assembly ----------
export function createScene(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;

  const scene = new Scene();
  scene.background = new Color(PAL.sky);
  scene.fog = new FogExp2(PAL.sky, 0.034);

  const hemi = new HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.15); // cool, coloured shadow fill
  const amb = new AmbientLight('#5C6F86', 0.35);
  const key = new DirectionalLight(PAL.keyLight, 2.3);
  key.position.set(-9, 13, 7);
  key.target.position.set(3, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 45 });
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 3;
  scene.add(hemi, amb, key, key.target);

  const coreGlow = new PointLight(PAL.spark, 0, 9, 1.6);
  scene.add(coreGlow);

  scene.add(buildTerrain(), buildMountains(), buildTrees());

  // pedestals + gems
  const nodes = NODES.map((n, i) => {
    const ground = terrainHeight(n.x, n.z);
    const pedH = n.ped + 0.25;
    const ped = new Mesh(facetColors(new CylinderGeometry(n.r * 0.55, n.r * 0.95, pedH, 6, 1), [PAL.rock, '#7E8A86', '#5E6A6A'], 900 + i, 0.05), flatMat());
    ped.position.set(n.x, ground - 0.25 + pedH / 2, n.z);
    ped.rotation.y = i * 0.7;
    ped.castShadow = ped.receiveShadow = true;
    scene.add(ped);
    // contact skirt rock to seat the pedestal into terrain
    const skirt = new Mesh(facetColors(new DodecahedronGeometry(n.r * 0.95, 0), ['#5E6A6A', PAL.rock], 950 + i, 0.06), flatMat());
    skirt.scale.set(1.1, 0.35, 1.1);
    skirt.position.set(n.x, ground + 0.02, n.z);
    skirt.castShadow = skirt.receiveShadow = true;
    scene.add(skirt);

    const geo = facetColors(new IcosahedronGeometry(n.r, 0), GEM_FACETS, 1200 + i, 0.04);
    const mat = flatMat({ emissive: new Color(PAL.spark), emissiveIntensity: 0 });
    const gem = new Mesh(geo, mat);
    gem.castShadow = true;
    gem.receiveShadow = true;
    const top = ground - 0.25 + pedH;
    const restY = top + n.r * 0.82;
    scene.add(gem);
    return { gem, mat, restY, top, n };
  });

  // links: hexagonal faceted beams with an amber spark at the growing tip
  const links = LINKS.map((L, i) => {
    const pa = new Vector3(NODES[L.a].x, nodes[L.a].restY, NODES[L.a].z);
    const pb = new Vector3(NODES[L.b].x, nodes[L.b].restY, NODES[L.b].z);
    const dir = pb.clone().sub(pa);
    const len = dir.length();
    dir.normalize();
    // start at the surface of gem a, end at the surface of gem b
    const ra = NODES[L.a].r * 0.85, rb = NODES[L.b].r * 0.85;
    const start = pa.clone().addScaledVector(dir, ra);
    const span = len - ra - rb;
    const geo = new CylinderGeometry(0.11, 0.11, 1, 6, 1);
    geo.translate(0, 0.5, 0);
    const beam = new Mesh(facetColors(geo, [PAL[L.col]], 1500 + i, 0.08), flatMat({ emissive: new Color(PAL.spark), emissiveIntensity: 0 }));
    beam.position.copy(start);
    beam.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
    beam.castShadow = true;
    scene.add(beam);
    const spark = new Mesh(facetColors(new OctahedronGeometry(0.2, 0), [PAL.spark, '#FFD27F'], 1700 + i, 0.05), flatMat({ emissive: new Color(PAL.spark), emissiveIntensity: 0.9 }));
    scene.add(spark);
    return { beam, spark, start, dir, span, L };
  });

  // soft contact disc under the core to anchor it visually
  const contact = new Mesh(new CircleGeometry(1.4, 7), new MeshBasicMaterial({ color: '#1E2C33', transparent: true, opacity: 0, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(NODES[0].x, nodes[0].top + 0.01, NODES[0].z);
  scene.add(contact);

  const camera = new PerspectiveCamera(36, W / H, 0.1, 120);
  // shift the optical centre left so the network sits on the right two-thirds
  camera.setViewOffset(W, H, -260, 0, W, H);

  const CAM0 = { pos: new Vector3(-4.2, 4.4, 13.0), look: new Vector3(2.6, 1.5, 0.0) };
  const CAM1 = { pos: new Vector3(-2.0, 3.7, 10.6), look: new Vector3(3.0, 1.55, 0.1) };
  const tmpP = new Vector3(), tmpL = new Vector3();

  function render(tRaw) {
    const t = Math.min(DURATION, Math.max(0, Number(tRaw) || 0));

    // camera: slow push-in + slight orbit, settled by 2.5 s
    const ck = easeInOutSine(prog(t, 0, 2.5));
    tmpP.lerpVectors(CAM0.pos, CAM1.pos, ck);
    tmpL.lerpVectors(CAM0.look, CAM1.look, ck);
    camera.position.copy(tmpP);
    camera.lookAt(tmpL);

    // core: emerges from its pedestal, the idea "lights" (0.1–0.8 s)
    nodes.forEach((nd, i) => {
      const a = NODE_ARRIVAL[i];
      const dur = i === 0 ? 0.62 : 0.36;
      const p = prog(t, a, dur);
      const s = i === 0 ? lerp(0.35, 1, backOut(p, 1.3)) : lerp(0.0001, 1, backOut(p, 1.8));
      nd.gem.scale.setScalar(Math.max(0.0001, s));
      nd.gem.visible = p > 0 || i === 0;
      const sink = (1 - easeOutCubic(p)) * nd.n.r * (i === 0 ? 0.9 : 0.6);
      nd.gem.position.set(nd.n.x, nd.restY - sink, nd.n.z);
      const spin = i === 0 ? 0.5 + 1.1 * easeOutCubic(prog(t, 0.1, 2.5)) : 0.9 * (i + 1) + 1.4 * easeOutCubic(p);
      nd.gem.rotation.set(0.35, spin, 0.12 * (i % 2 ? -1 : 1));
      // glow flare on arrival, decaying to a settled ember by ~2.4 s
      const flare = Math.exp(-Math.max(0, t - (a + dur * 0.6)) * 3.2) * p;
      nd.mat.emissiveIntensity = (i === 0 ? 0.16 : 0.08) * p + 0.5 * flare;
    });
    const coreP = prog(t, NODE_ARRIVAL[0], 0.62);
    coreGlow.position.set(NODES[0].x, nodes[0].restY + 0.2, NODES[0].z + 0.6);
    coreGlow.intensity = 6 * coreP * (0.55 + 0.45 * Math.exp(-Math.max(0, t - 0.6) * 1.6));
    contact.material.opacity = 0.32 * coreP;

    // links grow from gem surface to gem surface, spark rides the tip
    links.forEach((lk) => {
      const p = prog(t, lk.L.s, lk.L.d);
      const e = easeInOutQuad(p);
      lk.beam.visible = p > 0;
      lk.beam.scale.set(1, Math.max(0.0001, lk.span * e), 1);
      const pulse = Math.exp(-Math.max(0, t - (lk.L.s + lk.L.d)) * 3.5);
      lk.beam.material.emissiveIntensity = p > 0 ? 0.35 * pulse * p : 0;
      const live = p > 0 && p < 1;
      lk.spark.visible = live;
      lk.spark.position.copy(lk.start).addScaledVector(lk.dir, lk.span * e);
      lk.spark.rotation.set(0, e * 3.0, e * 1.5);
      lk.spark.scale.setScalar(live ? 1 - 0.4 * Math.abs(e - 0.5) : 0.0001);
    });

    renderer.render(scene, camera);
  }

  return { render, renderer, scene, camera, nodes, links };
}
