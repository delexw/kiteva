import { BookOpen, Grid2X2, Play, ShieldCheck, Wrench, type LucideIcon } from "lucide-react";
import type { RoomWindowState } from "../../shared/room";

export const roomUtilities = {
  styles: { title: "Style explorer", path: "/styles", icon: Grid2X2 },
  motions: { title: "Motion explorer", path: "/motions", icon: Play },
  technologies: { title: "Technology pool", path: "/technologies", icon: Wrench },
  governance: { title: "Governance", path: "/governance", icon: ShieldCheck },
  storyboard: { title: "Storyboard", path: undefined, icon: BookOpen },
} as const satisfies Record<string, { title: string; path?: string; icon: LucideIcon }>;
export type RoomUtilityPage = keyof typeof roomUtilities;
export const roomLauncherUtilities = (Object.keys(roomUtilities) as RoomUtilityPage[]).filter(
  (page) => roomUtilities[page].path,
);

export function isRoomUtilityPage(page: string): page is RoomUtilityPage {
  return Object.hasOwn(roomUtilities, page);
}
export function roomUtilityWindowId(page: RoomUtilityPage) {
  return `utility:${page}`;
}
export function roomUtilityPage(windowId: string): RoomUtilityPage | undefined {
  const page = windowId.startsWith("utility:") ? windowId.slice("utility:".length) : "";
  return isRoomUtilityPage(page) ? page : undefined;
}
export function roomUtilityPath(window: RoomWindowState): string | undefined {
  const page = roomUtilityPage(window.id);
  return page && (window.path || roomUtilities[page].path);
}
export function rememberRoomUtilityPath(
  windows: RoomWindowState[],
  page: RoomUtilityPage,
  path: string,
) {
  const id = roomUtilityWindowId(page);
  return windows.some((window) => window.id === id && window.path !== path)
    ? windows.map((window) => (window.id === id ? { ...window, path } : window))
    : windows;
}
