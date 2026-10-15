// Ancient Greek Vase Painting — style-125 preview scene.
// Three.js renderer (LatheGeometry amphora + Canvas 2D wrap texture), GSAP motion owner.
// All visual state is derived from the paused GSAP timeline; no clocks or tickers.
import * as THREE from 'three';

const PAL = { bg: '#100D09', fg: '#F3DFC0', clay: '#BA642F' };
const W = 1280, H = 720;

// ---------------------------------------------------------------- texture space
// Texture V maps vessel height: svg y 80 (lip) .. 645 (foot), matching ILLUSTRATION.svg.
const TEX_W = 4096, TEX_H = 2048;
const Y0 = 80, Y1 = 645;
const SY = TEX_H / (Y1 - Y0);
const ty = (svgY) => (svgY - Y0) * SY;
const FRIEZE_CIRC = 1320; // figure-space units around the body (~r 210)
const SX = TEX_W / FRIEZE_CIRC;
const GROUND = 466;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Base map: terracotta ground + permanent dark bands (lip, rules, foot).
function paintBase() {
  const c = makeCanvas(TEX_W, TEX_H);
  const g = c.getContext('2d');
  g.fillStyle = PAL.clay;
  g.fillRect(0, 0, TEX_W, TEX_H);
  g.fillStyle = PAL.bg;
  g.fillRect(0, 0, TEX_W, ty(104));
  const rule = (y, h) => g.fillRect(0, ty(y) - (h * SY) / 2, TEX_W, h * SY);
  rule(108, 3); rule(190, 3); rule(220, 3); rule(262, 3); rule(478, 3); rule(486, 3);
  g.fillRect(0, ty(566), TEX_W, TEX_H - ty(566));
  return c;
}

// ---------------------------------------------------------------- ornament registers
function paintNeck(g) {
  const N = 14, w = TEX_W / N, y0 = ty(116), y1 = ty(184), h = y1 - y0, cy = (y0 + y1) / 2;
  for (let i = 0; i < N; i++) {
    const x = i * w, cx = x + w / 2;
    g.fillStyle = PAL.bg;
    g.beginPath();
    g.moveTo(cx, y0); g.lineTo(cx + w * 0.32, cy); g.lineTo(cx, y1); g.lineTo(cx - w * 0.32, cy);
    g.closePath(); g.fill();
    g.strokeStyle = PAL.fg; g.lineWidth = 6;
    g.beginPath();
    g.moveTo(cx, y0 + h * 0.28); g.lineTo(cx + w * 0.14, cy); g.lineTo(cx, y1 - h * 0.28); g.lineTo(cx - w * 0.14, cy);
    g.closePath(); g.stroke();
    g.fillStyle = PAL.bg;
    g.beginPath(); g.arc(x, cy, h * 0.07, 0, Math.PI * 2); g.fill();
    if (i === 0) { g.beginPath(); g.arc(TEX_W, cy, h * 0.07, 0, Math.PI * 2); g.fill(); }
  }
}

function paintMeander(g) {
  const N = 40, w = TEX_W / N, y0 = ty(227), h = ty(255) - y0;
  g.strokeStyle = PAL.bg; g.lineWidth = 10; g.lineCap = 'butt'; g.lineJoin = 'miter';
  const pts = [[0.75, 0.88], [0.75, 0.12], [0.12, 0.12], [0.12, 0.64], [0.52, 0.64], [0.52, 0.36], [0.34, 0.36]];
  for (let i = 0; i < N; i++) {
    const x = i * w;
    g.beginPath();
    g.moveTo(x - 1, y0 + 0.88 * h); g.lineTo(x + w + 1, y0 + 0.88 * h);
    g.stroke();
    g.beginPath();
    pts.forEach(([px, py], k) => (k ? g.lineTo : g.moveTo).call(g, x + px * w, y0 + py * h));
    g.stroke();
  }
}

function paintTongues(g) {
  const N = 44, w = TEX_W / N, y0 = ty(496), h = ty(558) - y0;
  g.fillStyle = PAL.bg;
  g.fillRect(0, y0 - 4, TEX_W, 10);
  for (let i = 0; i < N; i++) {
    const x = i * w;
    const p = new Path2D();
    p.moveTo(x + 0.12 * w, y0);
    p.lineTo(x + 0.12 * w, y0 + 0.55 * h);
    p.quadraticCurveTo(x + 0.12 * w, y0 + 0.94 * h, x + 0.5 * w, y0 + 0.94 * h);
    p.quadraticCurveTo(x + 0.88 * w, y0 + 0.94 * h, x + 0.88 * w, y0 + 0.55 * h);
    p.lineTo(x + 0.88 * w, y0);
    p.closePath();
    if (i % 2 === 0) { g.fillStyle = PAL.bg; g.fill(p); }
    else { g.strokeStyle = PAL.bg; g.lineWidth = 7; g.stroke(p); }
  }
}

