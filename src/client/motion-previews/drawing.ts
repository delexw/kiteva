export const ink = "#EAF1F5",
  accent = "#78DEC8",
  warm = "#FF926C",
  dark = "#14212B";
export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const ease = (value: number) => {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
};
export function motionProgress(time: number, start: number, end: number) {
  return ease((time - start) / (end - start));
}
export const TAU = Math.PI * 2;
export { seeded } from "../../shared/seeded-random";

export function motionDrawing(c: CanvasRenderingContext2D) {
  const circle = (x: number, y: number, r: number, color = accent) => {
    c.beginPath();
    c.fillStyle = color;
    c.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
    c.fill();
  };
  const line = (x: number, y: number, xx: number, yy: number, color = ink, width = 3) => {
    c.beginPath();
    c.strokeStyle = color;
    c.lineWidth = width;
    c.moveTo(x, y);
    c.lineTo(xx, yy);
    c.stroke();
  };
  const text = (label: string, x: number, y: number, size = 24, color = ink) => {
    c.fillStyle = color;
    c.font = `600 ${size}px sans-serif`;
    c.textAlign = "center";
    c.fillText(label, x, y);
  };
  const card = (
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    color = accent,
  ) => {
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(x, y, width, height, 14);
    c.fill();
    text(label, x + width / 2, y + height / 2 + 8, 24, dark);
  };
  const cursor = (x: number, y: number) => {
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, 26);
    c.lineTo(7, 20);
    c.lineTo(14, 32);
    c.lineTo(20, 28);
    c.lineTo(13, 16);
    c.lineTo(24, 15);
    c.closePath();
    c.fillStyle = dark;
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  };
  const flower = (x: number, y: number, scale = 1) => {
    for (let i = 0; i < 6; i++)
      circle(
        x + Math.cos((i * Math.PI) / 3) * 12 * scale,
        y + Math.sin((i * Math.PI) / 3) * 12 * scale,
        9 * scale,
        warm,
      );
    circle(x, y, 7 * scale, ink);
  };

  return { circle, line, text, card, cursor, flower };
}
