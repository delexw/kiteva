export function heroGeometry(
  time: number,
  pointerX: number,
  pointerY: number,
  variant: number,
  width = 480,
  height = 260,
) {
  const xOffset = Math.max(-1, Math.min(1, pointerX)) * height * 0.09;
  const yOffset = Math.max(-1, Math.min(1, pointerY)) * height * 0.08;
  const ribbons = Array.from({ length: 16 }, (_, ribbon) =>
    Array.from({ length: 81 }, (_, point): [number, number] => {
      const progress = point / 80;
      return [
        progress * width,
        height * (0.5 + (ribbon - 7.5) * 0.025) +
          Math.sin(progress * Math.PI * 2 + time * 0.5 + ribbon * 0.09 + variant) *
            height *
            (0.25 + ribbon * 0.006) +
          yOffset * Math.sin(progress * Math.PI),
      ];
    }),
  );
  const circles = Array.from({ length: 7 }, (_, index) => {
    const angle = time * 0.35 + index * 1.2 + variant * 0.8;
    return {
      x: width * ((index + 0.5) / 7) + Math.cos(angle) * height * 0.08 + xOffset,
      y: height * (0.5 + Math.sin(angle) * 0.32) + yOffset,
      radius: height * (index === 0 || index === 5 ? 0.29 : index === 3 ? 0.2 : 0.035),
      color: index === 0 || index === 5 ? 0x3455db : index === 3 ? 0x24b8a6 : 0x18243b,
    };
  });
  return { ribbons, circles };
}