// ---------------------------------------------------------------- frieze figures
const rad = (d) => (d * Math.PI) / 180;
function limb(g, sx, sy, a, b, l1, l2, w1, w2) {
  const ex = sx + l1 * Math.sin(rad(a)), ey = sy + l1 * Math.cos(rad(a));
  const hx = ex + l2 * Math.sin(rad(a + b)), hy = ey + l2 * Math.cos(rad(a + b));
  g.lineWidth = w1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
  g.lineWidth = w2; g.beginPath(); g.moveTo(ex, ey); g.lineTo(hx, hy); g.stroke();
  g.beginPath(); g.arc(hx, hy, 4.4, 0, Math.PI * 2); g.fill();
  return [hx, hy, ex, ey];
}
function incise(g, fn) {
  g.save(); g.strokeStyle = PAL.fg; g.lineWidth = 1.4; g.lineCap = 'round';
  g.beginPath(); fn(); g.stroke(); g.restore();
}
function flame(g, x, y, s) {
  g.fillStyle = PAL.bg;
  g.beginPath();
  g.moveTo(x, y);
  g.bezierCurveTo(x + s * 0.7, y - s * 0.3, x + s * 0.5, y - s * 1.0, x + s * 0.05, y - s * 1.6);
  g.bezierCurveTo(x - s * 0.1, y - s * 1.0, x - s * 0.7, y - s * 0.5, x, y);
  g.fill();
  incise(g, () => { g.moveTo(x, y - s * 0.25); g.quadraticCurveTo(x + s * 0.3, y - s * 0.7, x + s * 0.05, y - s * 1.15); });
}

