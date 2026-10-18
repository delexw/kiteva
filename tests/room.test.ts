import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { Store } from "../src/server/jobs/store";
import { registerRoomRoutes } from "../src/server/room/routes";
import { apiErrorHandler } from "../src/server/runtime/api-errors";
import { RoomStateSchema } from "../src/shared/room";
import { VideoRequestSchema } from "../src/shared/domains/video";
import {
  autoRoomLayout,
  fitRoomWindow,
  keepRoomWindowInView,
  projectWidgetHeight,
  roomDockClearance,
  roomWindowPlacement,
  snapRoomWindow,
  type RoomGeometry,
} from "../src/client/room/window-layout";
import {
  initialRoomRequest,
  roomDraftFromProject,
  roomStepMaterialCounts,
  roomSubmission,
  switchRoomOutputType,
  toggleRoomAsset,
  toggleRoomDraftAsset,
} from "../src/client/room/onboarding";
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
it("persists room windows, onboarding and scoped reply drafts across database reopen", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "room-store-"));
  folders.push(folder);
  const filename = path.join(folder, "room.sqlite");
  const store = new Store(filename);
  const state = RoomStateSchema.parse({
    windows: [
      { id: "assistant", x: 20, y: 30, width: 440, height: 600 },
      { id: "library", x: 48, y: 64, width: 512, height: 416, placement: "user" },
    ],
    drafts: { new: { step: 3, request: { instructions: "A new story", assetIds: [] } } },
    questionDrafts: { "project:question": "Keep the original" },
  });
  store.saveRoom(state);
  store.close();
  const reopened = new Store(filename);
  expect(reopened.room()).toEqual(state);
  expect(reopened.room().windows[1].placement).toBe("user");
  reopened.close();
});
it("clamps restored windows, snaps moves, and arranges with usable sizes", () => {
  const window = {
    id: "example",
    x: 1700,
    y: 1200,
    width: 1200,
    height: 1000,
    minimized: false,
    maximized: false,
  };
  expect(fitRoomWindow(window, 800, 600)).toMatchObject({ x: 24, y: 24, width: 776, height: 576 });
  expect(
    snapRoomWindow(
      { ...window, x: 31, y: 49, width: 300, height: 200 },
      { width: 1000, height: 700 },
    ),
  ).toMatchObject({ x: 32, y: 48 });
});
const overlaps = (a: RoomGeometry, b: RoomGeometry) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
it.each([
  [1280, 1150],
  [1280, 740],
  [1440, 840],
  [1920, 1020],
])("arranges the default room at %ix%i without overlapping windows", (width, height) => {
  const ids = ["assistant", "library", "project:a", "project:b", "project:c"];
  const layout = autoRoomLayout(ids, { width, height });
  const placed = ids.map((id) => layout.get(id)!);
  for (const [index, window] of placed.entries()) {
    expect(window.x + window.width).toBeLessThanOrEqual(width - 24);
    expect(window.width).toBeGreaterThanOrEqual(280);
    for (const other of placed.slice(index + 1)) expect(overlaps(window, other)).toBe(false);
  }
  const assistant = layout.get("assistant")!;
  expect(assistant).toMatchObject({ x: 24 });
  expect(assistant.y + assistant.height).toBe(
    Math.max(24 + assistant.height, height - roomDockClearance),
  );
  const project = layout.get("project:a")!;
  expect(project.height).toBe(projectWidgetHeight(project.width));
});
it("keeps a tall saved window's title bar and composer above the dock on a short screen", () => {
  const saved = { x: 32, y: 384, width: 417, height: 703 };
  const shown = keepRoomWindowInView(saved, { width: 1280, height: 660 });
  expect(shown).toMatchObject({ x: 32, width: 417, height: 540, y: 24 });
  expect(shown.y + shown.height).toBe(660 - roomDockClearance);
  expect(keepRoomWindowInView(saved, { width: 1280, height: 1150 })).toEqual({
    ...saved,
    y: 1150 - roomDockClearance - 703,
  });
  expect(keepRoomWindowInView({ ...saved, y: 96 }, { width: 1280, height: 1150 })).toEqual({
    ...saved,
    y: 96,
  });
  const assistant = autoRoomLayout(["assistant"], { width: 1280, height: 660 }).get("assistant")!;
  expect(assistant.y + assistant.height).toBe(660 - roomDockClearance);
  const tall = autoRoomLayout(["assistant"], { width: 1280, height: 1150 }).get("assistant")!;
  expect(tall.y + tall.height).toBe(1150 - roomDockClearance);
});
it("gives an open project the space beside the assistant", () => {
  const layout = autoRoomLayout(["assistant", "project:a", "detail:a"], {
    width: 1280,
    height: 1000,
  });
  const assistant = layout.get("assistant")!;
  const detail = layout.get("detail:a")!;
  expect(overlaps(assistant, detail)).toBe(false);
  expect(detail.x + detail.width).toBe(1280 - 24);
});
it("lets old default window sizes follow the new arrangement but keeps resized ones", () => {
  const saved = (id: string, width: number, height: number) => ({
    id,
    x: 800,
    y: 160,
    width,
    height,
    minimized: false,
    maximized: false,
  });
  expect(roomWindowPlacement(saved("assistant", 440, 600))).toBe("auto");
  expect(roomWindowPlacement(saved("library", 720, 600))).toBe("auto");
  expect(roomWindowPlacement(saved("project:a", 384.3333, 480))).toBe("auto");
  expect(roomWindowPlacement(saved("assistant", 512, 704))).toBe("user");
  expect(roomWindowPlacement(saved("project:a", 432, 512))).toBe("user");
  expect(roomWindowPlacement({ ...saved("assistant", 440, 600), placement: "user" })).toBe("user");
  expect(roomWindowPlacement({ ...saved("project:a", 640, 640), placement: "auto" })).toBe("auto");
});
it("maps selected library materials to brief sections and enforces project limits only at selection", () => {
  let request = initialRoomRequest();
  const files = Array.from({ length: 9 }, (_, i) => ({
    id: `image-${i}`,
    originalName: `photo-${i}.png`,
    kind: "image/png",
    bytes: 10,
  }));
  for (const asset of files.slice(0, 8))
    request = toggleRoomAsset(
      request,
      asset,
      files.filter((file) => request.assetIds.includes(file.id)),
    );
  expect(request.requirements?.images.assetIds).toHaveLength(8);
  expect(() => toggleRoomAsset(request, files[8], files.slice(0, 8))).toThrow("8 images");
  request = toggleRoomAsset(request, files[0], files.slice(0, 8));
  expect(request.assetIds).toHaveLength(7);
  expect(request.requirements?.images.assetIds).not.toContain(files[0].id);
});
it("keeps more than a project's file limit on the shelf and preserves files after removing a shelf entry", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "room-library-"));
  folders.push(folder);
  const store = new Store(":memory:");
  const app = Fastify();
  await app.register(multipart);
  await registerRoomRoutes(app, store, folder);
  try {
    for (let i = 0; i < 13; i++) {
      const boundary = "test-boundary";
      const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes-${i}.txt"\r\nContent-Type: text/plain\r\n\r\nReference notes ${i}\r\n--${boundary}--\r\n`;
      const response = await app.inject({
        method: "POST",
        url: "/api/room/library",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).not.toHaveProperty("path");
    }
    const items = (await app.inject({ method: "GET", url: "/api/room/library" })).json();
    expect(items).toHaveLength(13);
    const id = items[0].id;
    const asset = store.getAsset(id)!;
    await app.inject({
      method: "PATCH",
      url: `/api/room/library/${id}`,
      payload: { originalName: "Renamed notes.txt" },
    });
    expect(store.getAsset(id)?.originalName).toBe("Renamed notes.txt");
    await app.inject({ method: "DELETE", url: `/api/room/library/${id}` });
    expect(store.library()).toHaveLength(12);
    expect(await readFile(asset.path, "utf8")).toMatch(/^Reference notes \d+$/);
    expect(store.getAsset(id)).toBeDefined();
    const denied = await app.inject({
      method: "PATCH",
      url: "/api/room",
      headers: { origin: "https://example.com" },
      payload: { client: "tab", baseRevision: 0 },
    });
    expect(denied.statusCode).toBe(403);
    const saved = await app.inject({
      method: "PATCH",
      url: "/api/room",
      payload: {
        client: "tab",
        baseRevision: 0,
        drafts: { new: { step: 2, request: { instructions: "My story" } } },
      },
    });
    expect(saved.statusCode).toBe(200);
    const room = (await app.inject({ method: "GET", url: "/api/room" })).json();
    expect(room.drafts.new.step).toBe(2);
    expect(room.revision).toBe(1);
    const other = await app.inject({
      method: "PATCH",
      url: "/api/room",
      payload: {
        client: "other-tab",
        baseRevision: 0,
        drafts: { new: { step: 4, request: { instructions: "Other words" } } },
        windows: { assistant: { id: "assistant", x: 0, y: 0, width: 400, height: 500 } },
      },
    });
    expect(other.json().conflicts).toEqual(["drafts:new"]);
    expect(other.json().state.drafts.new.step).toBe(2);
    expect(other.json().state.windows).toHaveLength(1);
  } finally {
    await app.close();
    store.close();
  }
});
const upload = (app: ReturnType<typeof Fastify>, filename: string, content: string) => {
  const boundary = "test-boundary";
  return app.inject({
    method: "POST",
    url: "/api/room/library",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`,
  });
};
it("reuses an identical upload instead of storing a duplicate, even after shelf removal", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "room-library-"));
  folders.push(folder);
  const store = new Store(":memory:");
  const app = Fastify();
  await app.register(multipart);
  await registerRoomRoutes(app, store, folder);
  try {
    const first = (await upload(app, "notes.txt", "Same notes")).json();
    const again = (await upload(app, "copy.txt", "Same notes")).json();
    expect(again).toMatchObject({ id: first.id, duplicate: true });
    expect(store.library()).toHaveLength(1);
    await app.inject({ method: "DELETE", url: `/api/room/library/${first.id}` });
    expect((await upload(app, "notes.txt", "Same notes")).json().id).toBe(first.id);
    expect(store.library()).toHaveLength(1);
    expect((await upload(app, "clip.mp4", "video")).statusCode).toBe(400);
  } finally {
    await app.close();
    store.close();
  }
});
it("switches between video and page without leaving fields the other type rejects", () => {
  const video = VideoRequestSchema.parse({
    instructions: "A launch story for our app",
    duration: 120,
    lyrics: { mode: "write" },
    candidateCount: 0,
    selectedStyleIds: ["style-001", "style-002", "style-003", "style-004", "style-005"],
  });

  const page = switchRoomOutputType(video, "page");
  expect(page).toMatchObject({ outputType: "page", viewport: "desktop" });
  expect(page).not.toHaveProperty("duration");
  expect(page).not.toHaveProperty("lyrics");
  expect(page).not.toHaveProperty("frameRate");
  expect(page.selectedStyleIds).toHaveLength(3);
  expect(roomSubmission(page)).toMatchObject({ outputType: "page", candidateCount: 0 });
  const back = switchRoomOutputType(page, "video");
  expect(back).not.toHaveProperty("viewport");
  expect(roomSubmission(back)).toMatchObject({
    outputType: "video",
    duration: "auto",
    resolution: "1080p",
    frameRate: 30,
    lyrics: { mode: "off" },
  });
  expect(
    roomSubmission({
      ...back,
      selectedStyleIds: [],
      candidateCount: 3,
      urls: [" https://example.com ", ""],
    }),
  ).toMatchObject({ candidateCount: 3, urls: ["https://example.com"] });
});
it("keeps materials that are not on the shelf visible and counted when editing a project", () => {
  const offShelf = { id: "a", originalName: "old-brief.pdf", kind: "", bytes: 10 };
  const draft = roomDraftFromProject(
    {
      ...initialRoomRequest(),
      assetIds: ["a"],
      candidateCount: 0,
      selectedStyleIds: ["style-001"],
    },
    [offShelf, { id: "b", originalName: "other.pdf", kind: "", bytes: 10 }],
  );
  expect(draft.assets).toEqual([offShelf]);
  expect(draft.request.candidateCount).toBe(5);
  let next = draft;
  for (const id of ["c", "d"])
    next = toggleRoomDraftAsset(next, { id, originalName: `${id}.pdf`, kind: "", bytes: 10 });
  expect(() =>
    toggleRoomDraftAsset(next, { id: "e", originalName: "e.pdf", kind: "", bytes: 10 }),
  ).toThrow("3 other files");
  next = toggleRoomDraftAsset(next, offShelf);
  expect(next.assets.map((asset) => asset.id)).toEqual(["c", "d"]);
  expect(roomStepMaterialCounts("main", next.assets)[0].label).toBe("Documents 2/3");
  expect(() =>
    toggleRoomDraftAsset(next, { id: "v", originalName: "clip.mp4", kind: "", bytes: 10 }),
  ).toThrow("can’t be used");
});
it("restores drafts saved before materials were tracked", () => {
  expect(RoomStateSchema.parse({ drafts: { new: { step: 1, request: {} } } }).drafts.new).toEqual({
    step: 1,
    stepLayout: "separate-speech",
    request: {},
    assets: [],
  });
});
it("answers a malformed room save with the same 400 error shape as the backend", async () => {
  const store = new Store(":memory:");
  const folder = await mkdtemp(path.join(os.tmpdir(), "room-library-"));
  folders.push(folder);
  const app = Fastify();
  app.setErrorHandler(apiErrorHandler);
  await registerRoomRoutes(app, store, folder);
  try {
    const response = await app.inject({ method: "PATCH", url: "/api/room", payload: {} });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_REQUEST");
    const localization = await app.inject({
      method: "POST",
      url: "/api/room/localize",
      payload: {},
    });
    expect(localization.statusCode).toBe(404);
  } finally {
    await app.close();
    store.close();
  }
});

it("migrates legacy draft steps once and persists their layout through room saves", () => {
  const store = new Store(":memory:");
  const legacy = {
    drafts: Object.fromEntries(
      [0, 4, 5, 6].map((step) => [
        `edit:${step}`,
        {
          step,
          request: { instructions: "Preserve my idea", speech: { mode: "off" } },
          assets: [],
        },
      ]),
    ),
  };
  const migrated = RoomStateSchema.parse(legacy);
  expect(Object.values(migrated.drafts).map((draft) => draft.step)).toEqual([0, 4, 6, 7]);
  for (const draft of Object.values(migrated.drafts)) {
    expect(draft.stepLayout).toBe("separate-speech");
    expect(draft.request).toEqual({ instructions: "Preserve my idea", speech: { mode: "off" } });
  }
  store.saveRoom(migrated);
  expect(store.room()).toEqual(migrated);
  const saved = store.patchRoom({
    client: "migration-test",
    baseRevision: migrated.revision,
    drafts: { "edit:5": { ...migrated.drafts["edit:5"], step: 5 } },
    windows: {},
    questionDrafts: {},
    views: {},
    dismissedQuestions: [],
    force: [],
  });
  expect(saved.conflicts).toEqual([]);
  expect(saved.state.drafts["edit:5"].step).toBe(5);
  expect(store.room().drafts["edit:5"].step).toBe(5);
  expect(RoomStateSchema.parse(store.room())).toEqual(store.room());
});

it("round-trips the new narration step through the room API after a legacy draft is loaded", async () => {
  const store = new Store(":memory:");
  store.saveRoom({
    ...RoomStateSchema.parse({}),
    drafts: { "edit:legacy": { step: 5, request: { instructions: "My saved story" }, assets: [] } },
  });
  const folder = await mkdtemp(path.join(os.tmpdir(), "room-migration-"));
  folders.push(folder);
  const app = Fastify();
  await registerRoomRoutes(app, store, folder);
  try {
    const loaded = (await app.inject({ method: "GET", url: "/api/room" })).json();
    expect(loaded.drafts["edit:legacy"]).toMatchObject({ step: 6, stepLayout: "separate-speech" });
    const saved = await app.inject({
      method: "PATCH",
      url: "/api/room",
      payload: {
        client: "editing-tab",
        baseRevision: loaded.revision,
        drafts: { "edit:legacy": { ...loaded.drafts["edit:legacy"], step: 5 } },
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().state.drafts["edit:legacy"]).toMatchObject({
      step: 5,
      stepLayout: "separate-speech",
    });
    const reloaded = (await app.inject({ method: "GET", url: "/api/room" })).json();
    expect(reloaded.drafts["edit:legacy"]).toMatchObject({
      step: 5,
      stepLayout: "separate-speech",
      request: { instructions: "My saved story" },
    });
  } finally {
    await app.close();
    store.close();
  }
});
