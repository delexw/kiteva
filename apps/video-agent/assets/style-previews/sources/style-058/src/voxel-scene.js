// Voxel Art preview scene (style-058): an idea becomes a connected system.
// Three.js renders every block as an instance of one unit BoxGeometry through a
// single InstancedMesh. Block color, visibility and assembly transform are pure
// functions of composition time t, so any frame can be drawn in any order.
import {
  ColorManagement, LinearSRGBColorSpace, WebGLRenderer, Scene, OrthographicCamera,
  BoxGeometry, ShaderMaterial, InstancedMesh, InstancedBufferAttribute, Matrix4,
  Vector3, Color,
} from 'three';

ColorManagement.enabled = false; // palette hex values pass through unchanged

export const PALETTE = {
  stage: '#30444C',   // foreground token used as the night stage colour
  cream: '#EEE9DB',
  teal: '#63928D',
  terracotta: '#C0845D',
};

const VOXEL = 1;           // one block size for every cube
const DROP = 2.6;          // blocks fall this many voxels into their slot
const DROP_DUR = 0.38;
const SEED_START = 0.1;
const BUILD_START = 0.42;
const BUILD_STEP = 0.082;
const PULSE_START = 1.6;
const PULSE_STEP = 0.055;

// ---- block layout (grid cells, y = 0 sits on top of the plateau) ----
const T = 'terracotta', C = 'cream', G = 'teal';
const build = [
  [0, 0, 0, T],                                   // the seed idea
  [0, 1, 0, T], [0, 2, 0, T], [0, 3, 0, C],       // left tower
  [0, 0, -1, T], [0, 1, -1, T], [0, 2, -1, C],
  [-1, 0, 0, T], [-1, 1, 0, T], [-1, 2, 0, C],
  [1, 0, 0, G], [2, 0, 0, G], [3, 0, 0, G], [4, 0, 0, G], [5, 0, 0, G], [6, 0, 0, G], // path
  [3, 1, 0, G],                                   // first stack
  [4, 0, 1, G], [4, 0, 2, G], [4, 1, 2, G],       // branch + stack
  [6, 0, -1, G], [6, 0, -2, G], [6, 0, -3, G], [6, 1, -2, G], // turn + stack
  [6, 0, -4, T], [6, 1, -4, T], [6, 2, -4, C],    // right tower
].map(([x, y, z, c]) => ({ x, y, z, color: c, kind: 'build' }));

const removed = new Set(['-2,2', '-2,1', '-1,2', '7,-5', '7,-4', '6,-5', '7,2', '-2,-5']);
const plateau = [];
for (let x = -2; x <= 7; x++) for (let z = -5; z <= 2; z++) {
  if (!removed.has(x + ',' + z)) plateau.push({ x, y: -1, z, color: 'stage', kind: 'ground' });
}

// Graph distance from the seed through face-adjacent build blocks sets both
// the assembly order and the arrival time of the connecting light pulse.
const key = (b) => b.x + ',' + b.y + ',' + b.z;
const byKey = new Map(build.map((b) => [key(b), b]));
build[0].dist = 0;
const queue = [build[0]];
while (queue.length) {
  const b = queue.shift();
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    const n = byKey.get((b.x + dx) + ',' + (b.y + dy) + ',' + (b.z + dz));
    if (n && n.dist === undefined) { n.dist = b.dist + 1; queue.push(n); }
  }
}
for (const b of build) {
  b.start = b.dist === 0 ? SEED_START : BUILD_START + (b.dist - 1) * BUILD_STEP;
  b.pulse = PULSE_START + b.dist * PULSE_STEP;
}
export const BUILD_END = Math.max(...build.map((b) => b.start)) + DROP_DUR;
export const PULSE_END = Math.max(...build.map((b) => b.pulse)) + 0.2;

const blocks = plateau.concat(build);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const backOut = (p, s = 1.2) => { const q = p - 1; return 1 + (s + 1) * q * q * q + s * q * q; };

// Per-block state at composition time t (pure function).
function blockState(b, t) {
  if (b.kind === 'ground') return { visible: true, lift: 0, glow: 0 };
  if (t < b.start) return { visible: false, lift: DROP, glow: 0 };
  const p = clamp01((t - b.start) / DROP_DUR);
  const lift = (1 - backOut(p)) * DROP;
  let glow;
  if (b.dist === 0) {
    // the idea flares on arrival, then settles as a steady lamp
    glow = 0.35 + 0.65 * Math.exp(-Math.pow((t - (SEED_START + 0.3)) / 0.22, 2)) * smooth(SEED_START, SEED_START + 0.2, t);
    glow = Math.max(glow, 0.35 * smooth(SEED_START, SEED_START + 0.25, t));
  } else {
    const d = t - b.pulse;
    glow = 0.22 * smooth(0, 0.16, d) + 0.5 * Math.exp(-Math.pow(d / 0.07, 2));
  }
  return { visible: true, lift, glow };
}

function ideaPower(t) {
  return 0.55 * smooth(SEED_START, SEED_START + 0.3, t) + 0.6 * Math.exp(-Math.pow((t - 0.45) / 0.25, 2)) * smooth(SEED_START, SEED_START + 0.2, t);
}

