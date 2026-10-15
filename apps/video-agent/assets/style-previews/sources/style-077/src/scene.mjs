// Isometric Illustration — "an idea becomes a connected system".
// Style renderer: Three.js WebGLRenderer + OrthographicCamera at true isometric orientation.
// Motion owner: one paused GSAP timeline built inline in index.html (window.__timelines.video).
// Every visual property is derived from timeline-owned state; draw() redraws on every seek/update.
import {
  WebGLRenderer, Scene, OrthographicCamera, BoxGeometry, OctahedronGeometry, PlaneGeometry,
  Mesh, MeshBasicMaterial, LineSegments, LineBasicMaterial, EdgesGeometry, Group, Color,
  Plane, Vector3, BufferAttribute, BufferGeometry, CanvasTexture, AdditiveBlending, SRGBColorSpace
} from 'three';

const gsap = window.gsap;
const chroma = window.chroma;

// ---------- palette (scene-dependent, low-key cool cutaway; semantic hues preserved) ----------
const P = {
  ink: chroma('#2D444D').hex(),        // approved foreground token, used for face tonal steps
  sage: chroma('#6E9990').hex(),       // system modules (approved semantic assignment)
  terra: chroma('#C98961').hex(),      // idea core + links (approved semantic assignment)
  void: '#0F191E',                     // scene background: dark slate void (tonal step of ink)
  slabTop: '#1B2C34', slabSide: '#14222A', slabFront: '#111C22',
  line: '#0A1216',                     // outline
  text: '#ECE6D8',                     // light text on void
  textDim: '#A9B7B4'
};
const mix = (a, b, t) => chroma.mix(a, b, t, 'rgb').hex();
const faces = (base) => ({ top: base, left: mix(base, P.ink, 0.22), right: mix(base, P.ink, 0.46) });
window.__paletteReport = {
  headlineOnVoid: chroma.contrast(P.text, P.void).toFixed(2),
  dimOnVoid: chroma.contrast(P.textDim, P.void).toFixed(2),
  sageOnVoid: chroma.contrast(P.sage, P.void).toFixed(2),
  terraOnVoid: chroma.contrast(P.terra, P.void).toFixed(2)
};

// ---------- renderer / camera ----------
const W = 1280, H = 720;
const canvas = document.getElementById('iso');
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = SRGBColorSpace;
renderer.localClippingEnabled = true;
renderer.setClearColor(0x000000, 0);

const CX = 872, CY = 384; // screen position of world origin
const camera = new OrthographicCamera(-CX, W - CX, CY, CY - H, -4000, 4000);
camera.position.set(1000, 1000, 1000); // equal angles to all three axes = true isometric
camera.up.set(0, 1, 0);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);

const scene = new Scene();

// ---------- shaded geometry helper: flat tonal faces like the illustration ----------
function shaded(geom, base) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.computeVertexNormals();
  const n = g.getAttribute('normal');
  const f = faces(base);
  const cTop = new Color(f.top), cL = new Color(f.left), cR = new Color(f.right);
  const cols = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i += 3) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    let c;
    if (ny > 0.55) c = cTop; else c = nx > nz ? cR : cL;
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = c.r; cols[(i + k) * 3 + 1] = c.g; cols[(i + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new BufferAttribute(cols, 3));
  return g;
}
function block(geom, base, opts = {}) {
  const grp = new Group();
  const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, clippingPlanes: opts.clip || null });
  const mesh = new Mesh(shaded(geom, base), mat);
  const edges = new LineSegments(new EdgesGeometry(geom), new LineBasicMaterial({ color: P.line, transparent: true, opacity: 1, clippingPlanes: opts.clip || null }));
  grp.add(mesh, edges);
  grp.userData.mats = [mat, edges.material];
  return grp;
}
const setOpacity = (grp, o) => grp.userData.mats.forEach(m => { m.opacity = o; });

// ---------- dimensions ----------
const S = 74;          // cube edge
const D = 202;         // module distance along each axis
const HALF = 252;      // platform half-size
const T = 18;          // platform thickness
const floorClip = [new Plane(new Vector3(0, 1, 0), 0.01)]; // keep geometry above slab top (y >= 0)

