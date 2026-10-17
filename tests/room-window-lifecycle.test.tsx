import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Store } from "../src/server/jobs/store";
import { RequestSchema, type GenerationJob, type Run } from "../src/shared/contracts";
import { RoomStateSchema, type RoomWindowState } from "../src/shared/room";
import {
  arrangeRoomWindows,
  isRoomWindowDisplayed,
  closeRoomWindow,
  ensureRoomWindows,
  isRoomWindowInDock,
  isRoomWindowShown,
  newRoomWindow,
  openRoomWindow,
  roomDockLabel,
  roomProjectInitials,
  roomProjectPlacement,
  roomProjectTone,
  showAllProjectWindows,
} from "../src/client/room/window-lifecycle";
import {
  RoomDockProject,
  RoomDockProjectTile,
  isDockMenuKey,
  RoomProjectsLauncher,
  RoomSaveStatusIcon,
} from "../src/client/room/room-dock";

const folders: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
const project = (id: string, change: Partial<Run> = {}): Run => ({
  id,
  createdAt: "2026-01-01",
  phase: "ready",
  request: RequestSchema.parse({ instructions: `Story about ${id}` }),
  candidates: [],
  jobs: [],
  ...change,
});
const job = (phase: GenerationJob["phase"]): GenerationJob => ({
  id: `job-${phase}`,
  runId: "a",
  candidateId: "c",
  kind: "preview",
  phase,
  duration: 3,
  workspace: "/tmp/example",
  model: "example",
});
const windows = (): RoomWindowState[] => [
  newRoomWindow("assistant"),
  newRoomWindow("library"),
  { ...newRoomWindow("project:a"), x: 300, y: 200, placement: "user" },
  newRoomWindow("project:b"),
  newRoomWindow("detail:a"),
];
const byId = (list: readonly RoomWindowState[], id: string) =>
  list.find((window) => window.id === id)!;
const find = (node: ReactNode, test: (props: Record<string, unknown>) => boolean): any => {
  if (!isValidElement(node)) return undefined;
  const props = (node as ReactElement<Record<string, unknown>>).props;
  if (test(props)) return node;
  const children = props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child as ReactNode, test);
    if (found) return found;
  }
};

it("closes a window off the desktop and out of the dock, keeping its place, and reopens it", () => {
  const closed = closeRoomWindow(windows(), "project:a");
  const card = byId(closed, "project:a");
  expect(isRoomWindowShown(card)).toBe(false);
  expect(isRoomWindowInDock(card)).toBe(false);
  expect(card).toMatchObject({ x: 300, y: 200, placement: "user", closed: true });
  expect(byId(closed, "detail:a")).toEqual(newRoomWindow("detail:a"));
  expect(closed.length).toBe(windows().length);
  const reopened = byId(openRoomWindow(closed, "project:a"), "project:a");
  expect(isRoomWindowShown(reopened)).toBe(true);
  expect(reopened).toMatchObject({ x: 300, y: 200, placement: "user" });
  const minimized = { ...byId(windows(), "project:b"), minimized: true };
  expect(isRoomWindowInDock(minimized)).toBe(true);
  const closedFromDock = byId(closeRoomWindow([minimized], "project:b"), "project:b");
  expect([closedFromDock.minimized, closedFromDock.closed]).toEqual([false, true]);
});

it("keeps closed windows closed through reload, project refresh and Arrange", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "room-lifecycle-"));
  folders.push(folder);
  const filename = path.join(folder, "room.sqlite");
  const store = new Store(filename);
  const state = RoomStateSchema.parse({
    windows: closeRoomWindow(closeRoomWindow(windows(), "project:a"), "assistant"),
    drafts: { new: { step: 2, request: { instructions: "A draft that must survive" } } },
  });
  store.saveRoom(state);
  store.close();
  const reopened = new Store(filename);
  const restored = reopened.room();
  reopened.close();
  expect(byId(restored.windows, "project:a").closed).toBe(true);
  expect(restored.drafts.new.request.instructions).toBe("A draft that must survive");
  const refreshed = ensureRoomWindows(restored.windows, ["a", "b", "c"], true);
  expect(byId(refreshed, "project:a").closed).toBe(true);
  expect(byId(refreshed, "assistant").closed).toBe(true);
  expect(isRoomWindowShown(byId(refreshed, "project:c"))).toBe(true);
  expect(ensureRoomWindows(refreshed, ["a", "b", "c"], true)).toBe(refreshed);
  const arranged = arrangeRoomWindows([
    ...refreshed,
    { ...newRoomWindow("project:d"), minimized: true },
  ]);
  expect(byId(arranged, "project:a")).toMatchObject({ closed: true, minimized: false });
  expect(isRoomWindowInDock(byId(arranged, "project:d"))).toBe(true);
  expect(isRoomWindowInDock(byId(arranged, "detail:a"))).toBe(false);
});

