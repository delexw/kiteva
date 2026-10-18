import { translateUi } from "../i18n/service";
import { isRunSettled, type Run } from "../../shared/contracts";
import { projectName } from "../../shared/project-name";
import { scopedAssetQuestions } from "../../shared/asset-question-scopes";
import type { RoomWindowState } from "../../shared/room";
import { isRoomRouteWindow, roomWindowGap } from "./window-layout";

export function newRoomWindow(id: string): RoomWindowState {
  return {
    id,
    x: roomWindowGap,
    y: roomWindowGap,
    width: 400,
    height: 480,
    minimized: false,
    maximized: false,
    placement: "auto",
  };
}
/** Give each project a card window and, the first time, the fixed windows; closed ones stay closed. */
export function ensureRoomWindows(
  windows: RoomWindowState[],
  projectIds: readonly string[],
  withFixedWindows: boolean,
) {
  const wanted = [
    ...projectIds.map((id) => `project:${id}`),
    ...(withFixedWindows ? ["assistant", "library"] : []),
  ];
  const missing = wanted.filter((id) => !windows.some((window) => window.id === id));
  return missing.length ? [...windows, ...missing.map(newRoomWindow)] : windows;
}
export const isRoomWindowShown = (window: RoomWindowState) => !window.minimized && !window.closed;
export const isRoomWindowInDock = (window: RoomWindowState) => window.minimized && !window.closed;

export function openRoomWindow(windows: readonly RoomWindowState[], id: string) {
  return windows.some((window) => window.id === id)
    ? windows.map((window) =>
        window.id === id ? { ...window, minimized: false, closed: undefined } : window,
      )
    : [...windows, newRoomWindow(id)];
}
export function closeRoomWindow(windows: readonly RoomWindowState[], id: string) {
  return windows.map((window) =>
    window.id === id ? { ...window, minimized: false, maximized: false, closed: true } : window,
  );
}
export function showAllProjectWindows(windows: readonly RoomWindowState[], projectIds: string[]) {
  return projectIds.reduce((next, id) => openRoomWindow(next, `project:${id}`), [...windows]);
}
/** Arrange displayed windows without opening or minimizing any other window. */
export function arrangeRoomWindows(windows: readonly RoomWindowState[], routeWindowId?: string) {
  return windows.map((window) =>
    isRoomWindowDisplayed(window, routeWindowId)
      ? { ...window, placement: "auto" as const, maximized: false }
      : window,
  );
}

export function roomMobileFront(
  displayedIds: readonly string[],
  requested?: string,
  routeWindowId?: string,
) {
  if (requested && displayedIds.includes(requested)) return requested;
  return routeWindowId && displayedIds.includes(routeWindowId) ? routeWindowId : undefined;
}

export type RoomProjectWindowKind = "card" | "expanded";
export function roomProjectWindowKind(id: string): RoomProjectWindowKind {
  return id.startsWith("detail:") ? "expanded" : "card";
}
const tones = [
  "#E58A3E",
  "#D9A35A",
  "#C9785F",
  "#B58BC4",
  "#7FA6C8",
  "#77B096",
  "#C8A07A",
  "#D07F92",
];
export function roomProjectTone(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length];
}
export function roomProjectInitials(name: string) {
  const words = name.match(/[\p{L}\p{N}]+/gu) || [];
  const [first = "?", second] = words;
  const letters = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return letters.toUpperCase();
}
export function roomProjectSignals(project: Run) {
  const questions = scopedAssetQuestions(project).filter((q) => q.state === "open").length;
  const working = !isRunSettled(project);
  const failed = project.phase === "failed" || project.jobs.some((job) => job.phase === "failed");
  return { questions, working, failed: failed && !working };
}
export function roomProjectStatusText(project: Run) {
  const { questions, working, failed } = roomProjectSignals(project);
  return [
    working ? translateUi("working") : failed ? translateUi("needs attention") : "",
    questions ? translateUi("dock.questions", { count: questions }) : "",
  ]
    .filter(Boolean)
    .join(", ");
}
export function roomDockLabel(project: Run, kind: RoomProjectWindowKind) {
  const status = roomProjectStatusText(project);
  return translateUi("Restore {{name}}, {{kind}}, minimized{{status}}", {
    name: projectName(project),
    kind: translateUi({ expanded: "open project", card: "project card" }[kind]),
    status: status ? `, ${status}` : "",
  });
}
/** Whether a window is drawn: a route-bound window only shows while its route is open. */
export function isRoomWindowDisplayed(window: RoomWindowState, routeWindowId?: string) {
  if (!isRoomWindowShown(window)) return false;
  return !isRoomRouteWindow(window.id) || window.id === routeWindowId;
}
export function roomProjectPlacement(
  windows: readonly RoomWindowState[],
  projectId: string,
  activeProjectId?: string,
) {
  const card = windows.find((window) => window.id === `project:${projectId}`);
  const expanded = windows.find((window) => window.id === `detail:${projectId}`);
  const cardState = card?.closed ? "Closed" : card?.minimized ? "In the dock" : "On the desktop";
  const expandedState = !expanded
    ? ""
    : isRoomWindowDisplayed(expanded, activeProjectId && `detail:${activeProjectId}`)
      ? "open now"
      : isRoomWindowInDock(expanded)
        ? "open project in the dock"
        : "";
  return {
    cardClosed: cardState === "Closed",
    label: [translateUi(cardState), translateUi(expandedState)].filter(Boolean).join(" · "),
  };
}
