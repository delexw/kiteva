import { PerspectiveCamera, Vector3 } from "three";
import { polygonHull } from "d3-polygon";

/**
 * Shared projected-3D helpers for camera-driven previews, plus the motion-043
 * 360° camera orbit. Geometry, lights, shadows and landmarks are fixed in world space;
 * only the PerspectiveCamera pose is a function of absolute composition time. Canvas
 * paints the projected, back-face-culled, depth-sorted faces (no WebGL context).
 */

export type Face = { points: Vector3[]; normal: Vector3; color: string };
export type ScreenPoint = { x: number; y: number; depth: number };

const VIEW_W = 640,
  VIEW_H = 360;

/** Closed axis-aligned box: centre (x, y, z) and full sizes. All six faces are emitted. */
export function boxFaces(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: string,
): Face[] {
  const [hx, hy, hz] = [width / 2, height / 2, depth / 2];
  const v = (sx: number, sy: number, sz: number) =>
    new Vector3(x + sx * hx, y + sy * hy, z + sz * hz);
  const face = (normal: [number, number, number], corners: [number, number, number][]) => ({
    points: corners.map(([a, b, c]) => v(a, b, c)),
    normal: new Vector3(...normal),
    color,
  });
  return [
    face(
      [1, 0, 0],
      [
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
      ],
    ),
    face(
      [-1, 0, 0],
      [
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, -1],
      ],
    ),
    face(
      [0, 1, 0],
      [
        [-1, 1, -1],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
    ),
    face(
      [0, -1, 0],
      [
        [-1, -1, 1],
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
      ],
    ),
    face(
      [0, 0, 1],
      [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
    ),
    face(
      [0, 0, -1],
      [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
      ],
    ),
  ];
}

/** Closed regular prism standing on baseY (used for pedestals and posts). */
export function prismFaces(
  x: number,
  baseY: number,
  z: number,
  radius: number,
  height: number,
  sides: number,
  color: string,
): Face[] {
  const ring = (y: number) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return new Vector3(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius);
    });
  const bottom = ring(baseY),
    top = ring(baseY + height);
  const faces: Face[] = bottom.map((b, i) => {
    const j = (i + 1) % sides;
    const mid = (i + 0.5) / sides;
    return {
      points: [b, bottom[j]!, top[j]!, top[i]!],
      normal: new Vector3(Math.cos(mid * Math.PI * 2), 0, Math.sin(mid * Math.PI * 2)),
      color,
    };
  });
  faces.push({ points: [...top].reverse(), normal: new Vector3(0, 1, 0), color });
  faces.push({ points: bottom, normal: new Vector3(0, -1, 0), color });
  return faces;
}

/** Corner points of a box, for world-space shadow casting. */
export function boxCorners(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
) {
  const corners: Vector3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        corners.push(
          new Vector3(x + (sx * width) / 2, y + (sy * height) / 2, z + (sz * depth) / 2),
        );
  return corners;
}

export function makeCamera(position: Vector3, target: Vector3, fov = 40) {
  const camera = new PerspectiveCamera(fov, VIEW_W / VIEW_H, 0.1, 100);
  camera.position.copy(position);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

export function projector(camera: PerspectiveCamera) {
  return (point: Vector3): ScreenPoint => {
    const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
    const ndc = point.clone().project(camera);
    return { x: (ndc.x + 1) * (VIEW_W / 2), y: (1 - ndc.y) * (VIEW_H / 2), depth: -view.z };
  };
}

/** Multiply a #RRGGBB colour by k (0…1+) and return an rgb() string. */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * k)));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** Back-face cull, near-plane cull, painter-sort and flat-shade faces under a world light. */
export function paintFaces(
  c: CanvasRenderingContext2D,
  faces: Face[],
  camera: PerspectiveCamera,
  light: Vector3,
  outline = "#14212B",
) {
  const project = projector(camera);
  const visible = faces
    .map((face) => {
      const center = face.points
        .reduce((sum, p) => sum.add(p), new Vector3())
        .multiplyScalar(1 / face.points.length);
      const screen = face.points.map(project);
      return {
        face,
        center,
        screen,
        depth: screen.reduce((s, p) => s + p.depth, 0) / screen.length,
      };
    })
    .filter(({ face, center, screen }) => {
      if (screen.some((p) => p.depth < 0.2)) return false;
      return face.normal.dot(camera.position.clone().sub(center)) > 0;
    })
    .sort((a, b) => b.depth - a.depth);
  for (const { face, screen } of visible) {
    c.beginPath();
    screen.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fillStyle = shade(face.color, 0.5 + 0.55 * Math.max(0, face.normal.dot(light)));
    c.fill();
    c.strokeStyle = outline;
    c.lineWidth = 1.25;
    c.stroke();
  }
}

