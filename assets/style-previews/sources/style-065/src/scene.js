// Retrofuturism (1962 atomic-age) "Idea Engine" apparatus — Three.js style renderer.
// No clocks, no RAF loop: draw() renders purely from the state object that the
// single paused GSAP timeline owns. Every redraw is a pure function of that state.
import * as THREE from 'three';

const C = { env: '#141D24', envFloor: '#0F161B', ringsDecor: '#1B2730', slate: '#314449', cream: '#EEE3CB', teal: '#6B9693', copper: '#BC7751' };
const W = 1280, H = 720, FOV = 30;
const D = (H / 100) / 2 / Math.tan((FOV * Math.PI) / 360); // 1 world unit ≈ 100px on the z=0 plane
const P = (px, py, z = 0) => { const k = (D - z) / D; return new THREE.Vector3(((px - 640) / 100) * k, ((360 - py) / 100) * k, z); };
const clamp = (v) => Math.max(0, Math.min(1, v));

function backgroundTexture() {
  // Stationary environment: deep slate-navy observatory wall, warm practical glow,
  // concentric dome arcs, floor band with a copper inlay line and a hatched schematic disc.
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = C.env; g.fillRect(0, 0, W, H);
  const warm = g.createRadialGradient(1180, 60, 0, 1180, 60, 420);
  warm.addColorStop(0, 'rgba(188,119,81,0.30)'); warm.addColorStop(1, 'rgba(188,119,81,0)');
  g.fillStyle = warm; g.fillRect(0, 0, W, H);
  g.strokeStyle = C.ringsDecor; g.lineWidth = 10;
  for (let r = 310; r <= 640; r += 66) { g.beginPath(); g.arc(900, 290, r, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = C.envFloor; g.fillRect(0, 548, W, H - 548);
  g.strokeStyle = 'rgba(188,119,81,0.45)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 548); g.lineTo(W, 548); g.stroke();
  // Hatched schematic disc behind the atom (diegetic diagram panel).
  g.save(); g.beginPath(); g.arc(900, 290, 250, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#18242B'; g.fillRect(640, 30, 520, 520);
  g.strokeStyle = 'rgba(107,150,147,0.30)'; g.lineWidth = 2;
  for (let x = 600; x < 1300; x += 12) { g.beginPath(); g.moveTo(x, 560); g.lineTo(x + 540, 20); g.stroke(); }
  g.restore();
  g.strokeStyle = 'rgba(107,150,147,0.45)'; g.lineWidth = 2;
  g.beginPath(); g.arc(900, 290, 250, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowTexture(rgb) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, `rgba(${rgb},1)`); r.addColorStop(0.35, `rgba(${rgb},0.45)`); r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowSprite(tex, opacity = 0) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  return s;
}

function tubeFromPixels(points, radius, mat, segs = 96, z = 0) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, zz]) => P(x, y, zz ?? z)));
  const geo = new THREE.TubeGeometry(curve, segs, radius, 8, false);
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, geo, curve, segs, radial: 8 };
}

function setDraw(t, p) { t.geo.setDrawRange(0, Math.floor(clamp(p) * t.segs) * t.radial * 6); t.mesh.visible = p > 0.002; }

