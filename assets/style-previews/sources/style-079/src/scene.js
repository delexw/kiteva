// 3D Diorama — "An idea becomes a connected system".
// Procedural Three.js miniature stage. All state is evaluated from the shared
// GSAP timeline (window.__timelines.video); no clocks, tickers or randomness.
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

// Approved material tokens (preserved) + scene-dependent blue-hour canvas.
const C = {
  cream: '#EEE6D4',   // roads, roof caps, lit windows, pods
  ink: '#35433C',     // outlines, strata band, figures, screen glass
  grass: '#7B9173',   // diorama top, tree crowns
  soil: '#B3885F',    // soil cut faces, tower, idea orb
  dusk: '#1F2C34',    // scene background (blue hour), stationary
};
const W = 1280, H = 720;

export function createDiorama(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // keep approved material values legible
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.dusk);
  scene.fog = new THREE.Fog(C.dusk, 46, 90);

  // Quantized toon ramp: three lighting bands (shading data, not palette colors).
  const ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.colorSpace = THREE.NoColorSpace;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  const toon = (hex, extra = {}) => new THREE.MeshToonMaterial({ color: hex, gradientMap: ramp, ...extra });

  // Soft key / fill lighting.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(-9, 16, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0006;
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
  scene.add(key);

  const resolution = new THREE.Vector2(W, H);
  const edgeMat = new LineMaterial({ color: new THREE.Color(C.ink), linewidth: 1.6, resolution, transparent: true, opacity: 0.9 });
  const hullMat = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });

  // Crease-edge helper (geometry outlines) for faceted parts.
  function withEdges(mesh, threshold = 30) {
    const eg = new THREE.EdgesGeometry(mesh.geometry, threshold);
    const lg = new LineSegmentsGeometry().fromEdgesGeometry(eg);
    eg.dispose();
    const lines = new LineSegments2(lg, edgeMat);
    lines.computeLineDistances();
    mesh.add(lines);
    return mesh;
  }
  // Inverted-hull silhouette for curved parts.
  function withHull(mesh, k = 1.07) {
    const hull = new THREE.Mesh(mesh.geometry, hullMat);
    hull.scale.setScalar(k);
    mesh.add(hull);
    return mesh;
  }
  const box = (w, h, d, mat, baseY = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2 + baseY, 0);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = m.receiveShadow = true;
    return withEdges(m);
  };

  // ---------- Stage (bounded plinth with strata) ----------
  const stage = new THREE.Group();
  stage.name = 'stage';
  scene.add(stage);
  const S = 10;
  stage.add(box(S, 0.28, S, toon(C.grass), -0.28));
  stage.add(box(S, 1.05, S, toon(C.soil), -1.33));
  stage.add(box(S, 0.22, S, toon(C.ink), -1.55));
  // Inset cream border on the top surface.
  {
    const p = 4.55, y = 0.01;
    const pts = [[-p, -p], [p, -p], [p, p], [-p, p], [-p, -p]];
    const seg = [];
    for (let i = 0; i < 4; i++) seg.push(pts[i][0], y, pts[i][1], pts[i + 1][0], y, pts[i + 1][1]);
    const g = new LineSegmentsGeometry().setPositions(seg);
    stage.add(new LineSegments2(g, new LineMaterial({ color: new THREE.Color(C.cream), linewidth: 1.4, resolution, transparent: true, opacity: 0.55 })));
  }
  // Contact shadow catcher under the floating diorama.
  const catcher = new THREE.Mesh(new THREE.CircleGeometry(11, 64), new THREE.ShadowMaterial({ opacity: 0.32 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = -2.6;
  catcher.receiveShadow = true;
  scene.add(catcher);

  // ---------- Central idea tower ----------
  const tower = new THREE.Group();
  tower.name = 'tower';
  stage.add(tower);
  tower.add(box(1.0, 3.0, 1.0, toon(C.soil)));
  tower.add(box(1.06, 0.12, 1.06, toon(C.cream), 3.0));

  // Video-textured screen with CRT overlay on the tower face (CanvasTexture).
  const scr = document.createElement('canvas');
  scr.width = 128; scr.height = 224;
  const sctx = scr.getContext('2d');
  const screenTex = new THREE.CanvasTexture(scr);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.minFilter = THREE.LinearFilter;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.26), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 1.75, 0.505);
  tower.add(screen);
  const nodes = [[64, 40], [28, 112], [100, 112], [40, 184], [88, 184]];
  const links = [[0, 1], [0, 2], [1, 3], [2, 4], [1, 2], [3, 4]];
  function drawScreen(p) {
    sctx.fillStyle = C.ink; sctx.fillRect(0, 0, 128, 224);
    sctx.lineWidth = 5; sctx.lineCap = 'round';
    links.forEach(([a, b], i) => {
      const k = THREE.MathUtils.clamp(p * links.length - i, 0, 1);
      if (k <= 0) return;
      const [ax, ay] = nodes[a], [bx, by] = nodes[b];
      sctx.strokeStyle = C.soil;
      sctx.beginPath(); sctx.moveTo(ax, ay); sctx.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k); sctx.stroke();
    });
    nodes.forEach(([x, y], i) => {
      const on = i === 0 ? p > 0 : p * links.length >= i;
      sctx.fillStyle = on ? C.cream : C.grass;
      sctx.beginPath(); sctx.arc(x, y, i === 0 ? 13 : 10, 0, Math.PI * 2); sctx.fill();
    });
    // Deterministic CRT scanlines + edge falloff (no per-frame noise).
    sctx.fillStyle = 'rgba(31,44,52,0.35)';
    for (let y = 0; y < 224; y += 4) sctx.fillRect(0, y, 128, 2);
    const g = sctx.createRadialGradient(64, 112, 40, 64, 112, 140);
    g.addColorStop(0, 'rgba(31,44,52,0)'); g.addColorStop(1, 'rgba(31,44,52,0.6)');
    sctx.fillStyle = g; sctx.fillRect(0, 0, 128, 224);
    screenTex.needsUpdate = true;
  }

  // Idea orb + glass halo.
  const orbGroup = new THREE.Group();
  orbGroup.position.set(0, 4.0, 0);
  tower.add(orbGroup);
  const orbMat = toon(C.soil, { emissive: new THREE.Color(C.soil), emissiveIntensity: 0 });
  const orb = withHull(new THREE.Mesh(new THREE.SphereGeometry(0.62, 40, 24), orbMat), 1.06);
  orb.castShadow = true;
  orbGroup.add(orb);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10), new THREE.MeshBasicMaterial({ color: C.cream }));
  glint.position.set(-0.22, 0.28, 0.45);
  orbGroup.add(glint);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 48, 28), new THREE.MeshPhysicalMaterial({
    color: C.cream, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false,
  }));
  orbGroup.add(halo);

  // ---------- Houses at road ends ----------
  const D = 3.7;
  const housePos = [[-D, 0], [0, -D], [0, D], [D, 0]];
  const houses = housePos.map(([x, z], i) => {
    const g = new THREE.Group();
    g.name = 'house-' + i;
    g.position.set(x, 0, z);
    g.add(box(1.25, 0.95, 1.25, toon(C.soil)));
    // Gable roof (cream) as an extruded triangle prism.
    const shape = new THREE.Shape([new THREE.Vector2(-0.72, 0), new THREE.Vector2(0.72, 0), new THREE.Vector2(0, 0.55)]);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false });
    rg.translate(0, 0.95, -0.7);
    const roof = withEdges(new THREE.Mesh(rg, toon(C.cream)));
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);
    // Windows facing camera-side faces (+x and +z).
    const winMat = new THREE.MeshBasicMaterial({ color: C.ink });
    [[0.3, 0.636, 0, 0], [-0.3, 0.636, 0, 0]].forEach(([wx]) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.32), winMat);
      w.position.set(wx, 0.48, 0.632);
      g.add(w);
      const w2 = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.32), winMat);
      w2.position.set(0.632, 0.48, wx);
      w2.rotation.y = Math.PI / 2;
      g.add(w2);
    });
    g.userData.winMat = winMat;
    stage.add(g);
    return g;
  });

  // ---------- Roads + dashed markings ----------
  const roadMat = toon(C.cream);
  function road(ax, az, bx, bz, width = 0.5) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const piv = new THREE.Group();
    piv.position.set(ax, 0, az);
    piv.rotation.y = Math.atan2(dx, dz);
    const g = new THREE.BoxGeometry(width, 0.06, len);
    g.translate(0, 0.03, len / 2);
    const m = new THREE.Mesh(g, roadMat);
    m.receiveShadow = true;
    piv.add(m);
    const dashMat = new THREE.MeshBasicMaterial({ color: C.soil });
    const n = Math.floor(len / 0.42);
    for (let i = 1; i < n; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.2), dashMat);
      d.position.set(0, 0.07, i * 0.42);
      piv.add(d);
    }
    stage.add(piv);
    piv.userData.len = len;
    return piv;
  }
  const spokes = housePos.map(([x, z]) => road(0, 0, x * 0.86, z * 0.86));
  const ring = road(-D * 0.86, 0, 0, -D * 0.86, 0.36);

  // ---------- Trees and figures ----------
  const treeSpots = [[-3.4, -3.3], [3.2, -3.4], [-3.3, 3.2], [3.4, 3.1], [-1.7, -3.9], [2.0, 1.9]];
  const trees = treeSpots.map(([x, z]) => {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8).translate(0, 0.25, 0), toon(C.ink));
    trunk.castShadow = true;
    t.add(trunk);
    const crown = withHull(new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), toon(C.grass, { flatShading: true })), 1.08);
    crown.position.y = 0.78;
    crown.castShadow = true;
    t.add(crown);
    stage.add(t);
    return t;
  });
  const figSpots = [[-1.9, 0.45], [0.45, -1.8], [-0.45, 2.0], [2.2, -0.45]];
  const figures = figSpots.map(([x, z]) => {
    const f = new THREE.Group();
    f.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 4, 8).translate(0, 0.19, 0), toon(C.ink));
    body.castShadow = true;
    f.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), toon(C.ink));
    head.position.y = 0.42;
    f.add(head);
    stage.add(f);
    return f;
  });

  // Pods: the system flow travelling out from the idea to each house.
  const pods = housePos.map(() => {
    const p = withHull(new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10), new THREE.MeshBasicMaterial({ color: C.cream })), 1.25);
    stage.add(p);
    return p;
  });

  // ---------- Camera ----------
  const camera = new THREE.PerspectiveCamera(20, W / H, 1, 120);
  const target = new THREE.Vector3(0, 0.2, 0);
  camera.setViewOffset(W, H, -30, -20, W, H); // place the stage right/below the headline

  const ink = new THREE.Color(C.ink), lit = new THREE.Color(C.cream);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const tiny = 0.0001;

  // State is a plain object owned by the GSAP timeline (one tween per property).
  function apply(s) {
    const az = THREE.MathUtils.degToRad(s.azimuth), el = THREE.MathUtils.degToRad(33);
    camera.position.set(
      target.x + s.radius * Math.cos(el) * Math.sin(az),
      target.y + s.radius * Math.sin(el),
      target.z + s.radius * Math.cos(el) * Math.cos(az));
    camera.lookAt(target);

    tower.scale.set(1, Math.max(tiny, s.tower), 1);
    orbGroup.scale.setScalar(Math.max(tiny, s.orb));
    orbGroup.visible = s.orb > 0.001;
    orbMat.emissiveIntensity = 0.55 * s.glow;
    halo.material.opacity = 0.22 * s.halo;
    halo.scale.setScalar(0.7 + 0.3 * s.halo);
    drawScreen(s.screen);

    spokes.forEach((r) => { r.scale.set(1, 1, Math.max(tiny, s.roads)); r.visible = s.roads > 0.001; });
    ring.scale.set(1, 1, Math.max(tiny, s.ring));
    ring.visible = s.ring > 0.001;

    houses.forEach((h, i) => {
      const k = s['house' + i];
      h.scale.set(1, Math.max(tiny, k), 1);
      h.visible = k > 0.001;
      h.userData.winMat.color.copy(ink).lerp(lit, s['win' + i]);
    });
    trees.forEach((t) => { t.scale.setScalar(Math.max(tiny, s.trees)); t.visible = s.trees > 0.001; });
    figures.forEach((f) => { f.scale.setScalar(Math.max(tiny, s.figures)); f.visible = s.figures > 0.001; });

    pods.forEach((p, i) => {
      const k = s['pod' + i];
      const [hx, hz] = housePos[i];
      p.position.set(hx * 0.8 * k, 0.2, hz * 0.8 * k);
      const vis = k > 0.001 && k < 0.999;
      p.visible = vis;
      p.scale.setScalar(vis ? Math.min(1, Math.min(k, 1 - k) * 8) : tiny);
    });
  }

  return {
    render(state) {
      apply(state);
      renderer.render(scene, camera);
    },
    clamp01,
  };
}

window.createDiorama = createDiorama;
