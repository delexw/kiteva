import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import { XProvider } from "@ant-design/x";
import { ConfigProvider, Table } from "antd";
import { Store } from "../src/server/jobs/store";
import { registerRoomRoutes } from "../src/server/room/routes";
import { RoomStateSchema } from "../src/shared/room";
import { roomColors, roomTheme, studioTheme } from "../src/client/theme";
import { appRoute } from "../src/client/lib/app-route";
import {
  isRoomUtilityPage,
  rememberRoomUtilityPath,
  roomLauncherUtilities,
  roomUtilities,
  roomUtilityPage,
  roomUtilityPath,
  roomUtilityWindowId,
} from "../src/client/room/utility-windows";
import {
  autoRoomLayout,
  isRoomRouteWindow,
  keepRoomWindowInView,
  roomWindowPlacement,
} from "../src/client/room/window-layout";
import {
  arrangeRoomWindows,
  closeRoomWindow,
  isRoomWindowDisplayed,
  newRoomWindow,
  openRoomWindow,
  roomMobileFront,
} from "../src/client/room/window-lifecycle";
import { RoomDockUtility, RoomDockUtilityTile } from "../src/client/room/room-dock";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

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

it("opens every secondary route as a room tool window with the same URL", () => {
  const routes = {
    "/styles": "styles",
    "/styles/style-001": "styles",
    "/motions": "motions",
    "/technologies": "technologies",
    "/governance": "governance",
    "/projects/p1/storyboard": "storyboard",
  };
  for (const [path, page] of Object.entries(routes)) {
    expect(appRoute(path).page).toBe(page);
    expect(isRoomUtilityPage(appRoute(path).page)).toBe(true);
  }
  for (const page of ["create", "history"]) expect(isRoomUtilityPage(page)).toBe(false);
  expect(isRoomUtilityPage("toString")).toBe(false);
  expect(roomLauncherUtilities).toEqual(["styles", "motions", "technologies", "governance"]);
  expect(roomLauncherUtilities.map((page) => roomUtilities[page].path)).toEqual([
    "/styles",
    "/motions",
    "/technologies",
    "/governance",
  ]);
  expect(roomUtilityPage(roomUtilityWindowId("governance"))).toBe("governance");
  expect(roomUtilityPage("project:governance")).toBeUndefined();
  expect(roomUtilityPage("utility:unknown")).toBeUndefined();
});

it("shows a tool window only on its route and keeps it through minimize, close and Arrange", () => {
  const styles = newRoomWindow(roomUtilityWindowId("styles"));
  expect(isRoomRouteWindow(styles.id)).toBe(true);
  expect(isRoomWindowDisplayed(styles, roomUtilityWindowId("styles"))).toBe(true);
  expect(isRoomWindowDisplayed(styles, roomUtilityWindowId("motions"))).toBe(false);
  expect(isRoomWindowDisplayed(styles)).toBe(false);
  expect(isRoomWindowDisplayed(newRoomWindow("assistant"))).toBe(true);
  const placed = { ...styles, x: 480, y: 64, width: 720, height: 520, placement: "user" as const };
  const closed = closeRoomWindow([placed], styles.id);
  expect(isRoomWindowDisplayed(closed[0], styles.id)).toBe(false);
  const reopened = openRoomWindow(closed, styles.id)[0];
  expect(reopened).toMatchObject({ x: 480, y: 64, width: 720, height: 520, placement: "user" });
  expect(isRoomWindowDisplayed(reopened, styles.id)).toBe(true);
  const arranged = arrangeRoomWindows(
    [placed, ...closed.map((w) => ({ ...w, id: "utility:motions" }))],
    placed.id,
  );
  expect(arranged[0]).toMatchObject({ minimized: false, placement: "auto" });
  expect(arranged[1]).toMatchObject({ closed: true, minimized: false });
});

it("gives a tool window the large area beside the assistant", () => {
  const layout = autoRoomLayout(["assistant", "utility:technologies"], {
    width: 1280,
    height: 660,
  });
  const assistant = layout.get("assistant")!;
  const tool = layout.get("utility:technologies")!;
  expect(tool.x).toBeGreaterThan(assistant.x + assistant.width);
  expect(tool.x + tool.width).toBeLessThanOrEqual(1280);
  expect(tool.width).toBeGreaterThanOrEqual(720);
  expect(tool.height).toBeGreaterThanOrEqual(480);
});

it("shows a minimized tool window in the dock as an icon with restore and close", () => {
  const html = renderToStaticMarkup(
    <RoomDockUtility
      page="governance"
      title="Governance"
      onRestore={() => {}}
      onClose={() => {}}
    />,
  );
  const visibleText = html.replace(/<[^>]+>/g, "").trim();
  expect(visibleText).toBe("");
  expect(html).toContain('aria-label="Restore Governance, minimized"');
  expect(html).toContain('aria-label="Close Governance"');
  expect(html).toContain("lucide-shield-check");
  const restore = vi.fn();
  const close = vi.fn();
  const tile = RoomDockUtilityTile({
    page: "styles",
    title: "Style explorer",
    onRestore: restore,
    onClose: close,
    menuOpen: false,
    onMenuOpenChange: () => {},
  });
  find(tile, (props) => props["aria-label"] === "Close Style explorer").props.onClick();
  find(
    tile,
    (props) => props["aria-label"] === "Restore Style explorer, minimized",
  ).props.onClick();
  expect([restore.mock.calls.length, close.mock.calls.length]).toEqual([1, 1]);
});

