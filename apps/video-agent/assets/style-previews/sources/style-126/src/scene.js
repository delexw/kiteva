// Stained-Glass Light Projection — Three.js stone interior with a shared
// Canvas-2D stained-glass texture used as (a) the window's emissive map and
// (b) SpotLight.map projected through the window with shadow-mapped occlusion.
// Approximation: projected texture + shadow map, NOT physical refraction/caustics.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const PAL = {
  bg: '#101216',
  fg: '#F4EEE3',
  ruby: '#A82E43',
  sapphire: '#284A9D',
  gold: '#D6AD52',
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Canvas 2D: stained-glass image, painted once ----
function paintGlass(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2, cy = size / 2, R = size * 0.48;
  const s = size / 360; // svg units (r=170) -> canvas
  g.fillStyle = PAL.bg;
  g.fillRect(0, 0, size, size);
  // 12 wedges, colour sequence symmetric under both mirror axes so the
  // projected copy reads identically regardless of projector orientation.
  const seq = ['ruby', 'sapphire', 'gold', 'gold', 'sapphire', 'ruby', 'ruby', 'sapphire', 'gold', 'gold', 'sapphire', 'ruby'];
  for (let i = 0; i < 12; i++) {
    const a0 = -Math.PI / 2 + (i * Math.PI) / 6;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, a0, a0 + Math.PI / 6);
    g.closePath();
    g.fillStyle = PAL[seq[i]];
    g.fill();
  }
  // subtle deterministic glass streaks (foreground token, low alpha)
  const rnd = mulberry32(126);
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  for (let i = 0; i < 160; i++) {
    const x = rnd() * size, y = rnd() * size, l = 8 + rnd() * 30 * s;
    g.strokeStyle = PAL.fg;
    g.globalAlpha = 0.04 + rnd() * 0.06;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l * 0.6, y + l * 0.3); g.stroke();
  }
  g.restore();
  g.globalAlpha = 1;
  // leading: ring, hexagon, three diameters, wedge seams
  g.strokeStyle = PAL.bg;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 4 * s;
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 6;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * 40 * s, cy + Math.sin(a) * 40 * s);
    g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
  }
  g.lineWidth = 9 * s;
  g.beginPath(); g.arc(cx, cy, R - 4 * s, 0, Math.PI * 2); g.stroke();
  const hex = [];
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 3;
    hex.push([cx + Math.cos(a) * 110 * s, cy + Math.sin(a) * 110 * s]);
  }
  g.lineWidth = 7 * s;
  g.beginPath();
  hex.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  for (let k = 0; k < 3; k++) { g.moveTo(hex[k][0], hex[k][1]); g.lineTo(hex[k + 3][0], hex[k + 3][1]); }
  g.stroke();
  // nodes of the "connected system" + central idea
  const nodeCol = ['ruby', 'sapphire', 'sapphire', 'ruby', 'sapphire', 'sapphire'];
  hex.forEach(([x, y], k) => {
    g.beginPath(); g.arc(x, y, 22 * s, 0, Math.PI * 2);
    g.fillStyle = PAL[nodeCol[k]]; g.fill();
    g.lineWidth = 6 * s; g.stroke();
  });
  g.beginPath(); g.arc(cx, cy, 40 * s, 0, Math.PI * 2);
  g.fillStyle = PAL.fg; g.fill();
  g.lineWidth = 7 * s; g.stroke();
  g.beginPath(); g.arc(cx, cy, 20 * s, 0, Math.PI * 2);
  g.fillStyle = PAL.gold; g.fill();
  return c;
}