export function create(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = backgroundTexture();
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 100); camera.position.set(0, 0, D); camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xdfe6e4, 0x1a242a, 1.4));
  const key = new THREE.DirectionalLight(0xffe2c8, 2.2); key.position.set(6, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4c0, 0.8); rim.position.set(-6, 2, 4); scene.add(rim);

  const copperGlow = glowTexture('188,119,81');
  const creamGlow = glowTexture('238,227,203');

  // ---------- Atom / idea engine ----------
  const atom = new THREE.Group(); atom.position.copy(P(900, 290)); scene.add(atom);
  const nucMat = new THREE.MeshStandardMaterial({ color: C.copper, roughness: 0.4, metalness: 0.25, emissive: new THREE.Color(C.copper), emissiveIntensity: 0.2 });
  const nucleus = new THREE.Group(); atom.add(nucleus);
  nucleus.add(new THREE.Mesh(new THREE.SphereGeometry(0.44, 48, 32), nucMat));
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.035, 12, 64), new THREE.MeshStandardMaterial({ color: C.slate, roughness: 0.6 }));
  nucleus.add(bezel);
  const spec = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: C.cream }));
  spec.position.set(-0.15, 0.15, 0.36); nucleus.add(spec);
  const nucHalo = glowSprite(copperGlow); atom.add(nucHalo);
  const nucLight = new THREE.PointLight(0xd98a5c, 0, 6, 2); nucLight.position.set(0, 0, 0.8); atom.add(nucLight);

  const rays = [];
  const rayMat = new THREE.MeshStandardMaterial({ color: C.cream, roughness: 0.6, transparent: true, opacity: 0 });
  const rayGeo = new THREE.ConeGeometry(0.07, 0.66, 4); rayGeo.translate(0, 0.33, 0);
  for (let i = 0; i < 8; i++) {
    const pivot = new THREE.Group(); pivot.rotation.z = (-i * Math.PI) / 4; atom.add(pivot);
    const m = new THREE.Mesh(rayGeo, rayMat); m.position.y = 0.54; pivot.add(m); rays.push(m);
  }

  const TILT = Math.acos(72 / 230);
  const rings = [];
  for (let k = 0; k < 3; k++) {
    const outer = new THREE.Group(); atom.add(outer);
    const inner = new THREE.Group(); outer.add(inner);
    const mat = new THREE.MeshStandardMaterial({ color: C.cream, roughness: 0.5, metalness: 0.15, transparent: true, opacity: 0 });
    inner.add(new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.028, 10, 160), mat));
    const eMatA = new THREE.MeshStandardMaterial({ color: C.copper, roughness: 0.4, emissive: new THREE.Color(C.copper), emissiveIntensity: 0.35, transparent: true, opacity: 0 });
    const eMatB = new THREE.MeshStandardMaterial({ color: C.teal, roughness: 0.45, transparent: true, opacity: 0 });
    const eA = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), eMatA);
    const eB = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), eMatB);
    inner.add(eA, eB);
    rings.push({ outer, inner, mats: [mat, eMatA, eMatB], eA, eB, base: (-k * Math.PI) / 3 });
  }

  // ---------- Control console ----------
  const shape = new THREE.Shape(); const cw = 5.6, ch = 1.1, cr = 0.55;
  shape.moveTo(-cw / 2 + cr, -ch / 2); shape.lineTo(cw / 2 - cr, -ch / 2); shape.absarc(cw / 2 - cr, 0, cr, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-cw / 2 + cr, ch / 2); shape.absarc(-cw / 2 + cr, 0, cr, Math.PI / 2, (3 * Math.PI) / 2, false);
  const consoleGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 32 });
  const consoleMesh = new THREE.Mesh(consoleGeo, new THREE.MeshStandardMaterial({ color: C.slate, roughness: 0.65, metalness: 0.2 }));
  consoleMesh.position.copy(P(920, 615, 0)); scene.add(consoleMesh);

  const toggles = [];
  const capGeo = new THREE.CapsuleGeometry(0.14, 0.36, 6, 16);
  const creamMat = new THREE.MeshStandardMaterial({ color: C.cream, roughness: 0.55 });
  const knobMat = new THREE.MeshStandardMaterial({ color: C.copper, roughness: 0.4, emissive: new THREE.Color(C.copper), emissiveIntensity: 0.25 });
  for (const px of [720, 780, 840]) {
    const g = new THREE.Group(); g.position.copy(P(px, 615, 0.42)); scene.add(g);
    const body = new THREE.Mesh(capGeo, creamMat); body.scale.z = 0.5; g.add(body);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), knobMat); knob.position.set(0, -0.14, 0.06); g.add(knob);
    toggles.push(knob);
  }

  const gauge = new THREE.Group(); gauge.position.copy(P(1000, 615, 0.36)); scene.add(gauge);
  gauge.add(new THREE.Mesh(new THREE.CircleGeometry(0.4, 48), creamMat));
  const a0 = (-18.4 * Math.PI) / 180, a1 = (198.4 * Math.PI) / 180, arcPts = [];
  for (let i = 0; i <= 40; i++) { const a = a0 + ((a1 - a0) * i) / 40; arcPts.push(new THREE.Vector3(0.31 * Math.cos(a), 0.31 * Math.sin(a), 0.02)); }
  const arcGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts), 64, 0.03, 6, false);
  const arc = { mesh: new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: C.teal })), geo: arcGeo, segs: 64, radial: 6 };
  gauge.add(arc.mesh);
  const needlePivot = new THREE.Group(); needlePivot.position.z = 0.05; gauge.add(needlePivot);
  const needleGeo = new THREE.BoxGeometry(0.33, 0.05, 0.02); needleGeo.translate(0.165, 0, 0);
  needlePivot.add(new THREE.Mesh(needleGeo, new THREE.MeshBasicMaterial({ color: C.copper })));
  const hub = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), new THREE.MeshBasicMaterial({ color: C.slate })); hub.position.z = 0.07; gauge.add(hub);

  const lampMat = new THREE.MeshStandardMaterial({ color: C.slate, roughness: 0.35, emissive: new THREE.Color(C.copper), emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 20), lampMat); lamp.position.copy(P(1120, 615, 0.36)); scene.add(lamp);
  const lampHalo = glowSprite(copperGlow); lampHalo.position.copy(P(1120, 615, 0.5)); scene.add(lampHalo);

  // ---------- Connections: emissive wiring and the teal feed cable ----------
  const wireMat = new THREE.MeshBasicMaterial({ color: C.cream });
  const wires = [
    tubeFromPixels([[785, 489], [796, 525], [830, 548], [840, 566, 0.2]], 0.02, wireMat),
    tubeFromPixels([[1015, 489], [1032, 522], [1006, 548], [1000, 566, 0.2]], 0.02, wireMat),
    tubeFromPixels([[1130, 290], [1188, 390], [1172, 510], [1124, 566, 0.2]], 0.02, wireMat),
  ];
  wires.forEach((w) => scene.add(w.mesh));
  const cableMat = new THREE.MeshStandardMaterial({ color: C.teal, roughness: 0.5, emissive: new THREE.Color(C.teal), emissiveIntensity: 0.25 });
  const cable = tubeFromPixels([[60, 590], [300, 508], [520, 532], [655, 600, 0.15]], 0.06, cableMat, 120);
  scene.add(cable.mesh);
  const pulses = [...wires, cable].map(() => { const s = glowSprite(creamGlow); s.scale.setScalar(0.5); scene.add(s); return s; });

  const state = { nuc: 0, ring0: 0, ring1: 0, ring2: 0, rays: 0, wire0: 0, wire1: 0, wire2: 0, cable: 0, tog0: 0, tog1: 0, tog2: 0, arc: 0, needle: 0, lamp: 0, pulse: 0 };
  const slate = new THREE.Color(C.slate), copper = new THREE.Color(C.copper);
  const NEEDLE_REST = a1, NEEDLE_ON = (48.7 * Math.PI) / 180;

  function draw() {
    const s = state;
    nucleus.scale.setScalar(Math.max(0.001, s.nuc));
    nucMat.emissiveIntensity = 0.12 + 0.4 * clamp(s.nuc);
    nucHalo.material.opacity = 0.6 * clamp(s.nuc); nucHalo.scale.setScalar(1.2 + 1.8 * clamp(s.nuc));
    nucLight.intensity = 5 * clamp(s.nuc);
    rays.forEach((m) => { m.scale.set(1, Math.max(0.001, s.rays), 1); });
    rayMat.opacity = clamp(s.rays * 1.5);
    rings.forEach((r, k) => {
      const p = s['ring' + k];
      r.outer.visible = p > 0.002;
      r.outer.rotation.z = r.base - (1 - p) * 0.9;
      r.inner.rotation.x = p * TILT;
      r.outer.scale.setScalar(0.55 + 0.45 * p);
      r.mats.forEach((m) => { m.opacity = clamp(p * 1.6); });
      const th = -(1 - p) * 2.4;
      r.eA.position.set(2.3 * Math.cos(th), 2.3 * Math.sin(th), 0);
      r.eB.position.set(2.3 * Math.cos(th + Math.PI), 2.3 * Math.sin(th + Math.PI), 0);
    });
    wires.forEach((w, i) => setDraw(w, s['wire' + i]));
    setDraw(cable, s.cable);
    toggles.forEach((k, i) => { k.position.y = -0.14 + 0.28 * s['tog' + i]; });
    setDraw(arc, s.arc);
    needlePivot.rotation.z = NEEDLE_REST + (NEEDLE_ON - NEEDLE_REST) * s.needle;
    lampMat.color.lerpColors(slate, copper, clamp(s.lamp));
    lampMat.emissiveIntensity = 1.3 * clamp(s.lamp);
    lampHalo.material.opacity = 0.75 * clamp(s.lamp); lampHalo.scale.setScalar(0.6 + 0.9 * clamp(s.lamp));
    const pv = s.pulse > 0.001 && s.pulse < 0.999;
    [...wires, cable].forEach((w, i) => {
      const sp = pulses[i]; sp.visible = pv;
      if (pv) { sp.position.copy(w.curve.getPointAt(clamp(s.pulse))); sp.position.z += 0.05; sp.material.opacity = Math.sin(Math.PI * s.pulse); }
    });
    renderer.render(scene, camera);
  }
  draw();
  return { state, draw };
}

if (typeof window !== 'undefined') window.IdeaEngine = { create };
