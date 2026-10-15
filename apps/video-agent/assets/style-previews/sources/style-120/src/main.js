// Style-120 Raymarched Fractal Landscapes — 3 s silent preview.
// Three.js hosts a fullscreen-quad GLSL raymarcher rendered offscreen at 0.6 scale,
// then a linear-filtered blit performs tone mapping + sRGB once.
// All state comes from the paused GSAP timeline (window.__timelines.video).
import {
  WebGLRenderer, Scene, OrthographicCamera, Mesh, PlaneGeometry, ShaderMaterial,
  WebGLRenderTarget, LinearFilter, HalfFloatType, UnsignedByteType, RGBAFormat,
  Vector2, Vector3, NoBlending, NoToneMapping, LinearSRGBColorSpace,
} from 'three';

const W = 1280, H = 720, SCALE = 0.6;
const BG = '#080A0C', FG = '#F2EEE5';

function hexToSrgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const bgS = hexToSrgb(BG), fgS = hexToSrgb(FG);
const fgL = fgS.map(toLin);

const canvas = document.getElementById('gl');
const renderer = new WebGLRenderer({
  canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = NoToneMapping;
renderer.outputColorSpace = LinearSRGBColorSpace; // blit shader does sRGB itself
renderer.autoClear = false;

const gl = renderer.getContext();
const halfOk = renderer.capabilities.isWebGL2 && !!gl.getExtension('EXT_color_buffer_float');
const rt = new WebGLRenderTarget(Math.round(W * SCALE), Math.round(H * SCALE), {
  minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat,
  type: halfOk ? HalfFloatType : UnsignedByteType, depthBuffer: false, stencilBuffer: false,
});

const vert = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const marchFrag = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform vec3 uCamPos, uCamTarget;
uniform float uEmerge, uLandscape, uSpin, uSpark, uConnect, uEnc;
uniform vec3 uFg;

#define MAX_STEPS 96
#define REFL_STEPS 40
#define MAX_DIST 18.0
#define FRACTAL_ITERS 8

const vec3 C0 = vec3(0.0, -0.22, 0.0);   // central solid
const float S0 = 0.95;
const vec3 CS = vec3(2.55, -0.74, 0.0);  // mirrored satellites (abs x)
const float SS = 0.5;
const float FLOOR_Y = -1.3;
const vec3 SPARK = vec3(0.0, 1.22, 0.0);

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0-h); }

// Mandelbulb distance estimate, bounded to FRACTAL_ITERS.
float bulb(vec3 p, float power, out float trap){
  trap = 1.0;
  float bound = length(p) - 1.25;
  if (bound > 0.2) return bound;
  vec3 z = p; float dr = 1.0; float r = 0.0;
  for (int i = 0; i < FRACTAL_ITERS; i++){
    r = length(z);
    if (r > 2.0) break;
    r = max(r, 1e-6);
    float th = acos(clamp(z.y / r, -1.0, 1.0)) * power;
    float ph = atan(z.z, z.x) * power;
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    float zr = pow(r, power);
    z = zr * vec3(sin(th)*cos(ph), cos(th), sin(th)*sin(ph)) + p;
    trap = min(trap, dot(z, z));
  }
  return 0.5 * log(max(r, 1e-6)) * r / dr;
}

float capsule(vec3 p, vec3 a, vec3 b, float r){
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba*h) - r;
}

// mat: 1 fractal, 2 terrain/floor, 3 emissive link, 4 spark
float map(vec3 p, out float mat, out float trap){
  float power = mix(3.0, 8.0, uEmerge);
  float t0, t1;
  vec3 q = (p - C0) / S0; q.xz = rot(uSpin) * q.xz;
  float d0 = bulb(q, power, t0) * S0;
  vec3 qs = vec3(abs(p.x), p.y, p.z) - CS; qs = qs / SS; qs.xz = rot(-uSpin*1.6 + 0.7) * qs.xz;
  float d1 = bulb(qs, mix(3.0, 7.0, uEmerge), t1) * SS;
  float dF = d0; trap = t0;
  if (d1 < d0){ dF = d1; trap = t1; }

  // floor plane blended toward a domain-repeated pyramid fold (terrain)
  vec2 cell = mod(p.xz + 1.0, 2.0) - 1.0;
  float fold = max(0.0, 1.0 - (abs(cell.x) + abs(cell.y)));
  float away = smoothstep(2.2, 4.5, length(p.xz));
  float dT = (p.y - FLOOR_Y - uLandscape * 0.55 * fold * away) * 0.7;

  float k = 0.05 + 0.25 * uLandscape;
  float d = smin(dF, dT, k);
  mat = dF < dT ? 1.0 : 2.0;

  // links drawn from the central solid toward each satellite
  vec3 a = vec3(0.9, -0.42, 0.0), b = vec3(2.08, -0.78, 0.0);
  vec3 e = mix(a, b, uConnect);
  float dL = uConnect > 0.001 ? capsule(vec3(abs(p.x), p.y, p.z), a, e, 0.028) : 1e3;
  if (dL < d){ d = dL; mat = 3.0; }
  float dS = length(p - SPARK) - 0.075 * uSpark;
  if (uSpark > 0.001 && dS < d){ d = dS; mat = 4.0; }
  return d;
}
float mapD(vec3 p){ float m, t; return map(p, m, t); }