it("uses a style from the explorer in the new-idea draft without losing what was typed", async () => {
  const { chooseRoomDraftStyle, roomDraftRequest } = await import("../src/client/room/onboarding");
  const typed = {
    step: 3,
    request: { instructions: "A lantern festival film", selectedStyleIds: ["style-002"] },
    assets: [{ id: "a", originalName: "brief.pdf", kind: "", bytes: 10 }],
  };
  const next = chooseRoomDraftStyle(typed, "style-001");
  expect(next.step).toBe(3);
  expect(next.assets).toEqual(typed.assets);
  expect(roomDraftRequest(next)).toMatchObject({
    instructions: "A lantern festival film",
    selectedStyleIds: ["style-001"],
  });
  expect(roomDraftRequest(chooseRoomDraftStyle(undefined, "style-001")).selectedStyleIds).toEqual([
    "style-001",
  ]);
});

it("reopens a minimized storyboard at its project and job after a reload and a server restart", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "room-storyboard-"));
  folders.push(folder);
  const filename = path.join(folder, "room.sqlite");
  const id = roomUtilityWindowId("storyboard");
  const address = "/projects/p1/storyboard?job=job-2";
  const shown = rememberRoomUtilityPath(openRoomWindow([], id), "storyboard", address);
  expect(rememberRoomUtilityPath(shown, "storyboard", address)).toBe(shown);
  const minimized = shown.map((window) => ({ ...window, minimized: true }));
  const save = async (store: Store) => {
    const app = Fastify();
    await registerRoomRoutes(app, store, folder);
    return app;
  };
  const store = new Store(filename);
  const first = await save(store);
  const saved = await first.inject({
    method: "PATCH",
    url: "/api/room",
    payload: { client: "tab", baseRevision: 0, windows: { [id]: minimized[0] } },
  });
  expect(saved.statusCode).toBe(200);
  await first.close();
  store.close();
  const restarted = new Store(filename);
  const second = await save(restarted);
  try {
    const room = RoomStateSchema.parse((await second.inject({ url: "/api/room" })).json());
    const storyboard = room.windows.find((window) => window.id === id)!;
    expect(storyboard).toMatchObject({ minimized: true, path: address });
    expect(roomUtilityPath(storyboard)).toBe(address);
    expect(appRoute(roomUtilityPath(storyboard)!.split("?")[0])).toMatchObject({
      page: "storyboard",
      projectId: "p1",
    });
  } finally {
    await second.close();
    restarted.close();
  }
});

it("reopens other tool windows at their last address, or their home page", () => {
  const styles = newRoomWindow(roomUtilityWindowId("styles"));
  expect(roomUtilityPath(styles)).toBe("/styles");
  expect(roomUtilityPath(newRoomWindow(roomUtilityWindowId("storyboard")))).toBeUndefined();
  const [detail, assistant] = rememberRoomUtilityPath(
    [styles, newRoomWindow("assistant")],
    "styles",
    "/styles/style-001",
  );
  expect(roomUtilityPath(detail)).toBe("/styles/style-001");
  expect(assistant.path).toBeUndefined();
  expect(roomUtilityPath(assistant)).toBeUndefined();
  expect(() =>
    RoomStateSchema.parse({ windows: [{ ...styles, path: "https://example.com/styles" }] }),
  ).toThrow();
});

it("opens tool windows wide again when they were saved while the room measured no width", () => {
  const area = { width: 1280, height: 660 };
  const pinned = {
    ...newRoomWindow(roomUtilityWindowId("motions")),
    x: 0,
    y: 32,
    width: 280,
    height: 991.6953125,
    placement: "user" as const,
  };
  expect(roomWindowPlacement(pinned)).toBe("auto");
  const tile = autoRoomLayout([pinned.id], area).get(pinned.id)!;
  expect(keepRoomWindowInView({ ...pinned, ...tile }, area)).toMatchObject({
    x: 24,
    width: 1232,
    height: 540,
  });
  expect(roomWindowPlacement({ ...pinned, x: 48 })).toBe("user");
  expect(roomWindowPlacement({ ...pinned, width: 320 })).toBe("user");
  expect(roomWindowPlacement({ ...pinned, id: "assistant" })).toBe("user");
});

it("draws room tables dark even inside the light studio theme", () => {
  const cache = createCache();
  renderToString(
    <StyleProvider cache={cache}>
      <ConfigProvider theme={studioTheme}>
        <XProvider theme={roomTheme}>
          <Table
            columns={[{ title: "Name", dataIndex: "name" }]}
            dataSource={[{ key: 1, name: "Remotion" }]}
            expandable={{ expandedRowRender: () => "Details" }}
          />
        </XProvider>
      </ConfigProvider>
    </StyleProvider>,
  );
  const css = extractStyle(cache, { plain: true });
  const token = (name: string) =>
    css.match(new RegExp(`--ant-table-${name}:([^;}]+)`, "i"))?.[1].toUpperCase();
  expect(token("header-bg")).toBe(roomColors.inset);
  expect(token("header-color")).toBe(roomColors.text.toUpperCase());
  expect(token("row-expanded-bg")).toBe(roomColors.inset);
  expect(css.toUpperCase()).not.toContain("#F5F7FB");
});

it("fills a phone with the open tool or project page, however that page was reached", () => {
  const shown = ["assistant", "library", "utility:governance"];
  expect(roomMobileFront(shown, undefined, "utility:governance")).toBe("utility:governance");
  expect(roomMobileFront(shown, "assistant", "utility:governance")).toBe("assistant");
  expect(roomMobileFront(shown, "utility:styles", "utility:governance")).toBe("utility:governance");
  expect(roomMobileFront(["assistant", "detail:p1"], undefined, "detail:p1")).toBe("detail:p1");
  expect(roomMobileFront(["assistant"], undefined, "utility:motions")).toBeUndefined();
  expect(roomMobileFront(shown)).toBeUndefined();
});