/** Ground grid on y = 0, clipped to points in front of the camera. */
export function paintGround(
  c: CanvasRenderingContext2D,
  camera: PerspectiveCamera,
  extent: number,
  color = "#304556",
) {
  const project = projector(camera);
  c.strokeStyle = color;
  c.lineWidth = 1;
  for (let offset = -extent; offset <= extent; offset++) {
    for (const [a, b] of [
      [new Vector3(-extent, 0, offset), new Vector3(extent, 0, offset)],
      [new Vector3(offset, 0, -extent), new Vector3(offset, 0, extent)],
    ]) {
      const pa = project(a!),
        pb = project(b!);
      if (pa.depth < 0.2 || pb.depth < 0.2) continue;
      c.beginPath();
      c.moveTo(pa.x, pa.y);
      c.lineTo(pb.x, pb.y);
      c.stroke();
    }
  }
}

/** World-space cast shadow: project points along the light onto y = 0, then hull them. */
export function paintShadow(
  c: CanvasRenderingContext2D,
  camera: PerspectiveCamera,
  points: Vector3[],
  light: Vector3,
  color = "rgba(5, 10, 14, 0.38)",
) {
  const flat: [number, number][] = points.map((point) => [
    point.x - (light.x * point.y) / light.y,
    point.z - (light.z * point.y) / light.y,
  ]);
  const hull = polygonHull(flat);
  if (!hull) return;
  const project = projector(camera);
  const screen = hull.map(([x, z]) => project(new Vector3(x, 0.001, z)));
  if (screen.length < 3 || screen.some((p) => p.depth < 0.2)) return;
  c.beginPath();
  screen.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

// ---------------------------------------------------------------------------
// motion-043 · 360° camera orbit around a fixed, asymmetric hero.
// ---------------------------------------------------------------------------

const ORBIT = {
  target: new Vector3(0, 0.8, 0),
  radius: 7,
  height: 3,
  fov: 40,
  theta0: 0.35,
  direction: 1,
  openHold: 0.9,
  duration: 4.2,
};
/** Fixed world key light (never attached to the camera). */
const WORLD_LIGHT = new Vector3(-0.5, 1, 0.65).normalize();

type Part = {
  box: [number, number, number, number, number, number];
  color: string;
  castsShadow: boolean;
};
// The hero: plinth, tower, offset roof block, front window, rear hatch, side annex, left vent.
const HERO: Part[] = [
  { box: [0, 0.12, 0, 1.8, 0.24, 1.3], color: "#566A7C", castsShadow: false },
  { box: [0, 0.93, 0, 1.1, 1.38, 0.8], color: "#72CCB9", castsShadow: true },
  { box: [0.35, 1.81, -0.08, 0.3, 0.38, 0.35], color: "#78DEC8", castsShadow: true },
  { box: [0, 1.0, 0.425, 0.52, 0.4, 0.06], color: "#F4BA73", castsShadow: false },
  { box: [0, 0.75, -0.425, 0.4, 0.7, 0.06], color: "#3F5566", castsShadow: false },
  { box: [0.72, 0.55, -0.12, 0.34, 0.62, 0.48], color: "#B6C9E8", castsShadow: true },
  { box: [-0.57, 1.25, 0.1, 0.06, 0.3, 0.4], color: "#C7D3DB", castsShadow: false },
];
// Landmarks at fixed world positions: they show parallax against the hero.
const LANDMARKS: Part[] = [
  { box: [-2.1, 0.35, -0.8, 0.18, 0.7, 0.18], color: "#FF926C", castsShadow: true },
  { box: [1.8, 0.45, -1.4, 0.18, 0.9, 0.18], color: "#B6C9E8", castsShadow: true },
  { box: [1.2, 0.25, 1.9, 0.18, 0.5, 0.18], color: "#78DEC8", castsShadow: true },
];
const WORLD_FACES = [...HERO, ...LANDMARKS].flatMap(({ box, color }) => boxFaces(...box, color));
const FRONT_ANCHOR = new Vector3(0, 1.32, 0.46);
const FRONT_NORMAL = new Vector3(0, 0, 1);

export function orbitCameraPose(time: number) {
  const bounded = Math.max(0, Math.min(1, (time - ORBIT.openHold) / ORBIT.duration));
  // Sine ease-in-out: zero velocity leaving and arriving at the front view.
  const progress = bounded >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * bounded);
  // θ0 + 2π is the same pose as θ0; use it exactly so the end hold equals the opening.
  const angle =
    progress >= 1 ? ORBIT.theta0 : ORBIT.theta0 + ORBIT.direction * progress * Math.PI * 2;
  return {
    position: new Vector3(
      Math.sin(angle) * ORBIT.radius,
      ORBIT.height,
      Math.cos(angle) * ORBIT.radius,
    ),
    target: ORBIT.target.clone(),
    progress,
  };
}

