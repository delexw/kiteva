// Paper Craft / Cardboard Craft — Three.js style renderer + procedural paper curl/fold.
// All visual state is a pure function of the `state` object, which is owned by the
// paused GSAP timeline in index.html. No clocks, no tickers, seeded randomness only.
import * as THREE from 'three';

const W = 1280, H = 720;
export const PALETTE = {
  mat: '#2F4A43',        // scene-dependent: green self-healing cutting mat (environment)
  matLine: '#4E6F64',
  matTick: '#7F9A8E',
  paper: '#EFE5D2',      // cream card stock (material)
  ink: '#47392B',        // dark printed ink (material)
  kraft: '#AF8A5D',      // kraft cardboard (material)
};

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function fibers(ctx, w, h, seed, dark, light, n) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, l = 3 + r() * 14, a = r() * Math.PI;
    ctx.strokeStyle = r() < 0.5 ? dark : light; ctx.lineWidth = 0.6 + r() * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
}

function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

function matTexture() {
  const c = canvas(2048, 2048), g = c.getContext('2d');
  g.fillStyle = PALETTE.mat; g.fillRect(0, 0, 2048, 2048);
  fibers(g, 2048, 2048, 7, 'rgba(0,0,0,0.05)', 'rgba(255,255,255,0.03)', 2500);
  const step = 2048 / 30; // one cell = 1 world unit on a 30-unit mat
  for (let i = 0; i <= 30; i++) {
    g.strokeStyle = PALETTE.matLine; g.lineWidth = i % 5 === 0 ? 3 : 1.4;
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, 2048); g.stroke();
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(2048, i * step); g.stroke();
  }
  g.strokeStyle = PALETTE.matTick; g.lineWidth = 1;
  for (let i = 0; i < 300; i++) { const x = i * step / 10; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, i % 10 === 0 ? 30 : 12); g.stroke(); }
  return tex(c);
}

function paperTexture(seed, printed) {
  const c = canvas(768, 1024), g = c.getContext('2d');
  g.fillStyle = PALETTE.paper; g.fillRect(0, 0, 768, 1024);
  fibers(g, 768, 1024, seed, 'rgba(71,57,43,0.10)', 'rgba(255,255,255,0.35)', 1800);
  if (printed) {
    // Card maps x∈[0,768] across the full card width; the fold line is at x=384.
    g.save(); g.translate(384, 0);
    g.fillStyle = PALETTE.kraft; g.strokeStyle = PALETTE.ink; g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0, 130); g.bezierCurveTo(-190, 130, -290, 290, -235, 450);
    g.bezierCurveTo(-200, 545, -125, 590, -115, 690); g.lineTo(115, 690);
    g.bezierCurveTo(125, 590, 200, 545, 235, 450); g.bezierCurveTo(290, 290, 190, 130, 0, 130);
    g.closePath(); g.fill();
    // corrugation flutes printed inside the bulb (kraft texture)
    g.save(); g.clip(); g.strokeStyle = 'rgba(71,57,43,0.35)'; g.lineWidth = 3;
    for (let y = 140; y < 700; y += 22) { g.beginPath(); for (let x = -300; x <= 300; x += 11) g.lineTo(x, y + (Math.floor(x / 11) % 2 ? 6 : -6)); g.stroke(); }
    g.restore(); g.stroke();
    g.fillStyle = PALETTE.ink; g.fillRect(-105, 715, 210, 34); g.fillRect(-82, 762, 164, 34);
    g.strokeStyle = PALETTE.paper; g.lineWidth = 20; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-55, 480); g.lineTo(0, 320); g.lineTo(55, 480); g.stroke();
    g.restore();
    g.setLineDash([22, 16]); g.strokeStyle = PALETTE.ink; g.lineWidth = 3;
    g.beginPath(); g.moveTo(30, 850); g.lineTo(738, 850); g.stroke(); g.setLineDash([]);
    g.fillStyle = PALETTE.ink; g.font = 'bold 54px "Courier New", Courier, monospace'; g.textAlign = 'center';
    g.fillText('FOLD · IDEA', 384, 935);
  }
  // fold crease on both sides
  g.strokeStyle = 'rgba(71,57,43,0.22)'; g.lineWidth = 3; g.beginPath(); g.moveTo(384, 0); g.lineTo(384, 1024); g.stroke();
  return tex(c);
}

function kraftTexture(seed, tone) {
  const c = canvas(512, 512), g = c.getContext('2d');
  g.fillStyle = tone; g.fillRect(0, 0, 512, 512);
  fibers(g, 512, 512, seed, 'rgba(71,57,43,0.22)', 'rgba(239,229,210,0.18)', 1400);
  return tex(c);
}

