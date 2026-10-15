// Procedural cutaway lens mechanism (Three.js + PBR materials).
// No clocks, no tickers, no randomness: render(state) is a pure function of
// the GSAP-owned state { sep, cut, az, beam } sampled from timeline time.
import {
  WebGLRenderer, Scene, Color, Group, Mesh, Shape, Path, ExtrudeGeometry,
  SphereGeometry, CylinderGeometry, PlaneGeometry, TubeGeometry, LineCurve3,
  Vector3, Quaternion, Plane, MeshPhysicalMaterial, MeshStandardMaterial,
  MeshBasicMaterial, LineBasicMaterial, LineDashedMaterial, BufferGeometry,
  Line, LineLoop, Float32BufferAttribute, CanvasTexture, RepeatWrapping,
  SRGBColorSpace, NoToneMapping, PMREMGenerator, DirectionalLight,
  AmbientLight, DoubleSide,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { W, H, PARTS, partY, makeCamera, placeCamera, projectAnchors } from "./layout.js";

const TOK = {
  background: "#101820",
  foreground: "#EFF4F7",
  steel: "#8196A5",
  glass: "#61D4DC",
  flowBlue: "#628BF4",
  flowWarm: "#EF9F5C",
};

export function createLensScene(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(new Color(TOK.background), 1);

  const scene = new Scene();
  scene.background = new Color(TOK.background); // exact stage token, stationary
  const pmrem = new PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(-4, 7, 5);
  scene.add(key);
  const rim = new DirectionalLight(0xffffff, 0.6);
  rim.position.set(5, 2, -4);
  scene.add(rim);
  scene.add(new AmbientLight(0xffffff, 0.12));

  const camera = makeCamera();

  // Quadrant cutaway: clipIntersection removes only x>c AND z>c.
  const clipX = new Plane(new Vector3(-1, 0, 0), 2.4);
  const clipZ = new Plane(new Vector3(0, 0, -1), 2.4);
  const clips = [clipX, clipZ];

  // ---- materials (cached once) ----
  const steel = new MeshStandardMaterial({ color: TOK.steel, metalness: 0.82, roughness: 0.34, clippingPlanes: clips, clipIntersection: true });
  const steelRing = new MeshStandardMaterial({ color: TOK.foreground, metalness: 0.9, roughness: 0.22, clippingPlanes: clips, clipIntersection: true });
  const steelDark = new MeshStandardMaterial({ color: TOK.steel, metalness: 0.6, roughness: 0.55, clippingPlanes: clips, clipIntersection: true });
  // Glass: MeshPhysicalMaterial transmission (screen-space approximation, not ray traced optics)
  const glass = new MeshPhysicalMaterial({
    color: TOK.glass, metalness: 0, roughness: 0.06, transmission: 0.62, thickness: 0.35, ior: 1.45,
    clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.92,
    emissive: TOK.glass, emissiveIntensity: 0.12, clippingPlanes: clips, clipIntersection: true,
  });
  const sphereGlass = glass.clone();
  sphereGlass.clippingPlanes = null;
  sphereGlass.emissiveIntensity = 0.22;
  sphereGlass.thickness = 0.9;

  // Section-hatch texture for steel cut faces (drawn once, deterministic).
  const hc = document.createElement("canvas");
  hc.width = hc.height = 64;
  const g = hc.getContext("2d");
  g.fillStyle = TOK.background;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = TOK.steel;
  g.lineWidth = 4;
  for (let k = -64; k <= 128; k += 16) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); }
  const hatch = new CanvasTexture(hc);
  hatch.colorSpace = SRGBColorSpace;
  hatch.wrapS = hatch.wrapT = RepeatWrapping;
  const capSteel = new MeshBasicMaterial({ map: hatch, side: DoubleSide, toneMapped: false });
  const capGlass = new MeshBasicMaterial({ color: TOK.glass, side: DoubleSide, toneMapped: false });
  const capEdge = new LineBasicMaterial({ color: TOK.foreground, toneMapped: false });

  const unitPlane = new PlaneGeometry(1, 1);
  const unitLoop = new BufferGeometry();
  unitLoop.setAttribute("position", new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));

  // Each clipped solid of revolution registers its cut-face caps.
  const solids = [];
  function annulus(parent, rIn, rOut, y0, y1, mat, capMat) {
    const shape = new Shape();
    shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
    if (rIn > 0) { const hole = new Path(); hole.absarc(0, 0, rIn, 0, Math.PI * 2, true); shape.holes.push(hole); }
    const geo = new ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 72 });
    geo.rotateX(-Math.PI / 2); // extrude along +Y
    geo.translate(0, y0, 0);
    const mesh = new Mesh(geo, mat);
    parent.add(mesh);
    const caps = [0, 1].map((axis) => {
      const m = new Mesh(unitPlane, capMat);
      m.rotation.y = axis === 0 ? Math.PI / 2 : 0; // face +X or +Z
      const edge = new LineLoop(unitLoop, capEdge);
      m.add(edge);
      m.renderOrder = 2;
      parent.add(m);
      return m;
    });
    solids.push({ rIn, rOut, y0, y1, caps, capMat });
    return mesh;
  }

  // Explicit cut-face geometry so the section never shows hollow faces.
  function updateCaps(c) {
    for (const s of solids) {
      const lo = Math.max(c, Math.sqrt(Math.max(0, s.rIn * s.rIn - c * c)));
      const hi = Math.sqrt(Math.max(0, s.rOut * s.rOut - c * c));
      const len = hi - lo;
      const show = c < s.rOut && len > 1e-3;
      const h = s.y1 - s.y0;
      const mid = (lo + hi) / 2;
      s.caps.forEach((m, axis) => {
        m.visible = show;
        if (!show) return;
        m.scale.set(len, h, 1);
        if (axis === 0) m.position.set(c + 0.0015, s.y0 + h / 2, mid);
        else m.position.set(mid, s.y0 + h / 2, c + 0.0015);
      });
    }
    hatch.repeat.set(3, 1);
  }

  // ---- deterministic part hierarchy ----
  const root = new Group();
  scene.add(root);
  const groups = PARTS.map(() => { const gr = new Group(); root.add(gr); return gr; });

  // 01 SPARK glass core (uncut idea sphere with bright core)
  const sphere = new Mesh(new SphereGeometry(0.48, 64, 40), sphereGlass);
  groups[0].add(sphere);
  const core = new Mesh(new SphereGeometry(0.12, 24, 16), new MeshBasicMaterial({ color: TOK.foreground, toneMapped: false }));
  groups[0].add(core);

  // 02 FOCUS lens ring
  annulus(groups[1], 0.52, 1.0, -0.11, 0.11, steel, capSteel);
  annulus(groups[1], 0, 0.515, -0.06, 0.06, glass, capGlass);
  annulus(groups[1], 0.4, 0.515, 0.06, 0.1, steelRing, capSteel); // retaining ring

  // 03 ROUTER steel housing + lens + aperture
  annulus(groups[2], 0.62, 1.35, -0.21, 0.21, steel, capSteel);
  annulus(groups[2], 0, 0.615, 0.06, 0.15, glass, capGlass);
  annulus(groups[2], 0.5, 0.615, 0.15, 0.19, steelRing, capSteel); // retaining ring
  annulus(groups[2], 0.16, 0.615, -0.08, -0.05, steelDark, capSteel); // aperture stop
  const APERTURE_Y = -0.065;

  // 04 NETWORK node plate
  annulus(groups[3], 0.38, 1.65, -0.175, 0.175, steel, capSteel);
  annulus(groups[3], 0, 0.375, -0.06, 0.06, glass, capGlass);
  const nodeAngles = [110, 175, 250, 330].map((d) => (d * Math.PI) / 180); // outside the cut quadrant
  const nodeR = 1.15;
  const nodeTop = 0.175 + 0.1;
  const nodeGeo = new CylinderGeometry(0.12, 0.12, 0.1, 40);
  const nodeMats = [
    new MeshStandardMaterial({ color: TOK.steel, metalness: 0.8, roughness: 0.3 }),
    new MeshBasicMaterial({ color: TOK.foreground, toneMapped: false }),
    new MeshStandardMaterial({ color: TOK.steel, metalness: 0.8, roughness: 0.3 }),
  ];
  const nodes = nodeAngles.map((a) => {
    const n = new Mesh(nodeGeo, nodeMats);
    n.position.set(Math.cos(a) * nodeR, 0.175 + 0.05, Math.sin(a) * nodeR);
    groups[3].add(n);
    return n;
  });
  const warmMat = new MeshBasicMaterial({ color: TOK.flowWarm, toneMapped: false });
  const blueMat = new MeshBasicMaterial({ color: TOK.flowBlue, toneMapped: false });
  for (let k = 0; k < nodes.length - 1; k++) {
    const a = nodes[k].position.clone().setY(0.2);
    const b = nodes[k + 1].position.clone().setY(0.2);
    groups[3].add(new Mesh(new TubeGeometry(new LineCurve3(a, b), 1, 0.02, 8, false), warmMat));
  }

  // Dashed optical axis (stationary world reference)
  const axisGeo = new BufferGeometry().setFromPoints([new Vector3(0, -2.6, 0), new Vector3(0, 3.0, 0)]);
  const axis = new Line(axisGeo, new LineDashedMaterial({ color: TOK.steel, dashSize: 0.12, gapSize: 0.08 }));
  axis.computeLineDistances();
  scene.add(axis);

  // ---- internal light path: discrete TubeGeometry segments ----
  const unitTube = new TubeGeometry(new LineCurve3(new Vector3(0, 0, 0), new Vector3(0, 1, 0)), 1, 0.038, 12, false);
  const blueSegs = [0, 1, 2].map(() => { const m = new Mesh(unitTube, blueMat); m.renderOrder = 1; scene.add(m); return m; });
  const warmSegs = nodes.map(() => { const m = new Mesh(unitTube, warmMat); m.renderOrder = 1; scene.add(m); return m; });
  const focus = new Mesh(new SphereGeometry(0.075, 20, 14), warmMat);
  scene.add(focus);

  const UP = new Vector3(0, 1, 0);
  const _d = new Vector3();
  const _q = new Quaternion();
  function placeSeg(m, a, b, frac) {
    _d.subVectors(b, a);
    const len = _d.length();
    if (frac <= 0.0005 || len < 1e-4) { m.visible = false; return; }
    m.visible = true;
    _q.setFromUnitVectors(UP, _d.normalize());
    m.quaternion.copy(_q);
    m.position.copy(a);
    m.scale.set(1, len * Math.min(1, frac), 1);
  }

  const tmpA = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const tmpN = new Vector3();

  function render(state) {
    // part offsets along the optical axis
    for (let i = 0; i < groups.length; i++) groups[i].position.set(0, partY(i, state.sep), 0);
    // cutaway planes (world space)
    clipX.constant = state.cut;
    clipZ.constant = state.cut;
    updateCaps(state.cut);

    // light path chain: spark -> focus lens -> router lens -> aperture (focus)
    tmpA[0].set(0, groups[0].position.y, 0);
    tmpA[1].set(0, groups[1].position.y, 0);
    tmpA[2].set(0, groups[2].position.y + 0.1, 0);
    tmpA[3].set(0, groups[2].position.y + APERTURE_Y, 0);
    const lens = [0, 1, 2].map((k) => tmpA[k].distanceTo(tmpA[k + 1]));
    const total = lens[0] + lens[1] + lens[2];
    const pBlue = Math.min(1, state.beam / 0.6) * total;
    let acc = 0;
    for (let k = 0; k < 3; k++) {
      const frac = lens[k] > 0 ? (pBlue - acc) / lens[k] : 0;
      placeSeg(blueSegs[k], tmpA[k], tmpA[k + 1], state.sep > 0.2 ? frac : 0);
      acc += lens[k];
    }
    const pWarm = Math.max(0, (state.beam - 0.6) / 0.4);
    warmSegs.forEach((m, k) => {
      tmpN.copy(nodes[k].position).add(groups[3].position);
      tmpN.y = groups[3].position.y + nodeTop - 0.02;
      placeSeg(m, tmpA[3], tmpN, state.sep > 0.2 ? pWarm : 0);
    });
    const fs = Math.min(1, Math.max(0, (state.beam - 0.5) / 0.15));
    focus.visible = fs > 0.001;
    focus.position.copy(tmpA[3]);
    focus.scale.setScalar(Math.max(0.001, fs));

    placeCamera(camera, state);
    renderer.render(scene, camera);
    return projectAnchors(camera, state);
  }

  return { render, tokens: TOK };
}

if (typeof window !== "undefined") window.LensScene = { createLensScene, PARTS };
