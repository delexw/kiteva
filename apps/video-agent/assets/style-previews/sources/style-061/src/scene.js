// Photorealism (style-061) — caustic_optics refresh.
// "An idea becomes a connected system": a glass sphere (the idea) rolls into a shallow water film on a
// dark slate studio sweep. When it comes to rest, a ripple spreads outward. The ripple front carries
// brushed-metal rods out to the waiting steel nodes.
//
// Stack: WebGLRenderer (SRGB output + ACESFilmic set explicitly), PMREM RoomEnvironment,
// MeshPhysicalMaterial brushed metal (anisotropy), glass (transmission 1, IOR 1.5) and water
// (transmission 1, IOR 1.33, analytic ripple normals), PCF soft shadows, analytic contact shadows,
// EffectComposer -> RenderPass -> BokehPass -> OutputPass.
//
// OPTICS APPROXIMATIONS (not path-traced):
//  * Water caustics on the floor are computed per pixel from the SAME analytic height field that bends
//    the water normals. Intensity = 1/(1 + k·∇²h), sampled where the key-light ray enters the water.
//    Caustics therefore move with the surface and with the key light. This is a first-order
//    Jacobian estimate, not traced photons.
//  * The glass-ball focus spot and its dimmed footprint use an analytic ball-lens model
//    (focal length ≈ n·r / (2(n−1))) along the key-light ray through the ball centre.
//  * Refraction uses three's transmission render target, which samples the opaque scene behind
//    each surface. The glass does not see the water surface, only the floor beneath it.
// Every frame is a pure function of the state written by the GSAP timeline.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Scene-dependent palette (background_policy: scene_dependent). Dark slate so transmitted light reads.
export const PAL = {
  bg: '#151C1F',      // studio sweep / background
  floor: '#3A4446',   // slate receiver under the water film
  text: '#ECE9E2',    // copy
  accent: '#93A5A4',  // kicker + rule
  steel: '#A7ADAF',   // brushed steel nodes
  rod: '#6C7476',     // darker brushed rods
  water: '#3E7A7C',   // water attenuation tint
  light: '#FFF6E6',   // key light / caustic light
};

// ---------- exact background: invert ACES Filmic + sRGB so the clear colour outputs PAL.bg ----------
function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function solve3(m, y) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const inv = [(e * i - f * h), -(b * i - c * h), (b * f - c * e), -(d * i - f * g), (a * i - c * g), -(a * f - c * d), (d * h - e * g), -(a * h - b * g), (a * e - b * d)].map(v => v / det);
  return [0, 1, 2].map(r => inv[r * 3] * y[0] + inv[r * 3 + 1] * y[1] + inv[r * 3 + 2] * y[2]);
}
const IN_M = [0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777];
const OUT_M = [1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602];
function invRRT(y) {
  const A = 1 - 0.983729 * y, B = 0.0245786 - 0.432951 * y, C = -0.000090537 - 0.238081 * y;
  return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
}
export function aceInverseLinear(hex, exposure) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const v = solve3(OUT_M, [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]).map(invRRT);
  const c = solve3(IN_M, v).map(x => Math.max(0, x * 0.6 / exposure));
  return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
}

// ---------- shared analytic water height field (GLSL) ----------
const WATER_LEVEL = 0.14;
const HEIGHT_GLSL = /* glsl */`
uniform float uPhase;     // ambient wave phase (seconds-equivalent, eased to rest)
uniform float uRipFront;  // ripple front radius (m)
uniform float uRipAmp;    // ripple amplitude (m)
uniform vec2  uRipC;      // ripple origin = where the glass idea came to rest
float hgt(vec2 p) {
  float h = 0.0;
  h += 0.0070 * sin(dot(p, vec2( 4.6,  1.9)) - 6.0 * uPhase);
  h += 0.0055 * sin(dot(p, vec2(-2.2,  5.3)) - 6.8 * uPhase + 1.3);
  h += 0.0035 * sin(dot(p, vec2( 6.9, -3.1)) - 8.2 * uPhase + 2.1);
  h += 0.0028 * sin(dot(p, vec2(-5.7, -6.4)) - 9.3 * uPhase + 4.0);
  float r = length(p - uRipC);
  float d = r - uRipFront;
  h += uRipAmp * exp(-d * d / 0.07) * cos(9.0 * d) / (1.0 + 0.9 * r);
  return h;
}
`;

const UP = new THREE.Vector3(0, 1, 0);