function fluteTexture() { // corrugated edge: liner / flutes / liner
  const c = canvas(256, 64), g = c.getContext('2d');
  g.fillStyle = '#C9A77A'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = PALETTE.kraft; g.fillRect(0, 0, 256, 8); g.fillRect(0, 56, 256, 8);
  g.strokeStyle = PALETTE.ink; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x <= 256; x += 2) g.lineTo(x, 32 + Math.sin(x / 256 * Math.PI * 16) * 22);
  g.stroke();
  const t = tex(c); t.wrapS = THREE.RepeatWrapping; return t;
}

// ---------- procedural fold / curl (rest vertices immutable) ----------
// Card hinge fold: arc-length-preserving bend around a crease at u=0.
function foldPoint(u, theta, r) {
  if (u <= 0 || theta <= 1e-4) return [u, 0];
  const arc = r * theta;
  if (u <= arc) { const a = u / r; return [r * Math.sin(a), r * (1 - Math.cos(a))]; }
  const ex = r * Math.sin(theta), ey = r * (1 - Math.cos(theta)), d = u - arc;
  return [ex + d * Math.cos(theta), ey + d * Math.sin(theta)];
}
// Strip unroll: flat up to front d, remainder coiled in a growing spiral.
function rollPoint(u, d, r0) {
  if (u <= d) return [u, 0];
  // Inward spiral: radius shrinks with wound angle; bounded fixed-step integration.
  const sArc = u - d, steps = Math.min(120, Math.ceil(sArc / 0.02)), ds = sArc / Math.max(steps, 1);
  let a = 0, r = r0;
  for (let i = 0; i < steps; i++) { r = Math.max(0.022, r0 - 0.0035 * a); a += ds / r; }
  return [d + r * Math.sin(a), r * (1 - Math.cos(a))];
}

