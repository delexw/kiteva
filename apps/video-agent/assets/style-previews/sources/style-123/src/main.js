// Pop-Up Book Animation — style-123 preview scene.
// Style renderer: Three.js (perspective, PCF soft shadows, ACES tone map) + Canvas 2D paper textures.
// Motion owners: GSAP (θ page-opening angle + camera dolly, on one paused timeline) and a
// procedural paper-curl deformation evaluated from immutable rest vertices × bend(θ).
// Every visual is a pure function of timeline state; nothing advances on its own.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BoxGeometry, PlaneGeometry,
  ShapeGeometry, ExtrudeGeometry, Shape, MeshStandardMaterial, ShadowMaterial,
  CanvasTexture, SRGBColorSpace, AmbientLight, DirectionalLight, Vector3, Matrix4,
  PCFSoftShadowMap, ACESFilmicToneMapping, Color, NoColorSpace, RepeatWrapping
} from 'three';


// ---------- palette ----------
// Scene palette (background_policy: scene_dependent). The environment is a night desk in deep
// slate (#22303A), kept separate from the book material. Paper stays #F1E5CE with #342B25 ink;
// the cover is a rust bookcloth (#8A4A36) so the closed book reads against the dark field.
const BG = '#22303A';            // stage/environment field (CSS), stationary
const PAPER_TOKEN = '#F1E5CE';   // paper material + heading text on BG
const FG = '#342B25';            // printed ink on paper
const CLOTH = '#5d382b';         // ACES-precompensated albedo -> renders ≈ #8A4A36
// Albedo anchors pre-compensated through three's ACESFilmic curve at exposure 2.0 so that a
// surface receiving nominal irradiance (E = π) renders back to the exact tokens on screen.
// (Solved offline: ACES(albedo) -> #F1E5CE / #342B25 within ±1 code value.)
const PAPER = '#efc18a';
const INK = '#2e2824';
const EXPOSURE = 2.0;

// ---------- seeded randomness ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- dimensions (scene units) ----------
const W = 4.4;      // page width (spine -> fore-edge)
const D = 3.2;      // page depth
const T = 0.08;     // page block thickness (visible paper stack)
const CT = 0.04;    // cover board thickness
const M = 0.08;     // cover overhang
// 'PopupSerif' is declared in index.html via @font-face src: local(Baskerville…/Georgia…).
const SERIF = '"PopupSerif", Georgia, "Times New Roman", serif';
// Label textures are re-printed once fonts resolve (same seeds -> identical grain).
const fontTextures = [];
function fontTex(make) { const t = make(); fontTextures.push({ t, make }); return t; }