const vertexShader = /* glsl */`
  attribute float aGlow;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  varying vec3 vBase;
  varying float vGlow;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(m) * normal);
    vUv = uv;
    vBase = instanceColor;
    vGlow = aGlow;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 uLightDir;
  uniform vec3 uEdge;
  uniform vec3 uCream;
  uniform vec3 uWarm;
  uniform vec3 uIdeaPos;
  uniform float uIdeaPower;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  varying vec3 vBase;
  varying float vGlow;
  void main() {
    vec3 n = normalize(vNormalW);
    // controlled key light + ambient: top bright, +z face mid, +x face dark
    float shade = 0.5 + 0.59 * max(dot(n, uLightDir), 0.0);
    shade += 0.1 * max(n.y, 0.0);
    vec3 col = vBase * shade;
    // local warm light pooled around the idea block
    vec3 toIdea = uIdeaPos - vPosW;
    float d2 = dot(toIdea, toIdea);
    float facing = max(dot(n, normalize(toIdea + vec3(0.0, 0.6, 0.0))), 0.0);
    col += uWarm * uIdeaPower * facing * 0.55 / (1.0 + 0.45 * d2);
    // connection glow brightens the block toward cream (top faces most)
    float topw = 0.55 + 0.45 * max(n.y, 0.0);
    col = mix(col, uCream * topw, clamp(vGlow, 0.0, 1.0) * 0.6);
    // crisp block edges on every face (voxel construction lines)
    float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float w = fwidth(e) * 1.6;
    float line = 1.0 - smoothstep(0.018, 0.018 + w, e);
    col = mix(col, uEdge, line * 0.92);
    gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
  }
`;

export function createVoxelScene(canvas, { width = 1280, height = 720, sceneRect = [60, 80, 700, 650] } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(new Color(PALETTE.stage), 1);

  const scene = new Scene();
  const geometry = new BoxGeometry(VOXEL, VOXEL, VOXEL);
  const glowAttr = new InstancedBufferAttribute(new Float32Array(blocks.length), 1);
  geometry.setAttribute('aGlow', glowAttr);

  const edge = new Color(PALETTE.stage).multiplyScalar(0.62);
  const material = new ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uLightDir: { value: new Vector3(-0.35, 1, 0.6).normalize() },
      uEdge: { value: edge },
      uCream: { value: new Color(PALETTE.cream) },
      uWarm: { value: new Color(PALETTE.terracotta) },
      uIdeaPos: { value: new Vector3(0, 0, 0) },
      uIdeaPower: { value: 0 },
    },
  });

  const mesh = new InstancedMesh(geometry, material, blocks.length);
  mesh.frustumCulled = false;
  blocks.forEach((b, i) => mesh.setColorAt(i, new Color(PALETTE[b.color])));
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  // Exact isometric orthographic camera; frustum fitted once to the settled build.
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const target = new Vector3(2.5, 0, -1.5);
  camera.position.copy(target).add(new Vector3(30, 30, 30));
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  const v = new Vector3();
  for (const b of blocks) for (let c = 0; c < 8; c++) {
    v.set(b.x + ((c & 1) ? 0.5 : -0.5), b.y + ((c & 2) ? 0.5 : -0.5), b.z + ((c & 4) ? 0.5 : -0.5));
    v.applyMatrix4(camera.matrixWorldInverse);
    xmin = Math.min(xmin, v.x); xmax = Math.max(xmax, v.x); ymin = Math.min(ymin, v.y); ymax = Math.max(ymax, v.y);
  }
  const [px0, py0, px1, py1] = sceneRect;
  const s = Math.min((px1 - px0) / (xmax - xmin), (py1 - py0) / (ymax - ymin));
  camera.left = (xmin + xmax) / 2 - ((px0 + px1) / 2) / s;
  camera.right = camera.left + width / s;
  camera.top = (ymin + ymax) / 2 + ((py0 + py1) / 2) / s;
  camera.bottom = camera.top - height / s;
  camera.updateProjectionMatrix();

  const m = new Matrix4();
  const hidden = new Matrix4().makeScale(0, 0, 0);

  function draw(t) {
    const time = Math.min(3, Math.max(0, Number(t) || 0));
    blocks.forEach((b, i) => {
      const st = blockState(b, time);
      if (!st.visible) mesh.setMatrixAt(i, hidden);
      else { m.makeTranslation(b.x * VOXEL, (b.y + st.lift) * VOXEL, b.z * VOXEL); mesh.setMatrixAt(i, m); }
      glowAttr.array[i] = st.glow;
    });
    mesh.instanceMatrix.needsUpdate = true;
    glowAttr.needsUpdate = true;
    material.uniforms.uIdeaPower.value = ideaPower(time);
    renderer.render(scene, camera);
  }

  return { draw, blockCount: blocks.length, buildCount: build.length, BUILD_END, PULSE_END };
}

if (typeof window !== 'undefined') window.VoxelScene = { createVoxelScene, PALETTE, BUILD_END, PULSE_END };
