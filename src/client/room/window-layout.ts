import type { RoomWindowState } from "../../shared/room";

export const roomWindowGap = 24;
export const roomDockClearance = 96;
const assistantWidth = 400;
const assistantMaxHeight = 600;
const sideColumnMinDesktop = 1000;
const tileMinWidth = 300;
const tileMaxWidth = 420;
const shelfTileHeight = 380;
const legacySizes: Array<[(id: string) => boolean, Array<[number, number]>]> = [
  [
    (id) => id === "assistant",
    [
      [440, 590],
      [440, 600],
      [460, 640],
    ],
  ],
  [
    (id) => id === "library",
    [
      [520, 560],
      [720, 600],
    ],
  ],
  [(id) => id.startsWith("detail:"), [[720, 600]]],
];

export type RoomArea = { width: number; height: number };
export type RoomGeometry = Pick<RoomWindowState, "x" | "y" | "width" | "height">;

export function fitRoomWindow<T extends RoomGeometry>(window: T, width: number, height: number): T {
  const fittedWidth = Math.min(window.width, Math.max(280, width - roomWindowGap));
  const fittedHeight = Math.min(window.height, Math.max(180, height - roomWindowGap));
  return {
    ...window,
    width: fittedWidth,
    height: fittedHeight,
    x: Math.max(0, Math.min(window.x, width - fittedWidth)),
    y: Math.max(0, Math.min(window.y, height - fittedHeight)),
  };
}
export function keepRoomWindowInView<T extends RoomGeometry>(window: T, area: RoomArea): T {
  const floor = Math.max(180 + roomWindowGap, area.height - roomDockClearance);
  const width = Math.min(window.width, Math.max(280, area.width - roomWindowGap * 2));
  const height = Math.min(window.height, Math.max(180, floor - roomWindowGap));
  return {
    ...window,
    width,
    height,
    x: Math.max(0, Math.min(window.x, area.width - width)),
    y: Math.max(0, Math.min(window.y, floor - height)),
  };
}
export function snapRoomWindow<T extends RoomGeometry>(window: T, area: RoomArea) {
  return keepRoomWindowInView(
    {
      ...window,
      x: Math.round(window.x / 16) * 16,
      y: Math.round(window.y / 16) * 16,
    },
    area,
  );
}

export function projectWidgetHeight(width: number) {
  return Math.round(((width - 26) * 9) / 16) + 180;
}

function isPinnedToZeroWidthRoom(window: RoomWindowState) {
  return isRoomRouteWindow(window.id) && window.x === 0 && window.width === 280;
}
export function roomWindowPlacement(window: RoomWindowState): "auto" | "user" {
  if (window.placement === "user" && isPinnedToZeroWidthRoom(window)) return "auto";
  if (window.placement) return window.placement;
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  if (window.id.startsWith("project:"))
    return window.width <= 400 && [440, 480, 500].some((height) => near(window.height, height))
      ? "auto"
      : "user";
  const sizes = legacySizes.find(([matches]) => matches(window.id))?.[1] || [];
  return sizes.some(([width, height]) => near(window.width, width) && near(window.height, height))
    ? "auto"
    : "user";
}

/** Windows bound to the current URL: shown only while that route is open. */
export function isRoomRouteWindow(id: string) {
  return id.startsWith("detail:") || id.startsWith("utility:");
}
export function autoRoomLayout(ids: string[], area: RoomArea) {
  const gap = roomWindowGap;
  const layout = new Map<string, RoomGeometry>();
  const usableHeight = Math.max(420, area.height - gap - roomDockClearance);
  let regionX = gap;
  let shelfPlaced = false;
  if (ids.includes("assistant")) {
    const width = Math.max(280, Math.min(assistantWidth, area.width - gap * 2));
    const height = Math.min(assistantMaxHeight, usableHeight);
    const y = Math.max(gap, area.height - roomDockClearance - height);
    layout.set("assistant", { x: gap, y, width, height });
    if (area.width >= sideColumnMinDesktop) {
      regionX = gap * 2 + width;
      if (ids.includes("library") && y - gap * 2 >= 300) {
        layout.set("library", { x: gap, y: gap, width, height: y - gap * 2 });
        shelfPlaced = true;
      }
    }
  }
  const regionWidth = Math.max(280, area.width - regionX - gap);
  const columns = Math.max(1, Math.floor((regionWidth + gap) / (tileMinWidth + gap)));
  const tileWidth = Math.max(
    280,
    Math.min(tileMaxWidth, Math.floor((regionWidth - gap * (columns - 1)) / columns)),
  );
  const bottoms = Array.from({ length: columns }, () => gap);
  for (const id of ids) {
    if (!(id.startsWith("project:") || (id === "library" && !shelfPlaced))) continue;
    const column = bottoms.indexOf(Math.min(...bottoms));
    const height = id === "library" ? shelfTileHeight : projectWidgetHeight(tileWidth);
    layout.set(id, {
      x: regionX + column * (tileWidth + gap),
      y: bottoms[column],
      width: tileWidth,
      height,
    });
    bottoms[column] += height + gap;
  }
  for (const id of ids)
    if (isRoomRouteWindow(id))
      layout.set(id, { x: regionX, y: gap, width: regionWidth, height: usableHeight });
  return layout;
}