// ---------- Canvas 2D paper textures ----------
function paperCanvas(w, h, seed) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
  const rnd = mulberry32(seed);
  // subtle grain: speckles + short fibres, both in ink at very low alpha
  const n = Math.floor(w * h / 90);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h;
    g.fillStyle = rnd() < 0.5 ? 'rgba(46,40,36,0.035)' : 'rgba(255,248,236,0.05)';
    g.fillRect(x, y, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  g.strokeStyle = 'rgba(46,40,36,0.035)'; g.lineWidth = 1;
  for (let i = 0; i < n / 40; i++) {
    const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, l = 4 + rnd() * 10;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return { c, g };
}

function tex(canvas) {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// page-local (x,z) -> canvas px. side: -1 left page (x in [-W,0]), +1 right page (x in [0,W])
const PW = 1100, PH = Math.round(PW * D / W);
function pageXY(side, x, z) {
  const u = side < 0 ? (x + W) / W : x / W;
  return [u * PW, (z + D / 2) / D * PH];
}

// layout of pop-up parts (page-local coordinates, |x| measured from the spine)
const BULB_Z = 1.2;                  // V-fold origin on the spine (glue lines run toward the reader)
const CARDS = [
  { side: -1, x: 2.15, z: -0.65, label: 'LINK', lo: 62, hi: 150 },
  { side: -1, x: 3.45, z: 0.30, label: 'NODE', lo: 88, hi: 168 },
  { side: 1, x: 2.15, z: -0.65, label: 'LINK', lo: 62, hi: 150 },
  { side: 1, x: 3.45, z: 0.30, label: 'NODE', lo: 88, hi: 168 }
];
const CARD_W = 0.66, CARD_H = 0.98, CARD_T = 0.018;

function pageTexture(side, seed) {
  const { c, g } = paperCanvas(PW, PH, seed);
  const s = side;
  const P = (x, z) => pageXY(side, s * x, z);
  // gutter shading near the spine
  const gx = side < 0 ? PW : 0;
  const grd = g.createLinearGradient(gx, 0, gx - s * 120, 0);
  grd.addColorStop(0, 'rgba(46,40,36,0.16)'); grd.addColorStop(1, 'rgba(46,40,36,0)');
  g.fillStyle = grd; g.fillRect(side < 0 ? PW - 120 : 0, 0, 120, PH);
  // printed inset frame (double rule)
  g.strokeStyle = INK; g.lineWidth = 3;
  const m = 34;
  const x0 = side < 0 ? m : 18, x1 = side < 0 ? PW - 18 : PW - m;
  g.strokeRect(x0, m, x1 - x0, PH - 2 * m);
  g.lineWidth = 1.2; g.globalAlpha = 0.6;
  g.strokeRect(x0 + 10, m + 10, x1 - x0 - 20, PH - 2 * m - 20);
  g.globalAlpha = 1;
  // printed connection lines: bulb base -> LINK -> NODE (system wiring)
  const a = P(0.95, BULB_Z - 0.05);
  const b = P(CARDS[0].x, CARDS[0].z + 0.12);
  const d = P(CARDS[1].x, CARDS[1].z + 0.12);
  g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round'; g.setLineDash([14, 10]);
  g.beginPath(); g.moveTo(a[0], a[1]);
  g.quadraticCurveTo((a[0] + b[0]) / 2, a[1] + 40, b[0], b[1]); g.stroke();
  g.beginPath(); g.moveTo(b[0], b[1]);
  g.quadraticCurveTo((b[0] + d[0]) / 2, b[1] + 110, d[0], d[1]); g.stroke();
  g.setLineDash([]);
  for (const p of [a, b, d]) {
    g.fillStyle = PAPER; g.beginPath(); g.arc(p[0], p[1], 13, 0, Math.PI * 2); g.fill();
    g.lineWidth = 4; g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(p[0], p[1], 5, 0, Math.PI * 2); g.fill();
  }
  // glue marks where card tabs and V-fold tabs are pasted
  g.fillStyle = 'rgba(46,40,36,0.10)';
  for (const cd of CARDS.filter(q => q.side === side)) {
    const p = P(cd.x, cd.z);
    g.fillRect(p[0] - 32, p[1] - 4, 64, 34);
  }
  return tex(c);
}

function edgeTexture(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, 256, 64);
  const rnd = mulberry32(seed);
  for (let y = 3; y < 64; y += 4 + Math.floor(rnd() * 3)) {
    g.fillStyle = `rgba(46,40,36,${0.14 + rnd() * 0.12})`;
    g.fillRect(0, y, 256, 1);
  }
  return tex(c);
}

function cardTexture(label, seed) {
  const w = 264, h = 392;
  const { c, g } = paperCanvas(w, h, seed);
  g.strokeStyle = INK; g.lineWidth = 9; g.strokeRect(6, 6, w - 12, h - 12);
  g.lineWidth = 2; g.strokeRect(22, 22, w - 44, h - 44);
  // node glyph
  g.lineWidth = 6; g.beginPath(); g.arc(w / 2, 128, 40, 0, Math.PI * 2); g.stroke();
  g.fillStyle = INK; g.beginPath(); g.arc(w / 2, 128, 14, 0, Math.PI * 2); g.fill();
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(w / 2 - 40, 128); g.lineTo(40, 128); g.moveTo(w / 2 + 40, 128); g.lineTo(w - 40, 128); g.stroke();
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 58px ${SERIF}`;
  g.fillText(label, w / 2, 262);
  g.lineWidth = 3; g.beginPath(); g.moveTo(70, 318); g.lineTo(w - 70, 318); g.stroke();
  return tex(c);
}

// ---------- materials ----------
// Material detail: seeded paper-fibre roughness map (non-color data, NoColorSpace), static.
function roughnessTexture(seed) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(232,232,232)'; g.fillRect(0, 0, 512, 512);
  const rnd = mulberry32(seed);
  for (let i = 0; i < 9000; i++) {
    const v = 200 + Math.floor(rnd() * 55);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
const roughMap = roughnessTexture(909);
function paperMat(map) {
  return new MeshStandardMaterial({ color: 0xffffff, map, roughnessMap: roughMap, roughness: 1.0, metalness: 0 });
}
const edgeMap = edgeTexture(7);
const matEdge = paperMat(edgeMap);
const matPlain = paperMat(tex(paperCanvas(256, 256, 11).c));
const matCover = new MeshStandardMaterial({ color: new Color(CLOTH), roughness: 0.85, metalness: 0 });

// ---------- book boards ----------
function boardGeometry(w, h, d, segX) {
  const geo = new BoxGeometry(w, h, d, segX, 1, 1);
  geo.userData.rest = Float32Array.from(geo.attributes.position.array); // immutable rest vertices
  return geo;
}

const scene = new Scene();
const root = new Group(); scene.add(root);

const pageL = new Group(); root.add(pageL);
const pivotR = new Group(); root.add(pivotR); // hinge on the spine (world z axis through origin)

const texL = pageTexture(-1, 101), texR = pageTexture(1, 202);
const boardL = new Mesh(boardGeometry(W, T, D, 1), [matEdge, matEdge, paperMat(texL), matCover, matEdge, matEdge]);
boardL.position.set(-W / 2, -T / 2, 0);
const coverL = new Mesh(boardGeometry(W + M, CT, D + 2 * M, 1), matCover);
coverL.position.set(-(W + M) / 2, -T - CT / 2, 0);
pageL.add(boardL, coverL);

const boardR = new Mesh(boardGeometry(W, T, D, 28), [matEdge, matEdge, paperMat(texR), matCover, matEdge, matEdge]);
boardR.position.set(W / 2, -T / 2, 0);
const coverR = new Mesh(boardGeometry(W + M, CT, D + 2 * M, 28), matCover);
coverR.position.set((W + M) / 2, -T - CT / 2, 0);
pivotR.add(boardR, coverR);

for (const m of [boardL, coverL, boardR, coverR]) { m.castShadow = true; m.receiveShadow = true; }

// Procedural paper curl: the lifted page lags slightly while it swings open.
// offset_y(x) = bend(θ) · (x / W)^2, applied to rest vertices; normals recomputed each evaluation.
function bendAmount(thetaDeg) {
  const a = Math.PI - thetaDeg * Math.PI / 180;
  return 0.16 * Math.sin(a);
}
function applyCurl(mesh, centerX, amp) {
  const geo = mesh.geometry, rest = geo.userData.rest, pos = geo.attributes.position.array;
  for (let i = 0; i < rest.length; i += 3) {
    const xl = Math.max(0, rest[i] + centerX);
    pos[i] = rest[i];
    pos[i + 1] = rest[i + 1] + amp * (xl / W) * (xl / W);
    pos[i + 2] = rest[i + 2];
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

// ground receives the book's contact shadow only; the visible field stays the CSS #F1E5CE
const ground = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ color: new Color('#0b1015'), opacity: 0.5 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -T - CT - 0.002;
ground.receiveShadow = true;
scene.add(ground);

// ---------- V-fold: closed-loop hinge solution, tabulated over θ ----------
const BETA = 60 * Math.PI / 180;   // glue-line angle from the spine
const GAMMA = 93 * Math.PI / 180;  // rigid panel angle between glue edge and central crease
const cB = Math.cos(BETA), sB = Math.sin(BETA), cG = Math.cos(GAMMA), sG = Math.sin(GAMMA);

function glueDirs(thetaDeg) {
  const a = Math.PI - thetaDeg * Math.PI / 180;
  const uL = new Vector3(-1, 0, 0), uR = new Vector3(Math.cos(a), Math.sin(a), 0);
  const gL = new Vector3(0, 0, cB).addScaledVector(uL, sB);
  const gR = new Vector3(0, 0, cB).addScaledVector(uR, sB);
  return { a, gL, gR };
}
function solveCrease(thetaDeg) {
  const { a, gL, gR } = glueDirs(thetaDeg);
  const m = gL.clone().add(gR).normalize();
  const delta = Math.acos(Math.min(1, Math.max(-1, gL.dot(gR)))) / 2;
  const cosPsi = Math.min(1, cG / Math.cos(delta));
  const sinPsi = Math.sqrt(Math.max(0, 1 - cosPsi * cosPsi));
  const n = new Vector3().crossVectors(gL, gR).normalize();
  const interior = new Vector3(-Math.sin(a), 1 + Math.cos(a), 0); // yL + nR
  if (n.dot(interior) < 0) n.negate();
  return m.multiplyScalar(cosPsi).addScaledVector(n, sinPsi).normalize();
}
const TABLE_STEP = 0.25, TABLE_MIN = 2;
const creaseTable = [];
for (let t = TABLE_MIN; t <= 180 + 1e-9; t += TABLE_STEP) creaseTable.push(solveCrease(t));
function creaseAt(thetaDeg) {
  const f = (Math.min(180, Math.max(TABLE_MIN, thetaDeg)) - TABLE_MIN) / TABLE_STEP;
  const i = Math.min(creaseTable.length - 2, Math.floor(f)), k = f - i;
  return creaseTable[i].clone().lerp(creaseTable[i + 1], k).normalize();
}

// bulb half-outline in panel coordinates (p across, q along crease), scale S
const S = 0.98;
const NECK = 0.46, NECK_TOP = 0.98, BC = 1.86, BR = 0.95, TOP = BC + BR;
const GLUE_LEN = NECK / sG;
function halfOutline(sign) {
  const pts = [[0, 0], [NECK * sign, NECK * cG / sG]];
  pts.push([NECK * sign, NECK_TOP]);
  const xs = Math.sqrt(BR * BR - (NECK_TOP + 0.08 - BC) ** 2);
  const start = Math.atan2(NECK_TOP + 0.08 - BC, xs);
  for (let i = 0; i <= 28; i++) {
    const t = start + (Math.PI / 2 - start) * (i / 28);
    pts.push([Math.cos(t) * BR * sign, BC + Math.sin(t) * BR]);
  }
  pts.push([0, TOP]);
  return pts.map(([p, q]) => [p * S, q * S]);
}

const BW = 680, BH = Math.round(BW * (TOP + 0.04) / 2);
function bulbUV(p, q) { return [(p / S + 1) / 2, q / (S * (TOP + 0.04))]; }
function bulbTexture() {
  const { c, g } = paperCanvas(BW, BH, 303);
  const X = p => (p / S + 1) / 2 * BW, Y = q => (1 - q / (S * (TOP + 0.04))) * BH;
  const L = halfOutline(-1).slice().reverse(), R = halfOutline(1);
  g.beginPath();
  [...R, ...L].forEach(([p, q], i) => i ? g.lineTo(X(p), Y(q)) : g.moveTo(X(p), Y(q)));
  g.closePath();
  g.strokeStyle = INK; g.lineWidth = 14; g.lineJoin = 'round'; g.stroke();
  // dashed crease, filament bands, label
  g.lineWidth = 3; g.setLineDash([12, 10]);
  g.beginPath(); g.moveTo(X(0), Y(0.02)); g.lineTo(X(0), Y(TOP * S)); g.stroke(); g.setLineDash([]);
  g.lineWidth = 7;
  for (const q of [0.34, 0.6]) {
    g.beginPath(); g.moveTo(X(-0.3 * S), Y(q * S)); g.lineTo(X(0.3 * S), Y(q * S)); g.stroke();
  }
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 104px ${SERIF}`;
  g.fillText('IDEA', BW / 2, Y(BC * S));
  return tex(c);
}
const bulbMap = fontTex(bulbTexture);

function shapeFrom(pts) {
  const sh = new Shape();
  pts.forEach(([p, q], i) => i ? sh.lineTo(p, q) : sh.moveTo(p, q));
  sh.closePath();
  return sh;
}
function remapUV(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = bulbUV(pos.getX(i), pos.getY(i));
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}
const PANEL_T = 0.022;
function makeHalf(sign) {
  const grp = new Group();
  const sh = shapeFrom(halfOutline(sign));
  const body = new Mesh(new ExtrudeGeometry(sh, { depth: PANEL_T, bevelEnabled: false, curveSegments: 1 }), matPlain);
  body.geometry.translate(0, 0, -PANEL_T - 0.001);
  const face = new Mesh(new ShapeGeometry(sh), paperMat(bulbMap));
  remapUV(face.geometry);
  body.castShadow = true; body.receiveShadow = true;
  face.castShadow = false; face.receiveShadow = true;
  grp.add(body, face);
  return grp;
}
const halfL = makeHalf(-1), halfR = makeHalf(1);
root.add(halfL, halfR);
const BULB_O = new Vector3(0, 0.004, BULB_Z);

// glue tabs (thin strips pasted on each page behind the panel's base edge)
function makeTab(len) {
  const m = new Mesh(new BoxGeometry(len, 0.012, 0.16), matPlain);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const tabL = makeTab(GLUE_LEN * S), tabR = makeTab(GLUE_LEN * S);
{
  // page-local glue directions are fixed on each page
  const len = GLUE_LEN * S / 2;
  // glue lines run (∓sB, 0, +cB); tabs sit just outside the V, behind each printed panel face
  tabL.position.set(-sB * len - 0.07 * cB, 0.006, BULB_Z + cB * len - 0.07 * sB);
  tabL.rotation.y = Math.atan2(-cB, -sB); // local x -> (-sB, 0, +cB)
  tabR.position.set(sB * len + 0.07 * cB, 0.006, BULB_Z + cB * len - 0.07 * sB);
  tabR.rotation.y = Math.atan2(-cB, sB);  // local x -> (+sB, 0, +cB)
  pageL.add(tabL); pivotR.add(tabR);
}

// ---------- cards: single-hinge panels on crease pivots, angle derived from θ ----------
const cards = CARDS.map((cd, i) => {
  const hinge = new Group();
  const geo = new BoxGeometry(CARD_W, CARD_H, CARD_T);
  geo.translate(0, CARD_H / 2, CARD_T / 2);
  const front = paperMat(fontTex(() => cardTexture(cd.label, 400 + i)));
  const mesh = new Mesh(geo, [matEdge, matEdge, matEdge, matEdge, front, matPlain]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  hinge.add(mesh);
  const tab = new Mesh(new BoxGeometry(0.3, 0.012, 0.16), matPlain);
  tab.position.set(cd.side * cd.x, 0.006, cd.z + 0.08);
  tab.castShadow = true; tab.receiveShadow = true;
  (cd.side < 0 ? pageL : pivotR).add(hinge, tab);
  hinge.position.set(cd.side * cd.x, 0.014, cd.z);
  return { cd, hinge };
});

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ---------- lights ----------
scene.add(new AmbientLight(0xffffff, 1.25));
const key = new DirectionalLight(0xffffff, 2.2);
key.position.set(-4, 9, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -7; key.shadow.camera.right = 7;
key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
key.shadow.camera.near = 1; key.shadow.camera.far = 30;
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 4;
scene.add(key);
const fill = new DirectionalLight(0xffffff, 0.35);
fill.position.set(5, 4, 8);
scene.add(fill);

// ---------- camera & renderer ----------
const WIDTH = 1280, HEIGHT = 720;
const camera = new PerspectiveCamera(30, WIDTH / HEIGHT, 0.5, 80);
const CAM0 = { p: new Vector3(-1.3, 8.8, 13.6), l: new Vector3(-1.2, 1.2, -0.1) };
const CAM1 = { p: new Vector3(0, 6.6, 11.2), l: new Vector3(0, 1.45, -0.35) };

const canvas = document.getElementById('gl');
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT, false);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = EXPOSURE;
renderer.outputColorSpace = SRGBColorSpace;

// ---------- evaluation (pure function of state) ----------
const tmpM = new Matrix4();
function placeHalf(obj, X, Y) {
  const Z = new Vector3().crossVectors(X, Y);
  tmpM.makeBasis(X, Y, Z);
  obj.quaternion.setFromRotationMatrix(tmpM);
  obj.position.copy(BULB_O);
}

const state = { theta: 20, dolly: 0 };
function evaluate() {
  const theta = state.theta, d = state.dolly;
  const a = Math.PI - theta * Math.PI / 180;
  pivotR.rotation.z = a;
  const amp = bendAmount(theta);
  applyCurl(boardR, W / 2, amp);
  applyCurl(coverR, (W + M) / 2, amp);

  // V-fold from the tabulated closed-loop solution
  const c = creaseAt(theta);
  const { gL, gR } = glueDirs(theta);
  const eR = gR.clone().addScaledVector(c, -cG).normalize();
  const eL = gL.clone().addScaledVector(c, -cG).normalize().negate();
  placeHalf(halfR, eR, c);
  placeHalf(halfL, eL, c);

  // cards rise from θ; right-page cards ride the curl offset at their base
  for (const { cd, hinge } of cards) {
    const r = smooth(cd.lo, cd.hi, theta);
    hinge.rotation.x = (1 - r) * (Math.PI / 2) + r * (-0.1);
    const lift = cd.side > 0 ? amp * (cd.x / W) ** 2 : 0;
    hinge.position.y = 0.014 + lift;
  }

  camera.position.lerpVectors(CAM0.p, CAM1.p, d);
  const look = new Vector3().lerpVectors(CAM0.l, CAM1.l, d);
  camera.lookAt(look);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

// GSAP-driven property setters: any seek (forward, backward, direct) rewrites these values;
// a microtask re-evaluates the scene from the final values even if GSAP suppresses onUpdate.
let pending = false;
const proxy = {};
for (const k of ['theta', 'dolly']) {
  Object.defineProperty(proxy, k, {
    get: () => state[k],
    set: v => { state[k] = v; if (!pending) { pending = true; queueMicrotask(() => { pending = false; evaluate(); }); } },
    enumerable: true
  });
}

// The paused GSAP timeline is authored and registered in index.html (window.__timelines.video);
// it tweens this proxy, whose setters re-evaluate the scene.

// text contrast check on the resolved scene palette (heading PAPER_TOKEN on BG; kicker mix 0.78)
if (window.chroma) {
  const sub = window.chroma.mix(BG, PAPER_TOKEN, 0.78, 'rgb');
  console.info('[style-123] contrast heading/BG', window.chroma.contrast(PAPER_TOKEN, BG).toFixed(2),
    'kicker', window.chroma.contrast(sub, BG).toFixed(2));
}

evaluate();
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    for (const { t, make } of fontTextures) {
      const fresh = make();
      const g = t.image.getContext('2d');
      g.drawImage(fresh.image, 0, 0);
      t.needsUpdate = true;
      fresh.dispose();
    }
    evaluate();
  });
}
window.__scene123 = { evaluate, state, proxy, creaseAt };
