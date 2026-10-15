// Puppet Animation — digital marionette miniature stage (Three.js).
// This is NOT physical puppet photography: a procedural wooden rig on a
// miniature set, posed by a GSAP timeline and exposed "on twos" (held poses).
// All state is derived from the pose object passed to apply(); no clocks,
// no autonomous loops, no unseeded randomness.
import * as THREE from 'three';

export const PALETTE = {
  backdropTop: '#14273A',
  backdropHorizon: '#2D5560',
  hills: '#1C3940',
  hillsFar: '#244750',
  velvet: '#6A1E27',
  floorOak: '#9A7250',
  floorSeam: '#5E412B',
  maple: '#C99B63',
  walnut: '#5B3D26',
  string: '#DCD4C3',
  yarn: '#D2452F',
  brass: '#B8893A',
  bulbWarm: '#FFD27A',
  houses: ['#A65A42', '#C79A3D', '#6E8B69', '#5D7192'],
  roof: '#3B2F2A',
  windowOff: '#2A2420',
  text: '#F3EAD7',
};

// Seeded hash for deterministic procedural texture detail.
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function backdropTexture() {
  return canvasTex(2048, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, PALETTE.backdropTop);
    grd.addColorStop(0.72, PALETTE.backdropHorizon);
    grd.addColorStop(1, PALETTE.backdropHorizon);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // painted brush streaks (scenic-paint texture), seeded
    for (let i = 0; i < 220; i++) {
      const y = hash(i) * h, x = hash(i + 50) * w;
      g.strokeStyle = `rgba(255,255,255,${0.012 + hash(i + 9) * 0.02})`;
      g.lineWidth = 6 + hash(i + 3) * 18;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 120 + hash(i + 7) * 200, y + (hash(i + 2) - 0.5) * 20); g.stroke();
    }
    // sparse painted stars kept low-contrast and away from the title band
    for (let i = 0; i < 46; i++) {
      const x = hash(i + 400) * w, y = 330 + hash(i + 600) * 280;
      g.fillStyle = `rgba(243,234,215,${0.25 + hash(i + 800) * 0.3})`;
      g.beginPath(); g.arc(x, y, 1.6 + hash(i + 900) * 2.2, 0, Math.PI * 2); g.fill();
    }
    const hills = (base, amp, col, seed) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) {
        const y = base - amp * (0.55 * Math.sin(x / 260 + seed) + 0.3 * Math.sin(x / 97 + seed * 2) + 0.15 * Math.sin(x / 41 + seed));
        g.lineTo(x, y);
      }
      g.lineTo(w, h); g.closePath(); g.fill();
    };
    hills(780, 60, PALETTE.hillsFar, 1.3);
    hills(860, 50, PALETTE.hills, 4.1);
  });
}

function plankTexture() {
  const t = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = PALETTE.floorOak; g.fillRect(0, 0, w, h);
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const tone = (hash(r + 20) - 0.5) * 22;
      g.fillStyle = `rgba(${tone > 0 ? '255,235,200' : '40,20,5'},${Math.abs(tone) / 160})`;
      g.fillRect(0, r * rh, w, rh);
      for (let k = 0; k < 14; k++) {
        const y = r * rh + hash(r * 31 + k) * rh;
        g.strokeStyle = `rgba(70,42,20,${0.08 + hash(r * 7 + k) * 0.1})`;
        g.lineWidth = 1 + hash(k + r) * 1.5;
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 90 + k + r) * 2.5);
        g.stroke();
      }
      g.fillStyle = PALETTE.floorSeam; g.fillRect(0, r * rh, w, 3);
      const off = hash(r + 70) * w;
      g.fillRect(off, r * rh, 3, rh);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1.4);
  return t;
}

function grainTexture(base) {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 40; k++) {
      const x = hash(k + 5) * w;
      g.strokeStyle = `rgba(90,55,25,${0.06 + hash(k) * 0.1})`;
      g.lineWidth = 1 + hash(k + 1) * 2;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y / 30 + k) * 4, y);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function velvetGeometry(w, h, folds, amp, vertical) {
  const geo = new THREE.PlaneGeometry(w, h, vertical ? folds * 8 : 4, vertical ? 4 : folds * 8);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = vertical ? p.getX(i) / w : p.getY(i) / h;
    p.setZ(i, Math.sin(u * folds * Math.PI * 2) * amp);
  }
  geo.computeVertexNormals();
  return geo;
}