vec3 calcNormal(vec3 p){
  const float e = 0.0012;
  return normalize(vec3(
    mapD(p + vec3(e,0,0)) - mapD(p - vec3(e,0,0)),
    mapD(p + vec3(0,e,0)) - mapD(p - vec3(0,e,0)),
    mapD(p + vec3(0,0,e)) - mapD(p - vec3(0,0,e))));
}

float calcAO(vec3 p, vec3 n){
  float occ = 0.0, w = 1.0;
  for (int i = 1; i <= 4; i++){
    float h = 0.03 + 0.09 * float(i);
    occ += (h - mapD(p + n*h)) * w; w *= 0.6;
  }
  return clamp(1.0 - 2.2 * occ, 0.0, 1.0);
}

float march(vec3 ro, vec3 rd, int steps, out float mat, out float trap){
  float t = 0.02; mat = 0.0; trap = 1.0;
  for (int i = 0; i < MAX_STEPS; i++){
    if (i >= steps) break;
    float m, tr;
    float d = map(ro + rd*t, m, tr);
    if (d < 0.0009 * t){ mat = m; trap = tr; return t; }
    t += d * 0.9;
    if (t > MAX_DIST) break;
  }
  return -1.0;
}

const vec3 LDIR = normalize(vec3(-0.55, 0.75, 0.35));

vec3 baseShade(vec3 p, vec3 n, vec3 rd, float mat, float trap, float ao){
  if (mat > 3.5) return uFg * 6.0;
  if (mat > 2.5) return uFg * 2.2;
  vec3 alb = mat < 1.5 ? uFg * mix(0.18, 0.85, clamp(sqrt(trap), 0.0, 1.0)) : uFg * 0.10;
  float dif = max(dot(n, LDIR), 0.0);
  vec3 h = normalize(LDIR - rd);
  float spe = pow(max(dot(n, h), 0.0), 48.0);
  vec3 toS = SPARK - p; float ds = length(toS);
  float sp = uSpark * max(dot(n, toS/ds), 0.0) / (1.0 + 2.5*ds*ds);
  vec3 col = alb * (0.05 + 1.4*dif*ao) + uFg * spe * 0.9 * ao + alb * sp * 5.0;
  return col;
}

