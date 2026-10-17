import { motionDrawings } from "./motion-previews/registry";
import { dark } from "./motion-previews/drawing";
export { motionProgress } from "./motion-previews/drawing";
export const motionPreviewDuration = 6;
export const supportedMotionIds = Object.keys(motionDrawings);
export function drawMotionPreview(c: CanvasRenderingContext2D, id: string, time: number) {
  const draw = motionDrawings[id];
  if (!draw) throw Error(`No preview for ${id}`);
  const t = Math.max(0, Math.min(motionPreviewDuration, time));
  c.save();
  c.clearRect(0, 0, 640, 360);
  c.fillStyle = dark;
  c.fillRect(0, 0, 640, 360);
  c.lineCap = "round";
  c.lineJoin = "round";
  draw(c, t);
  c.restore();
}
