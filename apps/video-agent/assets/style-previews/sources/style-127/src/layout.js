// Shared, pure layout math (no WebGL). Every value derives from the state
// object { sep, cut, az, beam } which GSAP owns on the composition timeline.
import { PerspectiveCamera, Vector3 } from "three";

export const W = 1280;
export const H = 720;

// Part centres on the optical axis (world Y): assembled stack -> exploded.
export const PARTS = [
  { id: "spark", label: "01 SPARK · glass core", rOut: 0.48, assembled: 0.62, exploded: 2.05 },
  { id: "focus", label: "02 FOCUS · lens ring", rOut: 1.0, assembled: 0.085, exploded: 0.98 },
  { id: "router", label: "03 ROUTER · steel housing", rOut: 1.35, assembled: -0.225, exploded: -0.2 },
  { id: "network", label: "04 NETWORK · node plate", rOut: 1.65, assembled: -0.6, exploded: -1.45 },
];

export function partY(i, sep) {
  const p = PARTS[i];
  return p.assembled + (p.exploded - p.assembled) * sep;
}

const CAM_DIST = 11.2;
const CAM_ELEV = 0.36; // radians (~20.6 deg)

export function makeCamera() {
  const cam = new PerspectiveCamera(30, W / H, 0.1, 100);
  // shift the optical axis right of frame centre (illustration places it at x~840)
  cam.setViewOffset(W, H, -190, -12, W, H);
  return cam;
}

export function placeCamera(cam, state) {
  const ty = 0.05 + 0.18 * state.sep;
  const az = state.az;
  cam.position.set(
    Math.sin(az) * Math.cos(CAM_ELEV) * CAM_DIST,
    ty + Math.sin(CAM_ELEV) * CAM_DIST,
    Math.cos(az) * Math.cos(CAM_ELEV) * CAM_DIST
  );
  cam.up.set(0, 1, 0);
  cam.lookAt(0, ty, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
}

const _v = new Vector3();
// Left-rim anchor of each part, reprojected to SVG pixel space.
export function projectAnchors(cam, state) {
  const rx = Math.cos(state.az);
  const rz = -Math.sin(state.az);
  return PARTS.map((p, i) => {
    _v.set(-rx * p.rOut, partY(i, state.sep), -rz * p.rOut);
    _v.project(cam);
    return [(_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H];
  });
}
