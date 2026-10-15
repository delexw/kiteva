// Isometric "idea becomes a connected system" scene.
// Renderer: Three.js WebGLRenderer + OrthographicCamera at true isometric orientation.
// No clocks or tickers: render(state) is a pure function of the state object that GSAP owns.
import {
  WebGLRenderer, Scene, OrthographicCamera, Group, Mesh, BoxGeometry, CylinderGeometry,
  PlaneGeometry, MeshBasicMaterial, LineSegments, EdgesGeometry, LineBasicMaterial,
  Vector3, Color, SRGBColorSpace, CanvasTexture, Sprite, SpriteMaterial, AdditiveBlending,
  BufferGeometry, Float32BufferAttribute
} from 'three';

export const PALETTE = {
  canvas: '#0E181E',      // scene-dependent night field (stationary)
  cream: '#F3EFE6',       // lit top faces + copy
  slate: '#2C424F',       // matte mass: slab top, tags
  teal: '#63968D',        // system / flow hue
  terracotta: '#C58662',  // idea core + links (warm secondary)
  slateSide: '#1D2D36', slateSideDark: '#15222A', gridLine: '#36525F',
  tealShade: '#44695F', terraShade: '#8C5D44', edge: '#0E181E', shadow: '#070D11'
};

const W = 1280, H = 720;
const CX = 860, CY = 400;           // screen position of world origin (core base centre)
const TILE = 132, GAP = 6, N = 4;   // ground slab tiles
const TILE_H = 26, BASE_H = 30;
const D = 200, FOOT = 80;           // satellite offset and block footprint
const SAT_H = 40, CORE_H = 120;