// Draws a figure facing +x in local coords (ground y=0, up = negative). Returns hands in frieze coords.
function figure(g, f) {
  const dir = f.dir || 1;
  g.save();
  g.translate(f.x, 0); g.scale(dir, 1);
  g.fillStyle = PAL.bg; g.strokeStyle = PAL.bg; g.lineCap = 'round'; g.lineJoin = 'round';
  const lift = f.seated ? 36 : 0;
  // legs
  if (f.seated) {
    g.fillRect(-20, -60, 30, 6);
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(-16, -56); g.lineTo(-20, 0); g.moveTo(6, -56); g.lineTo(10, 0); g.stroke();
    g.lineWidth = 11;
    g.beginPath(); g.moveTo(-4, -64); g.lineTo(26, -62); g.stroke();
    g.lineWidth = 9;
    g.beginPath(); g.moveTo(26, -62); g.lineTo(30, -4); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(30, -4); g.lineTo(39, -3); g.stroke();
    // cloak over lap
    g.beginPath(); g.moveTo(-10, -70); g.quadraticCurveTo(14, -76, 30, -64); g.lineTo(28, -40);
    g.quadraticCurveTo(10, -50, -8, -56); g.closePath(); g.fill();
  } else {
    const s = f.stride ?? 22;
    g.lineWidth = 10;
    g.beginPath(); g.moveTo(2, -92); g.lineTo(s * 0.5, -46); g.lineTo(s, -5); g.stroke();
    g.beginPath(); g.moveTo(-2, -92); g.lineTo(-s * 0.4, -46); g.lineTo(-s * 0.8, -5); g.stroke();
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(s, -4); g.lineTo(s + 9, -3); g.moveTo(-s * 0.8, -4); g.lineTo(-s * 0.8 + 9, -3); g.stroke();
    if (f.dress) {
      g.beginPath(); g.moveTo(-9, -104); g.lineTo(9, -104);
      g.bezierCurveTo(14, -60, 22, -32, 25, -9); g.lineTo(-23, -9);
      g.bezierCurveTo(-18, -32, -12, -60, -9, -104); g.closePath(); g.fill();
    }
  }
  g.translate(0, lift);
  // torso, neck, head
  g.beginPath(); g.moveTo(-10, -104); g.bezierCurveTo(-14, -120, -16, -136, -12, -147);
  g.lineTo(14, -147); g.bezierCurveTo(19, -136, 12, -118, 9, -104); g.closePath(); g.fill();
  g.fillRect(-4, -158, 9, 14);
  g.beginPath(); g.ellipse(2, -165, 10, 11, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(10, -168); g.lineTo(15, -162); g.lineTo(10, -160); g.fill();
  g.beginPath(); g.ellipse(-6, -169, 7, 8, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(-12, -160, 5, 0, Math.PI * 2); g.fill();
  if (f.beard) { g.beginPath(); g.moveTo(3, -157); g.lineTo(12, -153); g.lineTo(1, -149); g.fill(); }
  // arms
  const af = f.armF || [40, 30], ab = f.armB || [-30, -10];
  const hb = limb(g, -4, -140, ab[0], ab[1], 27, 25, 8, 7);
  const hf = limb(g, 6, -140, af[0], af[1], 27, 25, 8, 7);
  // incised detail
  incise(g, () => {
    g.ellipse(6, -166, 2.6, 1.3, 0, 0, Math.PI * 2);
    g.moveTo(-9, -158); g.quadraticCurveTo(-5, -177, 10, -175);
    g.moveTo(1, -146); g.quadraticCurveTo(9, -139, 7, -128);
    g.moveTo(11, -134); g.quadraticCurveTo(5, -126, 9, -118);
    g.moveTo(-9, -106); g.lineTo(9, -106);
    g.moveTo(hf[2] - 3, hf[3]); g.lineTo(hf[2] + 3, hf[3]);
  });
  if (f.dress && !f.seated) {
    incise(g, () => {
      g.moveTo(-3, -100); g.lineTo(-9, -14);
      g.moveTo(2, -100); g.lineTo(4, -14);
      g.moveTo(6, -100); g.lineTo(15, -14);
      g.moveTo(-20, -15); g.lineTo(22, -15);
    });
  } else if (!f.seated) {
    const s = f.stride ?? 22;
    incise(g, () => { g.moveTo(s * 0.5 - 4, -48); g.quadraticCurveTo(s * 0.5, -44, s * 0.5 + 3, -48); });
  } else {
    incise(g, () => { g.moveTo(-6, -64 - lift); g.quadraticCurveTo(12, -70 - lift, 26, -62 - lift); });
  }
  g.restore();
  const map = (h) => [f.x + dir * h[0], h[1] + lift];
  return { front: map(hf), back: map(hb) };
}

function cord(g, a, b, sag) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + sag;
  g.strokeStyle = PAL.bg; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(mx, my + sag * 0.6, b[0], b[1]); g.stroke();
  const nx = 0.25 * a[0] + 0.5 * mx + 0.25 * b[0];
  const ny = 0.25 * a[1] + 0.5 * (my + sag * 0.6) + 0.25 * b[1];
  g.fillStyle = PAL.bg; g.beginPath(); g.arc(nx, ny, 6.5, 0, Math.PI * 2); g.fill();
  incise(g, () => g.arc(nx, ny, 3.2, 0, Math.PI * 2));
  // pendant tie: a node drops a thread to a smaller knot (the system branching)
  g.lineWidth = 2; g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx, ny + 26); g.stroke();
  g.beginPath(); g.arc(nx, ny + 29, 3.8, 0, Math.PI * 2); g.fill();
}