// platform slab (top at y = 0)
const slab = new Group();
{
  const g = new BoxGeometry(HALF * 2, T, HALF * 2); g.translate(0, -T / 2, 0);
  const pos = shaded(g, P.slabTop);
  // override side tones with explicit slab tones
  const col = pos.getAttribute('color'); const n = pos.getAttribute('normal');
  const side = new Color(P.slabSide), front = new Color(P.slabFront);
  for (let i = 0; i < n.count; i++) {
    if (n.getY(i) > 0.5) continue;
    const c = n.getX(i) > n.getZ(i) ? front : side; col.setXYZ(i, c.r, c.g, c.b);
  }
  const m = new Mesh(pos, new MeshBasicMaterial({ vertexColors: true }));
  const e = new LineSegments(new EdgesGeometry(g), new LineBasicMaterial({ color: '#2A3E46' }));
  slab.add(m, e);
  // axis grid inscribed on the slab (parallel to world x / z)
  const gridMat = new LineBasicMaterial({ color: '#24373F' });
  const pts = [];
  for (let k = -HALF + 42; k < HALF; k += 42) {
    pts.push(k, 0.3, -HALF, k, 0.3, HALF, -HALF, 0.3, k, HALF, 0.3, k);
  }
  const lineGeom = new BufferGeometry();
  lineGeom.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  slab.add(new LineSegments(lineGeom, gridMat));
}
slab.traverse(o => { o.renderOrder = -2; });
scene.add(slab);