/** Render the fixed scene through the time-posed camera (pure function of time). */
export function drawOrbitPreview(context: CanvasRenderingContext2D, time: number) {
  const c = context;
  const pose = orbitCameraPose(time);
  const camera = makeCamera(pose.position, pose.target, ORBIT.fov);
  c.save();
  c.beginPath();
  c.rect(0, 0, VIEW_W, VIEW_H);
  c.clip();
  paintGround(c, camera, 3);
  for (const part of [...HERO, ...LANDMARKS])
    if (part.castsShadow) paintShadow(c, camera, boxCorners(...part.box), WORLD_LIGHT);
  paintFaces(c, WORLD_FACES, camera, WORLD_LIGHT);

  // Screen-space label reprojected from the front window anchor, only when it faces us.
  const project = projector(camera);
  const facing = FRONT_NORMAL.dot(camera.position.clone().sub(FRONT_ANCHOR).normalize());
  if (facing > 0.55) {
    const anchor = project(FRONT_ANCHOR);
    c.globalAlpha = Math.min(1, (facing - 0.55) / 0.2);
    c.fillStyle = "#F4BA73";
    c.textAlign = "center";
    c.font = "600 12px sans-serif";
    c.fillText("FRONT", anchor.x, anchor.y - 8);
    c.globalAlpha = 1;
  }

  c.fillStyle = "#EAF1F5";
  c.textAlign = "center";
  c.font = "600 19px sans-serif";
  c.fillText("360° CAMERA ORBIT", 320, 34);
  c.font = "600 14px sans-serif";
  c.fillStyle = "#9FB0BC";
  c.fillText("Fixed subject · world light · camera moves", 320, 316);
  c.fillStyle = "#78DEC8";
  c.fillText(`camera θ ${Math.round(pose.progress * 360)}°`, 320, 338);
  // Closing line only after the camera has fully stopped at the front.
  const closing = Math.max(0, Math.min(1, (time - (ORBIT.openHold + ORBIT.duration + 0.1)) / 0.3));
  if (closing > 0) {
    c.globalAlpha = closing;
    c.fillStyle = "#EAF1F5";
    c.font = "600 15px sans-serif";
    c.fillText("Full circuit · back to the front view", 320, 58);
    c.globalAlpha = 1;
  }
  c.restore();
}