function drawFrieze(g) {
  const figs = [
    { x: 475, dir: 1, seated: true, beard: true, armF: [150, 12], armB: [20, 70] },     // the idea
    { x: 585, dir: -1, dress: true, armF: [95, -8], armB: [-20, -20], stride: 14 },      // receives
    { x: 690, dir: 1, beard: true, armF: [165, 5], armB: [-55, -10], stride: 34 },       // carries
    { x: 800, dir: 1, dress: true, armF: [62, 22], armB: [-58, -12], stride: 18 },
    { x: 910, dir: 1, beard: true, armF: [62, 22], armB: [-58, -12], stride: 26 },
    { x: 1020, dir: 1, dress: true, armF: [62, 22], armB: [-58, -12], stride: 18 },
    { x: 1130, dir: 1, armF: [62, 22], armB: [-58, -12], stride: 26 },
    { x: 1240, dir: 1, dress: true, armF: [62, 22], armB: [-58, -12], stride: 18 },
    { x: 1350, dir: 1, beard: true, armF: [62, 22], armB: [-58, -12], stride: 26 },
    { x: 1460, dir: 1, dress: true, armF: [62, 22], armB: [-58, -12], stride: 18 },
    { x: 1570, dir: 1, armF: [62, 22], armB: [-58, -12], stride: 26 },
    { x: 1680, dir: 1, dress: true, armF: [78, 10], armB: [-58, -12], stride: 18 },     // closes the loop
  ];
  for (const off of [-FRIEZE_CIRC, 0, FRIEZE_CIRC]) {
    g.save();
    g.setTransform(SX, 0, 0, SY, off * SX, ty(GROUND));
    const hands = figs.map((f) => figure(g, f));
    // the idea's flame and the torch it lights
    const hi = hands[0].front; flame(g, hi[0] + 1, hi[1] - 4, 14);
    g.strokeStyle = PAL.bg; g.lineWidth = 4;
    const hr = hands[1].front; g.beginPath(); g.moveTo(hr[0], hr[1] + 8); g.lineTo(hr[0] - 2, hr[1] - 18); g.stroke();
    flame(g, hr[0] - 2, hr[1] - 18, 8);
    const hc = hands[2].front; g.beginPath(); g.moveTo(hc[0], hc[1] + 8); g.lineTo(hc[0] + 3, hc[1] - 18); g.stroke();
    flame(g, hc[0] + 3, hc[1] - 18, 9);
    // connected system: cords linking every hand from the torch-bearer around to the idea
    for (let i = 2; i < figs.length - 1; i++) cord(g, hands[i].front, hands[i + 1].back, 10);
    const last = hands[figs.length - 1].front;
    const stool = [figs[0].x + FRIEZE_CIRC - 18, -58];
    cord(g, last, stool, 8);
    // small filler rosettes near the ground line
    g.fillStyle = PAL.bg;
    for (let i = 2; i < figs.length; i++) {
      const rx = (figs[i].x + figs[i - 1].x) / 2 + 6;
      for (let k = 0; k < 6; k++) {
        g.beginPath(); g.arc(rx + 5 * Math.cos(k * 1.047), -26 + 5 * Math.sin(k * 1.047), 2.2, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  }
}

function paintPaint() {
  const c = makeCanvas(TEX_W, TEX_H);
  const g = c.getContext('2d');
  paintNeck(g); paintMeander(g); drawFrieze(g); paintTongues(g);
  return c;
}

// ---------------------------------------------------------------- burnish detail (non-color data)
function surfaceMaps() {
  const w = 512, h = 256;
  let s = 125125;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lat = (gx, gy) => { const a = new Float32Array(gx * gy); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const L1 = lat(32, 16), L2 = lat(8, 64);
  const noise = (L, gx, gy, x, y) => {
    const fx = (x / w) * gx, fy = (y / h) * gy;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty2 = fy - y0;
    const sm = (t) => t * t * (3 - 2 * t);
    const v = (i, j) => L[((j % gy) + gy) % gy * gx + (((i % gx) + gx) % gx)];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sm(tx);
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sm(tx);
    return a + (b - a) * sm(ty2);
  };
  const hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    hgt[y * w + x] = 0.35 * noise(L1, 32, 16, x, y) + 0.65 * noise(L2, 8, 64, x, y); // horizontal burnish strokes
  const nC = makeCanvas(w, h), rC = makeCanvas(w, h);
  const nI = nC.getContext('2d').createImageData(w, h), rI = rC.getContext('2d').createImageData(w, h);
  const at = (x, y) => hgt[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 2.5, dy = (at(x, y + 1) - at(x, y - 1)) * 2.5;
    const len = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    nI.data[i] = (-dx / len * 0.5 + 0.5) * 255; nI.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
    nI.data[i + 2] = (1 / len * 0.5 + 0.5) * 255; nI.data[i + 3] = 255;
    const r = (0.5 + (at(x, y) - 0.5) * 0.25) * 255;
    rI.data[i] = rI.data[i + 1] = rI.data[i + 2] = r; rI.data[i + 3] = 255;
  }
  nC.getContext('2d').putImageData(nI, 0, 0); rC.getContext('2d').putImageData(rI, 0, 0);
  const mk = (c) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.colorSpace = THREE.NoColorSpace; return t; };
  return { normal: mk(nC), rough: mk(rC) };
}

// ---------------------------------------------------------------- scene
function buildScene() {
  const root = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(new THREE.Color(PAL.bg), 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps terracotta hue; exposure checked at 1.0
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.id = 'gl';
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);

  const baseTex = new THREE.CanvasTexture(paintBase());
  const paintTex = new THREE.CanvasTexture(paintPaint());
  for (const t of [baseTex, paintTex]) {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.generateMipmaps = true;
  }
  const maps = surfaceMaps();

  // Authored amphora profile (svg half-width px, svg y), bottom -> top.
  const PROFILE = [
    [0, 645], [92, 645], [95, 636], [86, 620], [64, 606], [66, 596], [92, 576], [140, 540], [184, 490],
    [208, 430], [215, 370], [206, 312], [182, 262], [146, 222], [100, 197], [74, 182], [61, 152], [56, 124],
    [58, 108], [70, 101], [72, 86], [66, 80], [56, 84], [53, 100],
  ];
  const toW = (r, y) => new THREE.Vector3(r / 100, (362.5 - y) / 100, 0);
  const pcurve = new THREE.CatmullRomCurve3(PROFILE.map(([r, y]) => toW(r, y)), false, 'centripetal');
  const lathePts = pcurve.getPoints(180).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  const latheGeo = new THREE.LatheGeometry(lathePts, 64);
  { // V by height so texture rows match svg y; U wraps exactly once.
    const pos = latheGeo.attributes.position, uv = latheGeo.attributes.uv;
    const yTop = (362.5 - Y0) / 100, yBot = (362.5 - Y1) / 100;
    for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - yBot) / (yTop - yBot));
    uv.needsUpdate = true;
  }

  const uniforms = { paintMap: { value: paintTex }, uReveal: { value: new THREE.Vector3(0, 0, 0) } };
  const vesselMat = new THREE.MeshStandardMaterial({
    map: baseTex, color: 0xffffff, roughness: 0.62, metalness: 0.0,
    roughnessMap: maps.rough, normalMap: maps.normal, normalScale: new THREE.Vector2(0.12, 0.12),
    side: THREE.DoubleSide,
  });
  vesselMat.onBeforeCompile = (sh) => {
    sh.uniforms.paintMap = uniforms.paintMap;
    sh.uniforms.uReveal = uniforms.uReveal;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
  uniform sampler2D paintMap;
  uniform vec3 uReveal;
  float vhash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float sweep(vec2 uv, float prog, float start){
    float d = fract(uv.x - start);
    float n = vhash(floor(uv*vec2(700.0,350.0)));
    float e = prog*1.06 - 0.03;
    return smoothstep(e + 0.012, e - 0.012, d + (n - 0.5)*0.018);
  }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
    float svgY = ${Y0.toFixed(1)} + (1.0 - vMapUv.y) * ${(Y1 - Y0).toFixed(1)};
    float regP = svgY < 262.0 ? uReveal.x : (svgY < 490.0 ? uReveal.y : uReveal.z);
    float regS = svgY < 262.0 ? 0.20 : (svgY < 490.0 ? 0.27 : 0.30);
    vec4 paintS = texture2D(paintMap, vMapUv);
    float paintA = paintS.a * sweep(vMapUv, regP, regS);
    diffuseColor.rgb = mix(diffuseColor.rgb, paintS.rgb, paintA);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    roughnessFactor *= mix(1.0, 0.72, paintA);`);
  };
  vesselMat.customProgramCacheKey = () => 'vase-reveal-v1';

  const handleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PAL.clay), roughness: 0.62, metalness: 0,
    roughnessMap: maps.rough, normalMap: maps.normal, normalScale: new THREE.Vector2(0.12, 0.12),
  });

  const vessel = new THREE.Group();
  vessel.add(new THREE.Mesh(latheGeo, vesselMat));
  const HANDLE = [[50, 128], [105, 118], [150, 135], [168, 180], [158, 222], [140, 250]];
  for (const side of [1, -1]) {
    const c = new THREE.CatmullRomCurve3(HANDLE.map(([r, y]) => toW(r * side, y)), false, 'centripetal');
    vessel.add(new THREE.Mesh(new THREE.TubeGeometry(c, 64, 0.075, 12, false), handleMat));
  }
  scene.add(vessel);

  scene.add(new THREE.HemisphereLight(new THREE.Color(PAL.fg), new THREE.Color(PAL.bg), 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(-5, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(PAL.fg), 3.2); rim.position.set(7, 3, -6); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(new THREE.Color(PAL.fg), 1.6); rim2.position.set(-7, 1, -5); scene.add(rim2);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(4, -2, 6); scene.add(fill);

  // ---------------------------------------------------------------- state + render
  const S = { rot: Math.PI * 1.25, az: -0.12, el: 0.11, meander: 0, frieze: 0, tongue: 0 };
  const DIST = 13.6;
  function render() {
    vessel.rotation.y = S.rot;
    camera.position.set(
      DIST * Math.cos(S.el) * Math.sin(S.az),
      DIST * Math.sin(S.el),
      DIST * Math.cos(S.el) * Math.cos(S.az));
    camera.lookAt(0, -0.02, 0);
    uniforms.uReveal.value.set(S.meander, S.frieze, S.tongue);
    renderer.render(scene, camera);
  }
  renderer.compile(scene, camera);

  // Scene API: GSAP timeline (inline in index.html) owns S and calls render().
  window.__vaseScene = { S, render };
  render();
}
try {
  buildScene();
} catch (err) {
  window.__vaseSceneError = String(err && err.message || err);
}