// Partial curve for a drawing yarn thread.
class PartialCurve extends THREE.Curve {
  constructor(base, p) { super(); this.base = base; this.p = p; }
  getPoint(u, target = new THREE.Vector3()) { return this.base.getPoint(u * this.p, target); }
}

export function createScene(canvas) {
  const W = 1280, H = 720;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.backdropTop);
  const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
  camera.position.set(0, 2.3, 9.5);
  camera.lookAt(0, 2.0, 0);

  // ---- lighting: warm key spot, cool fill, footlight rim ----
  scene.add(new THREE.HemisphereLight('#9FB6C8', '#3A2A1E', 0.55));
  const key = new THREE.SpotLight('#FFE6C2', 220, 30, 0.62, 0.55, 1.6);
  key.position.set(-4.5, 8.5, 6.5);
  key.target.position.set(0.2, 0.8, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const foot = new THREE.DirectionalLight('#FFC88A', 0.35);
  foot.position.set(0, 0.4, 8);
  scene.add(foot);

  // ---- set: backdrop, floor, curtains ----
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshStandardMaterial({ map: backdropTexture(), roughness: 0.95 }));
  backdrop.position.set(0, 3.0, -3);
  backdrop.receiveShadow = true;
  scene.add(backdrop);

  const floorMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.78 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 5.4), floorMat);
  floor.position.set(0, -0.15, -0.3);
  floor.receiveShadow = true;
  scene.add(floor);

  const velvetMat = new THREE.MeshStandardMaterial({ color: PALETTE.velvet, roughness: 0.92, side: THREE.DoubleSide });
  const curtainL = new THREE.Mesh(velvetGeometry(2.2, 7, 4, 0.07, true), velvetMat);
  curtainL.position.set(-4.5, 2.2, 2.5);
  const curtainR = curtainL.clone(); curtainR.position.x = 4.5;
  const valance = new THREE.Mesh(velvetGeometry(12, 0.9, 1, 0.0, true), velvetMat);
  const valGeo = velvetGeometry(12, 0.9, 18, 0.05, true);
  valance.geometry = valGeo;
  valance.position.set(0, 4.42, 2.5);
  scene.add(curtainL, curtainR, valance);

  // ---- materials ----
  const maple = new THREE.MeshStandardMaterial({ color: '#ffffff', map: grainTexture(PALETTE.maple), roughness: 0.55 });
  const walnut = new THREE.MeshStandardMaterial({ color: PALETTE.walnut, roughness: 0.45 });
  const cast = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const capsule = (r, len) => cast(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), maple));
  const joint = (r) => cast(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), walnut));

  // ---- marionette rig ----
  const THIGH = 0.5, SHIN = 0.5, FOOT_H = 0.07, UPPER = 0.42, FORE = 0.4;
  const rig = {};
  const root = new THREE.Group();
  root.position.set(-3.2, 0, 0.2);
  scene.add(root);
  const pelvis = cast(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), maple));
  root.add(pelvis);
  rig.root = root;

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.12 * s, -0.06, 0); root.add(hip);
    hip.add(joint(0.075));
    const thigh = capsule(0.07, THIGH - 0.14); thigh.position.y = -THIGH / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee);
    knee.add(joint(0.07));
    const shin = capsule(0.062, SHIN - 0.13); shin.position.y = -SHIN / 2; knee.add(shin);
    const ankle = new THREE.Group(); ankle.position.y = -SHIN; knee.add(ankle);
    const foot = cast(new THREE.Mesh(new THREE.BoxGeometry(0.16, FOOT_H, 0.3), walnut));
    foot.position.set(0, -FOOT_H / 2 + 0.005, 0.06); ankle.add(foot);
    legs.push({ hip, knee, ankle, kneeAnchor: knee });
  }
  const spine = new THREE.Group(); spine.position.y = 0.06; root.add(spine);
  const torso = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 6, 16), maple));
  torso.scale.set(1.15, 1, 0.75); torso.position.y = 0.38; spine.add(torso);
  const chest = new THREE.Group(); chest.position.y = 0.66; spine.add(chest);
  const neck = new THREE.Group(); neck.position.y = 0.1; chest.add(neck);
  const neckRod = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 10), walnut)); neckRod.position.y = 0.0; neck.add(neckRod);
  const head = new THREE.Group(); head.position.y = 0.26; neck.add(head);
  const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(0.24, 28, 20), maple)); skull.scale.set(0.95, 1.05, 1); head.add(skull);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1E1712', roughness: 0.3 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), eyeMat); e.position.set(0.085 * s, 0.03, 0.215); head.add(e); }
  const nose = cast(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), maple)); nose.position.set(0, -0.03, 0.24); head.add(nose);
  const headTop = new THREE.Object3D(); headTop.position.y = 0.25; head.add(headTop);

  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.27 * s, -0.02, 0); chest.add(sh);
    sh.add(joint(0.07));
    const up = capsule(0.055, UPPER - 0.11); up.position.y = -UPPER / 2; sh.add(up);
    const el = new THREE.Group(); el.position.y = -UPPER; sh.add(el);
    el.add(joint(0.06));
    const fo = capsule(0.05, FORE - 0.1); fo.position.y = -FORE / 2; el.add(fo);
    const hand = new THREE.Group(); hand.position.y = -FORE; el.add(hand);
    const palm = joint(0.065); palm.material = maple; hand.add(palm);
    arms.push({ sh, el, hand });
  }

  // ---- the idea: a brass-capped glass bulb held in the +x hand ----
  const bulb = new THREE.Group();
  bulb.position.y = 0.04;
  arms[1].hand.add(bulb);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#F4EBD8', roughness: 0.25, emissive: PALETTE.bulbWarm, emissiveIntensity: 0, transparent: true, opacity: 0.92 });
  const glass = cast(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), glassMat));
  glass.position.y = 0.2; bulb.add(glass);
  const cap = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.12, 16), new THREE.MeshStandardMaterial({ color: PALETTE.brass, metalness: 0.75, roughness: 0.35 })));
  cap.position.y = 0.02; bulb.add(cap);
  const bulbLight = new THREE.PointLight(PALETTE.bulbWarm, 0, 7, 1.6);
  glass.add(bulbLight);
  const bulbCore = new THREE.Object3D(); glass.add(bulbCore);

  // ---- miniature houses (painted wood), hinged at their back base edge ----
  const housesX = [0.25, 1.5, 2.75, 3.85];
  const houseScale = [1.0, 1.2, 0.9, 1.05];
  const houses = housesX.map((x, i) => {
    const hinge = new THREE.Group();
    const s = houseScale[i];
    hinge.position.set(x, 0, -0.15 - 0.3 * s);
    scene.add(hinge);
    const body = new THREE.Group(); body.scale.setScalar(s); body.position.z = 0.3 * s; hinge.add(body);
    const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.houses[i], roughness: 0.8 });
    const box = cast(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.56, 0.6), wallMat)); box.position.y = 0.28; body.add(box);
    const roofShape = new THREE.Shape(); roofShape.moveTo(-0.44, 0); roofShape.lineTo(0, 0.38); roofShape.lineTo(0.44, 0); roofShape.closePath();
    const roof = cast(new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 0.66, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: PALETTE.roof, roughness: 0.7 })));
    roof.position.set(0, 0.56, -0.33); body.add(roof);
    const winMat = new THREE.MeshStandardMaterial({ color: PALETTE.windowOff, emissive: PALETTE.bulbWarm, emissiveIntensity: 0, roughness: 0.5 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.22), winMat); win.position.set(0, 0.3, 0.301); body.add(win);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.2), new THREE.MeshStandardMaterial({ color: PALETTE.roof })); door.position.set(0.2, 0.1, 0.302); body.add(door);
    const apex = new THREE.Object3D(); apex.position.set(0, 0.94, 0.0); body.add(apex);
    return { hinge, winMat, apex, s };
  });

  // ---- marionette strings to a control bar above the valance ----
  const stringMat = new THREE.LineBasicMaterial({ color: PALETTE.string, transparent: true, opacity: 0.6 });
  const stringAnchors = [headTop, arms[0].hand, arms[1].hand, legs[0].knee, legs[1].knee];
  const stringOffsets = [[0, 0], [-0.55, 0.05], [0.55, 0.05], [-0.3, 0.25], [0.3, 0.25]];
  const strings = stringAnchors.map(() => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(g, stringMat); l.frustumCulled = false; scene.add(l); return l;
  });

  // ---- yarn threads ----
  const yarnMat = new THREE.MeshStandardMaterial({ color: PALETTE.yarn, roughness: 0.85 });
  const threads = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), yarnMat); m.castShadow = true; m.visible = false; scene.add(m); return m; });
  const knots = [0, 1, 2, 3].map(() => { const k = cast(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), yarnMat)); k.visible = false; scene.add(k); return k; });

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

  function apply(p) {
    // Legs: equal thigh/shin lengths keep feet planted (2-bone constraint).
    const a = p.crouch;
    root.position.y = FOOT_H + 0.06 + (THIGH + SHIN) * Math.cos(a);
    root.rotation.y = p.facing;
    legs.forEach((L, i) => {
      const spread = i === 0 ? -0.04 : 0.04;
      L.hip.rotation.set(-a, 0, spread);
      L.knee.rotation.set(2 * a, 0, 0);
      L.ankle.rotation.set(-a, 0, -spread);
    });
    spine.rotation.x = p.lean;
    chest.rotation.z = p.chestTilt;
    head.rotation.set(p.headPitch, p.headYaw, p.headTilt);
    // raised arm (+x side) carries the idea
    arms[1].sh.rotation.set(-p.armForward, 0, p.armRaise);
    arms[1].el.rotation.set(0, 0, p.elbow);
    arms[1].hand.rotation.set(0, 0, -p.armRaise - p.elbow + 0.1);
    // free arm
    arms[0].sh.rotation.set(-0.15 + p.lean * 0.5, 0, -p.freeArm);
    arms[0].el.rotation.set(-0.35, 0, 0);

    // bulb
    glassMat.emissiveIntensity = 2.4 * p.glow;
    bulbLight.intensity = 10 * p.glow;
    bulb.scale.setScalar(p.bulbScale);

    // houses: hinge from lying on their backs to upright
    houses.forEach((h, i) => {
      h.hinge.rotation.x = -Math.PI / 2 * (1 - p.house[i]);
      h.winMat.emissiveIntensity = 1.8 * p.win[i];
      h.winMat.color.set(p.win[i] > 0.5 ? '#6A5530' : PALETTE.windowOff);
    });

    scene.updateMatrixWorld(true);

    // strings follow body anchors from a swaying control bar
    stringAnchors.forEach((obj, i) => {
      obj.getWorldPosition(v1);
      const o = stringOffsets[i];
      const barX = root.position.x + 0.15 + p.barSway + o[0] * 0.6;
      const pos = strings[i].geometry.attributes.position;
      pos.setXYZ(0, barX, 5.4, root.position.z + o[1]);
      pos.setXYZ(1, v1.x, v1.y, v1.z);
      pos.needsUpdate = true;
    });

    // threads: bulb -> houses 1..3, house 3 -> house 4
    glass.getWorldPosition(v2);
    threads.forEach((m, i) => {
      const prog = p.thread[i];
      if (prog <= 0.001) { m.visible = false; knots[i].visible = false; return; }
      const from = i < 3 ? v2.clone() : null;
      // final upright apex position for each target (independent of hinge pose)
      const tgt = houses[i < 3 ? i : 3];
      const start = i < 3 ? from : new THREE.Vector3(housesX[2], 0.94 * houseScale[2], -0.15);
      const end = new THREE.Vector3(housesX[i < 3 ? i : 3], 0.94 * tgt.s, -0.15);
      const mid = start.clone().lerp(end, 0.5);
      mid.y = Math.max(start.y, end.y) + (i < 3 ? 0.35 + i * 0.12 : 0.35);
      const base = new THREE.CatmullRomCurve3([start, mid, end]);
      const curve = new PartialCurve(base, prog);
      m.geometry.dispose();
      m.geometry = new THREE.TubeGeometry(curve, 72, 0.022, 6, false);
      m.visible = true;
      knots[i].visible = prog >= 0.999;
      knots[i].position.copy(end);
    });

    renderer.render(scene, camera);
  }

  return { apply, renderer };
}