void main(){
  vec2 frag = vUv * uRes;
  vec2 uv = (2.0*frag - uRes) / uRes.y;
  vec3 ww = normalize(uCamTarget - uCamPos);
  vec3 uu = normalize(cross(ww, vec3(0,1,0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.9*ww);
  vec3 ro = uCamPos;

  float density = mix(0.62, 0.075, uEmerge);
  float mat, trap;
  float t = march(ro, rd, MAX_STEPS, mat, trap);

  vec3 col; float fog;
  if (t < 0.0){
    // missing rays: exact background (fog=1), plus spark halo as coverage
    vec3 toS = SPARK - ro; float along = dot(toS, rd);
    float perp = length(toS - rd*along);
    float halo = uSpark * exp(-perp*perp*60.0) * 0.85 + uSpark * exp(-perp*9.0) * 0.12;
    col = uFg; fog = 1.0 - clamp(halo, 0.0, 1.0);
  } else {
    vec3 p = ro + rd*t;
    vec3 n = calcNormal(p);
    float ao = (mat < 2.5) ? calcAO(p, n) : 1.0;
    col = baseShade(p, n, rd, mat, trap, ao);
    if (mat < 2.5){
      // one reflection bounce, reduced step budget
      vec3 rr = reflect(rd, n);
      float fres = pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
      float refl = mat < 1.5 ? mix(0.25, 0.9, fres) : mix(0.35, 0.85, fres);
      float m2, tr2;
      vec3 ro2 = p + n*0.004;
      float t2 = march(ro2, rr, REFL_STEPS, m2, tr2);
      vec3 rc;
      if (t2 > 0.0){
        vec3 p2 = ro2 + rr*t2;
        vec3 n2 = calcNormal(p2);
        rc = baseShade(p2, n2, rr, m2, tr2, 0.8);
        rc *= exp(-density * 1.4 * t2);
      } else {
        vec3 toS = SPARK - ro2; float along = max(dot(toS, rr), 0.0);
        float perp = length(toS - rr*along);
        rc = uFg * uSpark * (exp(-perp*perp*40.0) * 1.6);
      }
      col = mix(col, rc, refl * ao);
    }
    fog = 1.0 - exp(-density * t);
    if (mat > 3.5) fog *= 0.3;
  }
  col = max(col, 0.0);
  if (uEnc > 0.5) col = col / (1.0 + col);
  gl_FragColor = vec4(col, clamp(fog, 0.0, 1.0));
}`;

const blitFrag = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uEnc;
uniform vec3 uBg;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
vec3 oetf(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec4 s = texture2D(uTex, vUv);
  vec3 lin = s.rgb;
  if (uEnc > 0.5) lin = lin / max(1.0 - lin, 1e-3);
  vec3 c = oetf(aces(lin));
  float fog = s.a;
  // reading bands for the two copy lines settle to the exact background
  float y = 1.0 - vUv.y;
  float band = max(1.0 - smoothstep(0.15, 0.24, y), smoothstep(0.76, 0.81, y));
  fog = max(fog, band);
  gl_FragColor = vec4(mix(c, uBg, fog), 1.0);
}`;

const quad = new PlaneGeometry(2, 2);
const marchMat = new ShaderMaterial({
  vertexShader: vert, fragmentShader: marchFrag, blending: NoBlending, depthTest: false, depthWrite: false,
  uniforms: {
    uRes: { value: new Vector2(rt.width, rt.height) },
    uCamPos: { value: new Vector3() }, uCamTarget: { value: new Vector3() },
    uEmerge: { value: 0 }, uLandscape: { value: 0 }, uSpin: { value: 0 },
    uSpark: { value: 0 }, uConnect: { value: 0 }, uEnc: { value: halfOk ? 0 : 1 },
    uFg: { value: new Vector3(...fgL) },
  },
});
const blitMat = new ShaderMaterial({
  vertexShader: vert, fragmentShader: blitFrag, blending: NoBlending, depthTest: false, depthWrite: false,
  uniforms: { uTex: { value: rt.texture }, uEnc: { value: halfOk ? 0 : 1 }, uBg: { value: new Vector3(...bgS) } },
});
const marchScene = new Scene(); marchScene.add(new Mesh(quad, marchMat));
const blitScene = new Scene(); blitScene.add(new Mesh(quad, blitMat));
const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Shared deterministic state, written only by GSAP.
const S = {
  emerge: 0, landscape: 0, spin: 0, spark: 0, connect: 0,
  cx: 0.9, cy: 0.62, cz: 8.4, tx: 0, ty: -0.05, tz: 0,
};

function render() {
  const u = marchMat.uniforms;
  u.uEmerge.value = S.emerge; u.uLandscape.value = S.landscape; u.uSpin.value = S.spin;
  u.uSpark.value = S.spark; u.uConnect.value = S.connect;
  u.uCamPos.value.set(S.cx, S.cy, S.cz); u.uCamTarget.value.set(S.tx, S.ty, S.tz);
  renderer.setRenderTarget(rt); renderer.render(marchScene, cam);
  renderer.setRenderTarget(null); renderer.render(blitScene, cam);
}

const gsap = window.gsap;
const tl = gsap.timeline({ paused: true, onUpdate: render });
// spark: the idea appears
tl.to(S, { spark: 1, duration: 0.6, ease: 'power2.inOut' }, 0.0);
// fractal solids emerge from fog (fog density + power morph)
tl.to(S, { emerge: 1, duration: 2.3, ease: 'power2.inOut' }, 0.1);
// slow dolly along authored path
tl.to(S, { cx: 0.0, cy: 0.2, cz: 5.6, ty: -0.25, duration: 2.6, ease: 'sine.inOut' }, 0.0);
tl.to(S, { spin: 0.55, duration: 2.6, ease: 'sine.inOut' }, 0.0);
// connections draw outward from the core
tl.to(S, { connect: 1, duration: 1.0, ease: 'power2.inOut' }, 1.3);
// first hint of the landscape fold (full blend continues in the full video)
tl.to(S, { landscape: 0.35, duration: 1.0, ease: 'sine.inOut' }, 1.6);
// copy (standalone headings, independent timing)
tl.fromTo('#kicker', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.inOut' }, 0.25);
tl.fromTo('#title', { opacity: 0, y: 14, scale: 1.04 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'power2.inOut' }, 1.5);
tl.set({}, {}, 3.0);

window.__timelines = window.__timelines || {};
window.__timelines.video = tl;

const onSeek = (e) => {
  const t = e && e.detail && typeof e.detail.time === 'number' ? e.detail.time : tl.time();
  tl.seek(t, false);
  render();
};
window.addEventListener('hf-seek', onSeek);
document.addEventListener('hf-seek', onSeek);

tl.seek(0, false);
render();