// ---- Canvas 2D: stationary stone grain + coursing ----
function paintStone(size, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rnd = mulberry32(seed);
  // cool dim gray stone, mid albedo
  for (let i = 0; i < size * size; i++) {
    const n = rnd();
    const v = 112 + (n - 0.5) * 34;
    img.data[i * 4] = v * 0.93;
    img.data[i * 4 + 1] = v * 0.96;
    img.data[i * 4 + 2] = v * 1.02;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // block joints (matches SVG 80x40 coursing)
  g.strokeStyle = 'rgba(16,18,22,0.55)';
  g.lineWidth = 3;
  const bw = size / 4, bh = size / 8;
  for (let r = 0; r < 8; r++) {
    g.beginPath(); g.moveTo(0, r * bh + 1); g.lineTo(size, r * bh + 1); g.stroke();
    const off = r % 2 ? bw / 2 : 0;
    for (let k = 0; k <= 4; k++) {
      g.beginPath(); g.moveTo(k * bw + off, r * bh); g.lineTo(k * bw + off, (r + 1) * bh); g.stroke();
    }
  }
  return c;
}

export function createScene(canvasParent, W, H) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  // Linear (identity at exposure 1) so unlit stone equals the #101216 field.
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(new THREE.Color(PAL.bg), 1);
  canvasParent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.bg);

  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
  camera.position.set(0, 3.0, 12.5);
  camera.lookAt(0, 2.7, 0);

  // shared textures (cached once)
  const glassCanvas = paintGlass(1024);
  const glassTex = new THREE.CanvasTexture(glassCanvas);
  glassTex.colorSpace = THREE.SRGBColorSpace;
  glassTex.anisotropy = 4;
  const stoneTex = new THREE.CanvasTexture(paintStone(512, 9));
  stoneTex.colorSpace = THREE.SRGBColorSpace;
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;

  const stoneMat = (rx, ry) => {
    const t = stoneTex.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, map: t, roughness: 0.94, metalness: 0,
      emissive: new THREE.Color(PAL.bg), emissiveIntensity: 1,
    });
  };

  // ---- room (box) ----
  const WIN = { x: -3.4, y: 3.7, r: 1.55 };
  const shape = new THREE.Shape();
  shape.moveTo(-12, 0); shape.lineTo(12, 0); shape.lineTo(12, 9); shape.lineTo(-12, 9); shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(WIN.x, WIN.y, WIN.r, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false, curveSegments: 64 });
  wallGeo.translate(0, 0, -0.45);
  // planar UVs from world xy for the extrude
  {
    const p = wallGeo.attributes.position, uv = wallGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, p.getY(i) / 2);
  }
  const backWall = new THREE.Mesh(wallGeo, stoneMat(1, 1));
  backWall.castShadow = true; backWall.receiveShadow = true;
  scene.add(backWall);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), stoneMat(7, 4));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 7.55);
  floor.receiveShadow = true;
  scene.add(floor);

  const sideGeo = new THREE.PlaneGeometry(16, 9);
  const leftWall = new THREE.Mesh(sideGeo, stoneMat(4, 2));
  leftWall.rotation.y = Math.PI / 2; leftWall.position.set(-12, 4.5, 7.5); leftWall.receiveShadow = true;
  const rightWall = new THREE.Mesh(sideGeo, stoneMat(4, 2));
  rightWall.rotation.y = -Math.PI / 2; rightWall.position.set(12, 4.5, 7.5); rightWall.receiveShadow = true;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), stoneMat(6, 4));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 9, 7.5);
  scene.add(leftWall, rightWall, ceiling);

  // ---- window: stone surround, lead mullions (shadow casters), glass plane ----
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.9, emissive: new THREE.Color(PAL.bg) });
  const surround = new THREE.Mesh(new THREE.TorusGeometry(WIN.r + 0.08, 0.14, 16, 96), frameMat);
  surround.position.set(WIN.x, WIN.y, 0.02);
  surround.castShadow = true; surround.receiveShadow = true;
  scene.add(surround);

  const leadMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6, metalness: 0.3 });
  const mullions = new THREE.Group();
  mullions.position.set(WIN.x, WIN.y, -0.2);
  const s = WIN.r / 170; // svg units -> world
  const bar = (x1, y1, x2, y2, w) => {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, w, 0.06), leadMat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
    m.rotation.z = Math.atan2(dy, dx);
    m.castShadow = true;
    mullions.add(m);
  };
  const hexW = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 - (k * Math.PI) / 3;
    hexW.push([Math.cos(a) * 110 * s, Math.sin(a) * 110 * s]);
  }
  for (let k = 0; k < 6; k++) bar(...hexW[k], ...hexW[(k + 1) % 6], 0.055);
  for (let k = 0; k < 3; k++) bar(...hexW[k], ...hexW[k + 3], 0.05);
  scene.add(mullions);

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x000000, roughness: 0.35, metalness: 0,
    emissive: 0xffffff, emissiveMap: glassTex, emissiveIntensity: 0.3,
  });
  const glass = new THREE.Mesh(new THREE.CircleGeometry(WIN.r * 1.0, 96), glassMat);
  glass.position.set(WIN.x, WIN.y, -0.27);
  glass.castShadow = false; // light passes; colour comes from SpotLight.map
  scene.add(glass);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xc9d2e0, 0x2a2d33, 0.9); // cool dim stone
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xdfe6f2, 0.35);
  fill.position.set(4, 8, 10);
  scene.add(fill);

  const spot = new THREE.SpotLight(0xffffff, 0, 40, 0.3, 0.25, 0);
  spot.map = glassTex; // identical image to the window's emissive map
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  spot.shadow.radius = 3;
  spot.shadow.camera.near = 1;
  spot.shadow.camera.far = 30;
  scene.add(spot, spot.target);

  // faint dust-lit shaft (additive, foreground token)
  const beamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PAL.fg), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true), beamMat);
  scene.add(beam);

  // ---- post ----
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0, 0.6, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const C = new THREE.Vector3(WIN.x, WIN.y, 0);
  const tgt = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const D = 7.5;

  // state: plain numbers, written by GSAP from the shared timeline time
  function render(st) {
    hemi.intensity = st.hemi;
    fill.intensity = st.fill;
    glassMat.emissiveIntensity = st.glass;
    // light rotates about the window centre: pattern sweeps across the floor
    tgt.set(st.tx, 0, st.tz);
    dir.copy(tgt).sub(C).normalize();
    spot.position.copy(C).addScaledVector(dir, -D);
    spot.target.position.copy(tgt);
    spot.target.updateMatrixWorld();
    spot.angle = Math.atan((WIN.r * st.fit) / D);
    spot.intensity = st.spot;
    // beam from window to floor
    const L = C.distanceTo(tgt);
    beam.position.copy(C).add(tgt).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(up, dir.clone().negate());
    beam.scale.set(1, L, 1);
    const geoR = beam.geometry;
    if (!geoR.userData.shaped) {
      // taper: top radius at window (+y local is toward window)
      const p = geoR.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const yy = p.getY(i);
        const r = yy > 0 ? WIN.r * 0.9 : WIN.r * 1.9;
        const a = Math.atan2(p.getZ(i), p.getX(i));
        p.setXYZ(i, Math.cos(a) * r, yy, Math.sin(a) * r);
      }
      p.needsUpdate = true;
      geoR.userData.shaped = true;
    }
    beamMat.opacity = st.beam;
    bloom.strength = st.bloom;
    composer.render();
  }

  // pre-warm shader programs and shadow map
  renderer.compile(scene, camera);

  return { render, palette: PAL };
}