// warm event pool on the slab (deterministic canvas radial texture, additive)
const poolTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(201,137,97,0.85)'); gr.addColorStop(0.45, 'rgba(201,137,97,0.32)'); gr.addColorStop(1, 'rgba(201,137,97,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
})();
const pool = new Mesh(new PlaneGeometry(HALF * 1.7, HALF * 1.7),
  new MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
pool.renderOrder = -1; pool.rotation.x = -Math.PI / 2; pool.position.y = 0.6; scene.add(pool);

// flat cast shadow (light from -x, shadow falls toward +x like the reference figure)
function shadow() {
  const m = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.4; scene.add(m); return m;
}
function placeShadow(m, x, z, h, o) {
  const len = S + h * 0.55;
  m.scale.set(len, S, 1);
  m.position.set(x - S / 2 + len / 2, 0.4, z);
  m.material.opacity = 0.32 * o; m.visible = o > 0.001 && h > 0.5;
}

// idea core: two stacked terracotta cubes extruding through the slab top
const coreLow = block(new BoxGeometry(S, S, S).translate(0, S / 2, 0), P.terra, { clip: floorClip });
const coreHigh = block(new BoxGeometry(S, S, S).translate(0, S / 2, 0), P.terra, { clip: floorClip });
scene.add(coreLow, coreHigh);
const coreShadow = shadow();

// idea diamond
const diamondGeom = new OctahedronGeometry(30, 0); diamondGeom.scale(1, 1.5, 1);
const diamond = block(diamondGeom, P.terra);
scene.add(diamond);
const DIAMOND_REST = S * 2 + 92;

// four links + four modules on the ±x / ±z axes
const AX = [
  { key: 'west', dir: [-1, 0] }, { key: 'north', dir: [0, -1] }, // left-top, right-top (DATA)
  { key: 'south', dir: [0, 1] }, { key: 'east', dir: [1, 0] }    // left-bottom (PEOPLE), right-bottom
];
const LINK_LEN = D - S / 2;
const linkDim = mix(P.terra, P.void, 0.55);
const links = AX.map(a => {
  const g = new BoxGeometry(1, 6, 12); g.translate(0.5, 3, 0); // grows along +x from origin
  const mat = new MeshBasicMaterial({ color: linkDim });
  const sideMat = new MeshBasicMaterial({ color: '#0C1519' });
  const m = new Mesh(g, [sideMat, sideMat, mat, sideMat, sideMat, sideMat]);
  m.rotation.y = Math.atan2(-a.dir[1], a.dir[0]);
  scene.add(m); m.userData.top = mat; return m;
});
const modules = AX.map(a => {
  const grp = block(new BoxGeometry(S, S, S).translate(0, S / 2, 0), P.sage);
  // dark port window on the visible faces; lights up with the connection event
  const winMat = new MeshBasicMaterial({ color: mix(P.ink, P.void, 0.4), transparent: true });
  const wR = new Mesh(new PlaneGeometry(22, 14), winMat); wR.rotation.y = Math.PI / 2; wR.position.set(S / 2 + 0.6, S * 0.56, 0);
  const wL = new Mesh(new PlaneGeometry(22, 14), winMat); wL.position.set(0, S * 0.56, S / 2 + 0.6);
  grp.add(wR, wL);
  grp.userData.mats.push(winMat); grp.userData.win = winMat;
  scene.add(grp);
  grp.userData.shadow = shadow();
  return grp;
});

// ---------- timeline-owned state (single owner per property) ----------
const st = {
  slab: 0, diamondDrop: 0, coreLow: 0, coreHigh: 0,
  link0: 0, link1: 0, link2: 0, link3: 0,
  mod0: 0, mod1: 0, mod2: 0, mod3: 0,
  lit0: 0, lit1: 0, lit2: 0, lit3: 0, pool: 0
};
const cLinkDim = new Color(linkDim), cLinkLit = new Color(P.terra);
const cWinDim = new Color(mix(P.ink, P.void, 0.4)), cWinLit = new Color(P.terra);

function draw() {
  // slab: scales in x/z about its centre (keeps isometric parallels), lands at full size
  const s = 0.72 + 0.28 * st.slab;
  slab.scale.set(s, 1, s);
  slab.visible = st.slab > 0.001;
  slab.children.forEach(c => { if (c.material) { c.material.transparent = true; c.material.opacity = Math.min(1, st.slab * 1.6); } });

  // diamond drops straight down the vertical axis
  diamond.position.set(0, DIAMOND_REST + (1 - st.diamondDrop) * 360, 0);
  diamond.rotation.y = (1 - st.diamondDrop) * Math.PI / 2;
  diamond.visible = st.diamondDrop > 0.001;

  // core extrudes through the slab top along +y
  coreLow.position.y = -S + S * st.coreLow;
  coreHigh.position.y = S * st.coreLow - S + S * st.coreHigh;
  coreLow.visible = st.coreLow > 0.001; coreHigh.visible = st.coreHigh > 0.001;
  placeShadow(coreShadow, 0, 0, Math.max(0, S * st.coreLow + S * st.coreHigh), st.coreLow);

  AX.forEach((a, i) => {
    const L = links[i];
    const k = st['link' + i];
    L.scale.set(Math.max(0.001, LINK_LEN * k), 1, 1);
    L.visible = k > 0.001;
    const lit = st['lit' + i];
    L.userData.top.color.copy(cLinkDim).lerp(cLinkLit, lit);

    const M = modules[i];
    const m = st['mod' + i];
    const r = D + (1 - m) * 150; // slides inward along its own axis
    M.position.set(a.dir[0] * r, 0, a.dir[1] * r);
    M.visible = m > 0.001;
    setOpacity(M, Math.min(1, m * 2.2));
    M.userData.win.color.copy(cWinDim).lerp(cWinLit, lit);
    placeShadow(M.userData.shadow, M.position.x, M.position.z, S, Math.min(1, m * 2.2));
  });
  pool.material.opacity = 0.55 * st.pool;
  renderer.render(scene, camera);
}

// ---------- 2D label layer positions (projected once from the fixed camera) ----------
function toScreen(x, y, z) {
  const v = new Vector3(x, y, z).project(camera);
  return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
}
function layoutLabels() {
  const set = (id, d) => document.getElementById(id).setAttribute('d', d);
  const put = (id, x, y) => { const e = document.getElementById(id); e.setAttribute('x', x.toFixed(1)); e.setAttribute('y', y.toFixed(1)); };
  // IDEA: right vertex of diamond
  const [ix, iy] = toScreen(15, DIAMOND_REST, -15);
  set('lead-idea', `M${(ix + 6).toFixed(1)} ${iy.toFixed(1)}H${(ix + 104).toFixed(1)}`);
  put('lab-idea', ix + 112, iy + 5);
  // DATA: north module (right-top), rightmost upper corner
  const [dx, dy] = toScreen(S / 2, S, -D - S / 2);
  set('lead-data', `M${(dx + 4).toFixed(1)} ${(dy + 30).toFixed(1)}L${(dx + 58).toFixed(1)} ${(dy).toFixed(1)}H${(dx + 96).toFixed(1)}`);
  put('lab-data', dx + 104, dy + 5);
  // PEOPLE: south module (left-bottom), lowest-left corner
  const [px, py] = toScreen(-S / 2, 0, D + S / 2);
  set('lead-people', `M${(px - 4).toFixed(1)} ${(py - 10).toFixed(1)}L${(px - 44).toFixed(1)} ${(py + 20).toFixed(1)}H${(px - 92).toFixed(1)}`);
  put('lab-people', px - 100, py + 25);
  // dashed tether between diamond and core top
  const [tx, ty0] = toScreen(0, DIAMOND_REST - 45, 0);
  const [, ty1] = toScreen(0, S * 2 + 8, 0);
  set('tether', `M${tx.toFixed(1)} ${ty0.toFixed(1)}V${ty1.toFixed(1)}`);
}
layoutLabels();

// ---------- handoff: the composition HTML builds and registers the GSAP timeline ----------
window.__isoScene = { state: st, draw };
draw();