it("arranges only displayed windows and preserves inactive and minimized window state", () => {
  const active = { ...newRoomWindow("detail:a"), maximized: true, placement: "user" as const };
  const inactive = { ...newRoomWindow("utility:Motion Graphics"), placement: "user" as const };
  const minimized = { ...newRoomWindow("project:b"), minimized: true, placement: "user" as const };
  const closed = { ...newRoomWindow("project:c"), closed: true };
  const arranged = arrangeRoomWindows([active, inactive, minimized, closed], active.id);
  expect(arranged[0]).toMatchObject({ maximized: false, minimized: false, placement: "auto" });
  expect(arranged[1]).toBe(inactive);
  expect(arranged[2]).toBe(minimized);
  expect(arranged[3]).toBe(closed);
});

it("reopens only on an explicit choice: a project from the list, Show all, or its direct link", () => {
  const closed = closeRoomWindow(
    closeRoomWindow(closeRoomWindow(windows(), "project:a"), "detail:a"),
    "assistant",
  );
  expect(roomProjectPlacement(closed, "a").label).toBe("Closed");
  expect(roomProjectPlacement(closed, "b").label).toBe("On the desktop");
  expect(
    roomProjectPlacement([{ ...newRoomWindow("project:b"), minimized: true }], "b").label,
  ).toBe("In the dock");
  const all = showAllProjectWindows(closed, ["a", "b"]);
  expect(isRoomWindowShown(byId(all, "project:a"))).toBe(true);
  expect(byId(all, "assistant").closed).toBe(true);
  expect(byId(all, "detail:a").closed).toBe(true);
  expect(isRoomWindowShown(byId(openRoomWindow(closed, "detail:a"), "detail:a"))).toBe(true);
  expect(JSON.stringify(byId(openRoomWindow(closed, "detail:a"), "detail:a"))).not.toContain(
    "closed",
  );
});

it("shows a minimized project in the dock as an icon with its name only in labels", () => {
  const working = project("a", {
    phase: "generating",
    jobs: [job("generating")],
    request: RequestSchema.parse({ instructions: "From Spark to Showtime" }),
  });
  const html = renderToStaticMarkup(
    <RoomDockProject
      project={working}
      window={{ ...newRoomWindow("detail:a"), minimized: true }}
      onRestore={() => {}}
      onClose={() => {}}
    />,
  );
  const visibleText = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  expect(visibleText).toBe(roomProjectInitials("From Spark to Showtime"));
  expect(html).toContain(`aria-label="${roomDockLabel(working, "expanded")}"`);
  expect(roomDockLabel(working, "expanded")).toMatch(
    /^Restore .+, open project, minimized, working$/,
  );
  expect(html).toContain('class="room-dock-dot is-working"');
  expect(html).toContain("lucide-maximize-2");
  expect(html).toMatch(/aria-label="Close [^"]+"/);
  expect(roomProjectInitials("From Spark to Showtime")).toBe("FS");
  expect(roomProjectInitials("Teamtube")).toBe("TE");
  expect(roomProjectTone("a")).toBe(roomProjectTone("a"));
});

it("closes from the dock without restoring or calling the server", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const restore = vi.fn();
  const close = vi.fn();
  const menuOpen = vi.fn();
  const element = RoomDockProjectTile({
    project: project("a"),
    window: { ...newRoomWindow("project:a"), minimized: true },
    onRestore: restore,
    onClose: close,
    menuOpen: false,
    onMenuOpenChange: menuOpen,
  });
  const closeButton = find(element, (props) =>
    String(props["aria-label"] || "").startsWith("Close "),
  );
  closeButton.props.onClick();
  expect([close.mock.calls.length, restore.mock.calls.length]).toEqual([1, 0]);
  const menu = (
    element as ReactElement<{
      menu: { items: { key: string }[]; onClick: (info: { key: string }) => void };
    }>
  ).props.menu;
  expect(menu.items.map((item) => item.key)).toEqual(["restore", "close"]);
  menu.onClick({ key: "restore" });
  expect(restore).toHaveBeenCalledTimes(1);
  expect(menuOpen).toHaveBeenLastCalledWith(false);
  expect(fetch).not.toHaveBeenCalled();
});

it("lists every project with where it is, and reopens a closed one from the Projects launcher", () => {
  const show = vi.fn();
  const showAll = vi.fn();
  const projects = [project("a"), project("b"), project("c")];
  const list = [
    ...closeRoomWindow(windows(), "project:a").filter((window) => window.id !== "detail:a"),
    { ...newRoomWindow("project:c"), minimized: true },
  ];
  const element = RoomProjectsLauncher({
    projects,
    windows: list,
    onShow: show,
    onShowAll: showAll,
  });
  const menu = (element as ReactElement<{ menu: any }>).props.menu;
  const rows = menu.items[0].children;
  expect(rows.map((row: { key: string; title: string }) => [row.key, row.title])).toEqual([
    ["a", "Story about a · Closed"],
    ["b", "Story about b · On the desktop"],
    ["c", "Story about c · In the dock"],
  ]);
  expect(menu.items.at(-1)).toMatchObject({ key: "show-all", disabled: false });
  menu.onClick({ key: "a" });
  menu.onClick({ key: "show-all" });
  expect(show).toHaveBeenCalledWith(projects[0]);
  expect(showAll).toHaveBeenCalledTimes(1);
  expect(renderToStaticMarkup(element)).toContain(
    'aria-label="Projects, 1 closed. Show a project on the desktop"',
  );
});