const mat = (c, extra = {}) => new MeshBasicMaterial({ color: new Color(c), ...extra });
// BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z.  Light comes from screen-left:
// +Z (screen-left face) takes the full token, +X (screen-right) the shaded variant.
function faceMats(top, left, right, transparent = false) {
  const o = transparent ? { transparent: true, opacity: 1 } : {};
  const r = mat(right, o), l = mat(left, o), t = mat(top, o), hidden = mat(right, o);
  return [r, hidden, t, hidden, l, hidden];
}
function box(w, h, d, mats, baseAtZero = true) {
  const g = new BoxGeometry(w, h, d);
  if (baseAtZero) g.translate(0, h / 2, 0);
  const m = new Mesh(g, mats);
  const e = new LineSegments(new EdgesGeometry(g), new LineBasicMaterial({ color: PALETTE.edge, transparent: true, opacity: 0.85 }));
  m.add(e);
  return m;
}
function shadowPlane(w, d, opacity) {
  const g = new PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  const m = new Mesh(g, mat(PALETTE.shadow, { transparent: true, opacity, depthWrite: false }));
  return m;
}
function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(99,150,141,0.95)'); gr.addColorStop(0.35, 'rgba(99,150,141,0.45)'); gr.addColorStop(1, 'rgba(99,150,141,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

export function createScene(host) {
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(new Color(PALETTE.canvas), 1);
  renderer.domElement.className = 'iso-canvas';
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  // Frustum is offset so the world origin lands at (CX, CY) in pixels; 1 world unit = 1 px.
  const camera = new OrthographicCamera(-CX, W - CX, CY, CY - H, 1, 6000);
  camera.position.set(1, 1, 1).normalize().multiplyScalar(2400);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();

  // ---- Ground: terracotta strata base + 4x4 slate tiles ------------------------------
  const span = N * TILE + (N - 1) * GAP;
  const base = new Group(); scene.add(base);
  const baseMesh = box(span, BASE_H, span, faceMats(PALETTE.slateSide, PALETTE.terracotta, PALETTE.terraShade));
  baseMesh.position.y = -TILE_H - BASE_H; base.add(baseMesh);

  const tiles = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const g = new Group();
    const m = box(TILE, TILE_H, TILE, faceMats(PALETTE.slate, PALETTE.slateSide, PALETTE.slateSideDark, true));
    m.position.y = -TILE_H; g.add(m);
    // fine iso grid on the tile top (lines along both ground axes)
    const pts = [];
    for (let k = 1; k < 3; k++) {
      const o = -TILE / 2 + k * TILE / 3;
      pts.push(o, 0.4, -TILE / 2, o, 0.4, TILE / 2, -TILE / 2, 0.4, o, TILE / 2, 0.4, o);
    }
    const lg = new BufferGeometry(); lg.setAttribute('position', new Float32BufferAttribute(pts, 3));
    const lines = new LineSegments(lg, new LineBasicMaterial({ color: PALETTE.gridLine, transparent: true, opacity: 1 }));
    g.add(lines);
    const x = -span / 2 + TILE / 2 + i * (TILE + GAP), z = -span / 2 + TILE / 2 + j * (TILE + GAP);
    g.position.set(x, 0, z);
    g.userData = { x, z, order: i + j, mesh: m, lines };
    scene.add(g); tiles.push(g);
  }

  // ---- Links: flat terracotta bars along the two ground axes --------------------------
  const dirs = [
    { key: 'people', v: new Vector3(-1, 0, 0) }, { key: 'tools', v: new Vector3(0, 0, -1) },
    { key: 'data', v: new Vector3(0, 0, 1) }, { key: 'flow', v: new Vector3(1, 0, 0) }
  ];
  const linkLen = D - FOOT;
  const links = dirs.map(({ v }) => {
    const along = v.x !== 0;
    const g = new BoxGeometry(along ? linkLen : 9, 4, along ? 9 : linkLen);
    // pivot at the core edge so scaling extrudes outward
    g.translate(along ? v.x * linkLen / 2 : 0, 2, along ? 0 : v.z * linkLen / 2);
    const m = new Mesh(g, faceMats(PALETTE.terracotta, PALETTE.terraShade, PALETTE.terraShade));
    m.position.set(v.x * FOOT / 2, 0, v.z * FOOT / 2);
    scene.add(m);
    const dot = new Mesh(new CylinderGeometry(9, 9, 6, 24), mat(PALETTE.terracotta));
    dot.position.set(v.x * (FOOT / 2 + linkLen / 2), 3, v.z * (FOOT / 2 + linkLen / 2));
    scene.add(dot);
    return { mesh: m, dot, along };
  });

  // ---- Satellite blocks ---------------------------------------------------------------
  const sats = dirs.map(({ key, v }) => {
    const g = new Group(); g.position.set(v.x * D, 0, v.z * D); scene.add(g);
    const sh = shadowPlane(FOOT + 10, FOOT + 10, 0.5); sh.position.set(14, 0.6, -14); g.add(sh);
    const b = box(FOOT, SAT_H, FOOT, faceMats(PALETTE.cream, PALETTE.teal, PALETTE.tealShade)); g.add(b);
    const cap = new Mesh(new BoxGeometry(FOOT * 0.56, 3, FOOT * 0.56), mat(PALETTE.teal));
    cap.position.y = SAT_H + 1.5; g.add(cap);
    return { key, group: g, body: b, shadow: sh, cap };
  });

  // ---- Core idea block ----------------------------------------------------------------
  const coreShadow = shadowPlane(FOOT + 16, FOOT + 16, 0.55); coreShadow.position.set(18, 0.7, -18); scene.add(coreShadow);
  const core = new Group(); scene.add(core);
  const coreBody = box(FOOT, CORE_H, FOOT, faceMats(PALETTE.cream, PALETTE.terracotta, PALETTE.terraShade)); core.add(coreBody);
  const ideaDot = new Mesh(new CylinderGeometry(22, 22, 4, 40), mat(PALETTE.terracotta)); ideaDot.position.y = CORE_H + 2; core.add(ideaDot);

  // ---- Flow pulses (teal system hue) --------------------------------------------------
  const halo = haloTexture();
  const pulses = dirs.map(() => {
    const g = new Group(); scene.add(g);
    const c = new Mesh(new BoxGeometry(14, 10, 14), mat(PALETTE.teal, { transparent: true, opacity: 1 }));
    c.position.y = 9; g.add(c);
    const s = new Sprite(new SpriteMaterial({ map: halo, blending: AdditiveBlending, transparent: true, depthWrite: false }));
    s.scale.set(64, 64, 1); s.position.y = 10; g.add(s);
    return { group: g, cube: c, sprite: s };
  });

  const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t);
  function render(state) {
    base.scale.y = Math.max(0.001, state.base); base.visible = state.base > 0.001;
    tiles.forEach((g, k) => {
      const p = ease(state.tiles[k]);
      g.visible = p > 0.001;
      g.position.y = (1 - p) * 150;           // drop along the vertical scene axis only
      g.userData.mesh.material.forEach(m => { m.opacity = Math.min(1, p * 2.2); });
      g.userData.lines.material.opacity = p;
      g.userData.mesh.children[0].material.opacity = 0.85 * p;
    });
    const c = ease(state.core);
    core.visible = c > 0.001;
    core.position.y = (1 - c) * 280;
    coreShadow.material.opacity = 0.55 * c * c; coreShadow.visible = c > 0.001;
    links.forEach((l, k) => {
      const p = ease(state.links[k]);
      l.mesh.visible = p > 0.001; l.mesh.scale.set(l.along ? Math.max(p, 0.001) : 1, 1, l.along ? 1 : Math.max(p, 0.001));
      const d = ease(state.dots[k]); l.dot.visible = d > 0.001; l.dot.scale.set(d, 1, d);
    });
    sats.forEach((s, k) => {
      const p = ease(state.sats[k]);
      s.group.visible = p > 0.001;
      s.body.scale.y = Math.max(p, 0.001);     // rises out of the slab along +Y
      s.shadow.material.opacity = 0.5 * p;
      const gl = ease(state.glow[k]);
      s.cap.visible = gl > 0.001; s.cap.scale.set(gl, 1, gl); s.cap.position.y = SAT_H * p + 1.5;
    });
    pulses.forEach((pl, k) => {
      const f = ease(state.flow[k]);
      const v = dirs[k].v;
      const show = f > 0.001 && f < 0.999;
      pl.group.visible = show;
      const r = FOOT / 2 + f * (D - FOOT);
      pl.group.position.set(v.x * r, 0, v.z * r);
      const fade = Math.min(1, f * 6, (1 - f) * 6);
      pl.cube.material.opacity = fade; pl.sprite.material.opacity = fade;
    });
    renderer.render(scene, camera);
  }

  // Screen-space anchors for 2D label tags (static, computed once from the fixed camera).
  function project(x, y, z) {
    const p = new Vector3(x, y, z).project(camera);
    return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H };
  }
  const anchors = {
    idea: project(0, CORE_H + 10, 0),
    people: project(-D, SAT_H, 0), tools: project(0, SAT_H, -D),
    data: project(0, 0, D), flow: project(D, 0, 0)
  };
  const tileOrder = tiles.map(t => t.userData.order);
  return { render, anchors, tileOrder, tileCount: tiles.length };
}
