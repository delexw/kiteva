import { drawOrbitPreview } from "../motion-orbit-preview";

/**
 * 360° Camera Orbit (360度环绕运镜).
 * The implementation lives in motion-orbit-preview.ts: a fixed asymmetric hero,
 * fixed world light, world-space shadows and landmarks, and a PerspectiveCamera whose
 * pose is a pure function of absolute time — 0.9 s opening hold, one eased 360°
 * circuit (constant radius, height and FOV, lookAt on a fixed target), then a held
 * return to the exact opening pose with the closing line revealed after it stops.
 */
export default function draw(c: CanvasRenderingContext2D, t: number) {
  drawOrbitPreview(c, t);
}