it("reports saving as a small icon with spoken text, and keeps a retry when saving fails", () => {
  const saved = renderToStaticMarkup(
    <RoomSaveStatusIcon status="saved" needsChoice={false} uploading={false} onRetry={() => {}} />,
  );
  expect(saved).toMatch(/role="status"/);
  expect(saved).toContain('<span class="room-sr-only">Saved on this computer</span>');
  const failed = renderToStaticMarkup(
    <RoomSaveStatusIcon status="failed" needsChoice={false} uploading onRetry={() => {}} />,
  );
  expect(failed).toContain('aria-label="Room changes not saved. Retry saving"');
  expect(failed).toContain("Adding to your shelf…");
  expect(
    renderToStaticMarkup(
      <RoomSaveStatusIcon status="unsaved" needsChoice uploading={false} onRetry={() => {}} />,
    ),
  ).toContain("Needs your choice");
});

it("calls a project closed when its card is closed and its open-project window is not on screen", () => {
  const saved: RoomWindowState[] = [
    newRoomWindow("project:t"),
    { ...newRoomWindow("project:s"), closed: true },
    newRoomWindow("detail:t"),
    newRoomWindow("library"),
    newRoomWindow("assistant"),
    newRoomWindow("detail:s"),
  ];
  expect(
    saved.filter((window) => isRoomWindowDisplayed(window)).map((window) => window.id),
  ).toEqual(["project:t", "library", "assistant"]);
  expect(roomProjectPlacement(saved, "s")).toEqual({ cardClosed: true, label: "Closed" });
  expect(roomProjectPlacement(saved, "t").label).toBe("On the desktop");
  expect(roomProjectPlacement(saved, "s", "s").label).toBe("Closed · open now");
  expect(
    roomProjectPlacement(
      saved.map((window) => (window.id === "detail:s" ? { ...window, minimized: true } : window)),
      "s",
    ).label,
  ).toBe("Closed · open project in the dock");
  const projects = [project("t"), project("s")];
  const element = RoomProjectsLauncher({
    projects,
    windows: saved,
    onShow: () => {},
    onShowAll: () => {},
  });
  const menu = (element as ReactElement<{ menu: any }>).props.menu;
  expect(menu.items[0].children.map((row: { title: string }) => row.title)).toEqual([
    "Story about t · On the desktop",
    "Story about s · Closed",
  ]);
  expect(menu.items.at(-1)).toMatchObject({ key: "show-all", disabled: false });
  expect(renderToStaticMarkup(element)).toContain("Projects, 1 closed");
  const reopened = showAllProjectWindows(saved, ["t", "s"]);
  expect(isRoomWindowDisplayed(byId(reopened, "project:s"))).toBe(true);
  expect(byId(reopened, "detail:s")).toEqual(byId(saved, "detail:s"));
});

it("opens the dock tile's Restore / Close menu from the keyboard on every platform", () => {
  expect(isDockMenuKey({ key: "F10", shiftKey: true })).toBe(true);
  expect(isDockMenuKey({ key: "ContextMenu", shiftKey: false })).toBe(true);
  expect(isDockMenuKey({ key: "F10", shiftKey: false })).toBe(false);
  expect(isDockMenuKey({ key: "Enter", shiftKey: true })).toBe(false);
  const opened = vi.fn();
  const element = RoomDockProjectTile({
    project: project("a"),
    window: { ...newRoomWindow("project:a"), minimized: true },
    onRestore: () => {},
    onClose: () => {},
    menuOpen: true,
    onMenuOpenChange: opened,
  }) as ReactElement<{ open: boolean; autoFocus: boolean; children: ReactElement<any> }>;
  expect([element.props.open, element.props.autoFocus]).toEqual([true, true]);
  const tile = element.props.children;
  let prevented = 0;
  for (const event of [
    { key: "Tab", shiftKey: false },
    { key: "F10", shiftKey: true },
    { key: "ContextMenu", shiftKey: false },
  ])
    tile.props.onKeyDown({ ...event, preventDefault: () => prevented++ });
  expect([opened.mock.calls, prevented]).toEqual([[[true], [true]], 2]);
  expect(
    find(element, (props) => String(props["aria-label"] || "").startsWith("Close ")),
  ).toBeTruthy();
});