export function createScene(host, W, H) {
  const EXPOSURE = 1.0;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186 removed PCFSoftShadowMap; PCF + radius = soft penumbra
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const bgLinear = aceInverseLinear(PAL.bg, EXPOSURE);
  scene.background = bgLinear;
  scene.fog = new THREE.Fog(bgLinear, 12.5, 24); // floor dissolves into the sweep
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, W / H, 0.5, 80);
  camera.setViewOffset(W, H, -150, -70, W, H); // keeps the system right of the copy block

  // Key light: low and from upper-left, so caustics and shadows stretch toward the camera-right
  const key = new THREE.DirectionalLight(PAL.light, 3.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  scene.add(key); scene.add(key.target);
  const LIGHT_BASE = new THREE.Vector3(-5, 7.5, 4.2);
  const Ldir = new THREE.Vector3();

  // Shared optics uniforms (same objects referenced by floor + water shaders)
  const U = {
    uPhase: { value: 0 }, uRipFront: { value: 0 }, uRipAmp: { value: 0 }, uRipC: { value: new THREE.Vector2() },
    uL: { value: new THREE.Vector3(0, 1, 0) }, uSph: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
    uWater: { value: WATER_LEVEL }, uFocusK: { value: 2.4 },
  };
  const addVaryingVS = (sh) => {
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  };

  // Floor receiver: lit slate + caustics, ball-lens focus and contact shadows evaluated analytically
  const floorMat = new THREE.MeshStandardMaterial({ color: PAL.floor, roughness: 0.85, metalness: 0 });
  floorMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    addVaryingVS(sh);
    sh.fragmentShader = 'varying vec3 vWPos;\nuniform vec3 uL; uniform vec4 uSph[4]; uniform float uWater; uniform float uFocusK;\n' + HEIGHT_GLSL +
      `
float rayClear(vec3 P, vec4 s) { // 0 when the ray P->light hits sphere s
  vec3 oc = s.xyz - P; float tt = max(dot(oc, uL), 0.0);
  return smoothstep(s.w * 0.9, s.w * 1.05, length(oc - uL * tt));
}
` + sh.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`
  {
    vec3 P = vWPos;
    // 1) water caustic: where does the light ray reaching P enter the water surface?
    vec2 S = P.xz + uL.xz / max(uL.y, 0.2) * uWater;
    float e = 0.03;
    float lap = (hgt(S + vec2(e, 0.0)) + hgt(S - vec2(e, 0.0)) + hgt(S + vec2(0.0, e)) + hgt(S - vec2(0.0, e)) - 4.0 * hgt(S)) / (e * e);
    float I = clamp(1.0 / max(0.28, 1.0 + uFocusK * lap), 0.0, 3.2);
    // 2) occlusion of the key light by the metal nodes (index 1..3); glass (0) is a lens instead
    float clear = rayClear(P, uSph[1]) * rayClear(P, uSph[2]) * rayClear(P, uSph[3]);
    // 3) glass ball lens: dim footprint + focused spot along the light ray through its centre
    vec3 oc = uSph[0].xyz - P; float tt = max(dot(oc, uL), 0.0); float dd = length(oc - uL * tt);
    float rg = uSph[0].w; float f = 1.5 * rg;
    float spotR = rg * (0.10 + 0.6 * abs(tt - f) / f);
    float inFoot = 1.0 - smoothstep(rg * 0.85, rg * 1.02, dd);
    float lens = mix(1.0, 0.42, inFoot) + 2.6 * exp(-(dd * dd) / (spotR * spotR)) * inFoot;
    I = mix(I, 1.0, inFoot * 0.7);
    float lit = clear;
    outgoingLight *= mix(1.0, I * lens, lit);
    // 4) contact shadows (ambient occlusion right under each sphere)
    for (int i = 0; i < 4; i++) {
      vec2 q = P.xz - uSph[i].xz; float rr = uSph[i].w;
      float k = (i == 0) ? 0.35 : 0.7;
      outgoingLight *= 1.0 - k * exp(-dot(q, q) / (0.16 * rr * rr)) - 0.25 * k * exp(-dot(q, q) / (0.7 * rr * rr));
    }
  }
  #include <opaque_fragment>`);
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // Water film: transmissive plane whose normals come from the analytic height field
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 1, ior: 1.33, thickness: WATER_LEVEL,
    attenuationColor: new THREE.Color(PAL.water), attenuationDistance: 0.9, specularIntensity: 0.9, envMapIntensity: 0.6 });
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    addVaryingVS(sh);
    sh.fragmentShader = 'varying vec3 vWPos;\n' + HEIGHT_GLSL + sh.fragmentShader.replace('#include <normal_fragment_maps>', /* glsl */`
  #include <normal_fragment_maps>
  {
    vec2 p = vWPos.xz; float e = 0.02;
    float gx = (hgt(p + vec2(e, 0.0)) - hgt(p - vec2(e, 0.0))) / (2.0 * e);
    float gz = (hgt(p + vec2(0.0, e)) - hgt(p - vec2(0.0, e))) / (2.0 * e);
    normal = normalize((viewMatrix * vec4(normalize(vec3(-gx, 1.0, -gz)), 0.0)).xyz);
  }`);
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_LEVEL; scene.add(water);

  // Spheres
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, ior: 1.5, thickness: 1.4,
    attenuationColor: new THREE.Color(PAL.accent), attenuationDistance: 4.0, specularIntensity: 1, envMapIntensity: 1.2 });
  const steel = new THREE.MeshPhysicalMaterial({ color: PAL.steel, metalness: 1, roughness: 0.34, anisotropy: 0.65, anisotropyRotation: Math.PI / 2 });
  const rodMat = new THREE.MeshPhysicalMaterial({ color: PAL.rod, metalness: 1, roughness: 0.36, anisotropy: 0.6 });
  const sphereGeo = new THREE.SphereGeometry(1, 96, 64);
  const nodes = {
    A: { r: 0.78, end: new THREE.Vector3(-1.7, 0, 0.3), from: new THREE.Vector3(-1.5, 0, 0.35), mat: glass },
    B: { r: 0.40, end: new THREE.Vector3(0.35, 0, -1.6), from: new THREE.Vector3(), mat: steel },
    C: { r: 0.56, end: new THREE.Vector3(0.75, 0, 1.15), from: new THREE.Vector3(), mat: steel },
    D: { r: 0.46, end: new THREE.Vector3(2.5, 0, -0.1), from: new THREE.Vector3(), mat: steel },
  };
  const order = ['A', 'B', 'C', 'D'];
  for (const k of order) {
    const n = nodes[k];
    n.end.y = n.r;
    n.mesh = new THREE.Mesh(sphereGeo, n.mat);
    n.mesh.scale.setScalar(n.r);
    n.mesh.castShadow = n.mat !== glass; // the glass footprint is the analytic lens term in the floor shader
    n.mesh.receiveShadow = true;
    scene.add(n.mesh);
    n.dist = n.from.length();
    n.axis = n.dist > 0 ? new THREE.Vector3().crossVectors(UP, n.from.clone().negate().normalize()).normalize() : new THREE.Vector3(1, 0, 0);
  }
  const ripC = nodes.A.end;
  U.uRipC.value.set(ripC.x, ripC.z);

  // Rods (grow from source centre toward target centre)
  const rodGeo = new THREE.CylinderGeometry(0.036, 0.036, 1, 24, 1);
  rodGeo.translate(0, 0.5, 0);
  const rods = [['A', 'B', 'ab'], ['A', 'C', 'ac'], ['B', 'D', 'bd'], ['C', 'D', 'cd']].map(([s, e, k]) => {
    const m = new THREE.Mesh(rodGeo, rodMat); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    return { s: nodes[s], e: nodes[e], key: k, mesh: m };
  });

  // Post: RenderPass -> BokehPass (restrained DOF) -> OutputPass (ACES + sRGB)
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.0011, maxblur: 0.0055 });
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());

  const target = new THREE.Vector3(0.35, 0.45, -0.1);
  const tmp = new THREE.Vector3();
  const q = new THREE.Quaternion();

  function place(n, roll) { // rolling without slipping: rotation = distance / radius
    n.mesh.position.copy(n.end).addScaledVector(n.from, -(1 - roll));
    q.setFromAxisAngle(n.axis, (n.dist * roll) / n.r);
    n.mesh.quaternion.copy(q);
  }

  function render(st) {
    place(nodes.A, st.rollA);
    for (const k of ['B', 'C', 'D']) place(nodes[k], 1);
    order.forEach((k, i) => { const p = nodes[k].mesh.position; U.uSph.value[i].set(p.x, p.y, p.z, nodes[k].r); });

    // key light swings about the vertical axis; shadows, caustics and lens spot all follow it
    Ldir.copy(LIGHT_BASE).applyAxisAngle(UP, THREE.MathUtils.degToRad(st.lightAz));
    key.position.copy(Ldir); key.target.position.set(0, 0, 0);
    key.updateMatrixWorld(); key.target.updateMatrixWorld();
    U.uL.value.copy(Ldir).normalize();
    U.uPhase.value = st.phase;
    U.uRipFront.value = st.ripFront;
    U.uRipAmp.value = st.ripAmp;

    // rods A->B and A->C ride the ripple front; B->D, C->D are timeline-driven
    const aPos = nodes.A.mesh.position;
    for (const rod of rods) {
      const a = rod.s.mesh.position, b = rod.e.mesh.position;
      const dir = tmp.subVectors(b, a); const len = dir.length();
      let p;
      if (rod.s === nodes.A) {
        const reach = Math.hypot(b.x - ripC.x, b.z - ripC.z);
        p = THREE.MathUtils.clamp((st.ripFront - nodes.A.r) / (reach - nodes.A.r), 0, 1) * st.linkGate;
      } else p = st[rod.key];
      rod.mesh.visible = p > 0.0005;
      rod.mesh.position.copy(a);
      rod.mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
      rod.mesh.scale.set(1, Math.max(len * p, 0.0001), 1);
    }

    const az = THREE.MathUtils.degToRad(st.az), el = THREE.MathUtils.degToRad(st.el);
    camera.position.set(target.x + st.dist * Math.cos(el) * Math.sin(az), target.y + st.dist * Math.sin(el), target.z + st.dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const dA = camera.position.distanceTo(aPos);
    const dT = camera.position.distanceTo(target);
    bokeh.uniforms.focus.value = dA + (dT - dA) * st.focus; // focus pull: idea -> whole system
    composer.render(0);
  }

  return { render, renderer, bgLinear };
}