export function createScene(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.mat);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  camera.position.set(0.4, 12.5, 9.2); camera.lookAt(0.4, 0, 0.9);

  // soft studio light: large warm key from upper-left, cool fill from the mat
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x3a5a50, 1.15));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
  key.position.set(-6, 12, 4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 30 });
  scene.add(key);

  const mat = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.9 }));
  mat.rotation.x = -Math.PI / 2; mat.receiveShadow = true; scene.add(mat);

  // ---------- idea card (folded greeting-card hinge) ----------
  const CW = 3.0, CH = 4.0, CX = -4.1, CZ = 0.9, SEG = 96, R_FOLD = 0.045;
  const cardGeo = new THREE.PlaneGeometry(CW, CH, SEG, 8);
  cardGeo.rotateX(-Math.PI / 2);
  const cardRest = Float32Array.from(cardGeo.attributes.position.array);
  const front = new THREE.MeshStandardMaterial({ map: paperTexture(11, true), roughness: 0.95, side: THREE.FrontSide });
  const back = new THREE.MeshStandardMaterial({ map: paperTexture(12, false), roughness: 0.95, side: THREE.BackSide });
  const card = new THREE.Group(); card.position.set(CX, 0.012, CZ);
  const cardF = new THREE.Mesh(cardGeo, front), cardB = new THREE.Mesh(cardGeo, back);
  cardF.castShadow = cardB.castShadow = true; cardF.receiveShadow = true;
  card.add(cardF, cardB); scene.add(card);

  function applyCardFold(theta, cornerLift) {
    const p = cardGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = cardRest[i], z = cardRest[i + 2];
      let [fx, fy] = foldPoint(x, theta, R_FOLD);
      // slight residual corner curl on the outer free edge (decays to 0)
      const edge = Math.max(0, (x - 1.1) / 0.4), zz = Math.abs(z) / (CH / 2);
      fy += cornerLift * edge * edge * (0.4 + 0.6 * zz * zz);
      p[i] = fx; p[i + 1] = fy; p[i + 2] = z;
    }
    cardGeo.attributes.position.needsUpdate = true; cardGeo.computeVertexNormals();
  }

  // ---------- cardboard boxes assembled from flat nets ----------
  const T = 0.055;
  const flute = fluteTexture();
  const kraftA = new THREE.MeshStandardMaterial({ map: kraftTexture(21, PALETTE.kraft), roughness: 0.92 });
  const kraftIn = new THREE.MeshStandardMaterial({ map: kraftTexture(22, '#C29C6C'), roughness: 0.95 });
  const edgeM = new THREE.MeshStandardMaterial({ map: flute, roughness: 1 });
  const tapeM = new THREE.MeshStandardMaterial({ color: '#8E6B42', roughness: 0.6 });
  const panelMats = [edgeM, edgeM, kraftA, kraftIn, edgeM, edgeM];
  function panel(w, d) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, T, d), panelMats); m.castShadow = m.receiveShadow = true; return m; }

  function makeBox(x, z, s, h, rotY) {
    const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = rotY; scene.add(root);
    const base = panel(s, s); base.position.y = T / 2; root.add(base);
    const walls = []; const lids = [];
    const defs = [
      { axis: 'x', sign: -1, pos: [0, 0, s / 2], w: s, flap: true },
      { axis: 'x', sign: 1, pos: [0, 0, -s / 2], w: s, flap: true },
      { axis: 'z', sign: 1, pos: [s / 2, 0, 0], w: s - 2 * T, flap: false },
      { axis: 'z', sign: -1, pos: [-s / 2, 0, 0], w: s - 2 * T, flap: false },
    ];
    for (const d of defs) {
      const pivot = new THREE.Group(); pivot.position.set(...d.pos); root.add(pivot);
      // panel extends outward from hinge when flat
      const out = d.axis === 'x' ? new THREE.Vector3(0, 0, -d.sign) : new THREE.Vector3(d.sign, 0, 0);
      const p = d.axis === 'x' ? panel(d.w, h) : panel(h, d.w);
      p.position.set(out.x * h / 2, T / 2, out.z * h / 2); pivot.add(p);
      const wall = { pivot, d, lid: null };
      if (d.flap) {
        const lp = new THREE.Group(); lp.position.set(out.x * h, 0, out.z * h); pivot.add(lp);
        const L = s / 2 - 0.01; const lm = panel(d.w, L);
        lm.position.set(out.x * L / 2, T / 2 + 0.002, out.z * L / 2); lp.add(lm);
        wall.lid = lp; lids.push(lp);
      }
      walls.push(wall);
    }
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, s + 0.02), tapeM);
    tape.position.set(0, h + 0.012, 0); tape.castShadow = true; root.add(tape);
    return { root, walls, tape, h };
  }
  const boxes = [
    makeBox(0.4, 1.4, 1.35, 1.15, 0.12),
    makeBox(3.6, -1.0, 1.15, 1.0, -0.18),
    makeBox(4.4, 3.0, 1.15, 1.0, 0.22),
  ];
  function applyBox(b, wallP, lidP, tapeP) {
    const wa = wallP * Math.PI / 2, la = lidP * Math.PI / 2 * 0.985;
    for (const w of b.walls) {
      if (w.d.axis === 'x') w.pivot.rotation.x = w.d.sign * wa; else w.pivot.rotation.z = w.d.sign * wa;
      if (w.lid) w.lid.rotation.x = w.d.sign * la;
    }
    b.tape.visible = tapeP > 0.001; b.tape.scale.set(1, 1, Math.max(0.001, tapeP));
    b.root.visible = true;
  }

  // ---------- connector strips that unroll from a paper coil ----------
  const stripMat = new THREE.MeshStandardMaterial({ map: kraftTexture(31, '#D6B88E'), roughness: 0.95, side: THREE.DoubleSide });
  const brassM = new THREE.MeshStandardMaterial({ color: '#8C7A55', roughness: 0.45, metalness: 0.5 });
  function makeStrip(a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    const geo = new THREE.PlaneGeometry(L, 0.24, 160, 1); geo.rotateX(-Math.PI / 2); geo.translate(L / 2, 0, 0);
    const rest = Float32Array.from(geo.attributes.position.array);
    const m = new THREE.Mesh(geo, stripMat); m.castShadow = true; m.receiveShadow = true;
    const g = new THREE.Group(); g.position.set(a[0], 0.02, a[1]); g.rotation.y = -Math.atan2(dz, dx); g.add(m); scene.add(g);
    const brad = (u) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 24), brassM); c.position.set(u, 0.02, 0); c.castShadow = true; g.add(c); return c; };
    return { g, geo, rest, L, b0: brad(0.12), b1: brad(L - 0.12) };
  }
  function applyStrip(s, p) {
    s.g.visible = p > 0.001;
    const d = s.L * p, a = s.geo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      const [u, y] = rollPoint(s.rest[i], d, 0.07);
      a[i] = u; a[i + 1] = y; a[i + 2] = s.rest[i + 2];
    }
    s.geo.attributes.position.needsUpdate = true; s.geo.computeVertexNormals();
    s.b0.visible = p > 0.08; s.b1.visible = p > 0.995;
  }
  const strips = [
    makeStrip([-2.75, 1.1], [-0.35, 1.35]),
    makeStrip([1.12, 1.0], [2.95, -0.45]),
    makeStrip([1.12, 1.85], [3.8, 2.85]),
  ];

  function render(st) {
    applyCardFold(st.cardFold * Math.PI * 0.985, st.cardCurl);
    applyStrip(strips[0], st.s1); applyStrip(strips[1], st.s2); applyStrip(strips[2], st.s3);
    applyBox(boxes[0], st.aW, st.aL, st.aT);
    applyBox(boxes[1], st.bW, st.bL, st.bT);
    applyBox(boxes[2], st.cW, st.cL, st.cT);
    renderer.render(scene, camera);
  }
  return { render };
}
