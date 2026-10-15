import { expect, it } from "vitest";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomWindow } from "../src/client/room/room-window";
import { roomColors } from "../src/client/theme";

const state = {
  id: "assistant",
  x: 24,
  y: 24,
  width: 400,
  height: 540,
  minimized: false,
  maximized: false,
};
const render = (change: Partial<Parameters<typeof RoomWindow>[0]> = {}) =>
  renderToStaticMarkup(
    <RoomWindow
      state={state}
      display={state}
      title="Assistant"
      desktop={createRef()}
      area={{ width: 1280, height: 660 }}
      onChange={() => {}}
      onFocus={() => {}}
      focused
      layer={2}
      {...change}
    >
      <p>Body</p>
    </RoomWindow>,
  );

it("gives windows round close, minimize and expand controls, and never a delete", () => {
  const html = render();
  const button = (markup: string, name: string) =>
    markup.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0] || "";
  expect(button(html, "Minimize Assistant")).toContain("room-traffic is-minimize");
  expect(button(html, "Expand Assistant")).toMatch(/aria-pressed="false".*room-traffic is-zoom/);
  expect(button(html, "Close Assistant")).toContain("room-traffic is-close");
  expect(html.indexOf("Close Assistant")).toBeLessThan(html.indexOf("Minimize Assistant"));
  expect(html).not.toMatch(/Delete/);
  expect(html).toContain('aria-label="Resize Assistant. Drag, or use the arrow keys"');
  const maximized = render({ state: { ...state, maximized: true } });
  expect(button(maximized, "Restore Assistant")).toMatch(
    /aria-pressed="true".*room-traffic is-restore/,
  );
  expect(maximized).not.toContain("room-resize-grip");
});

it("shows only Back to room on a phone's full-screen window", () => {
  const html = render({ mobile: true, front: true });
  expect(html).toContain("Back to room");
  expect(html).not.toContain("room-traffic");
});

it("keeps dark text on orange fills readable", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };
  for (const fill of [roomColors.primary, roomColors.primaryHover, roomColors.primaryActive])
    expect(contrast(fill, roomColors.onPrimary)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(roomColors.focus, roomColors.surface)).toBeGreaterThanOrEqual(3);
  expect(contrast(roomColors.close, roomColors.onPrimary)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(roomColors.close, roomColors.raised)).toBeGreaterThanOrEqual(3);
});
