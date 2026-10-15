import { afterEach, expect, it } from "vitest";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/server/jobs/store";
import { registerRoomRoutes } from "../src/server/room/routes";
import { apiErrorHandler } from "../src/server/runtime/api-errors";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomAppearanceSlider } from "../src/client/room/room-appearance";
import {
  RoomAppearanceSchema,
  changeRoomAppearance,
  defaultRoomAppearance,
  roomWallpaperExtensions,
  roomWallpaperPresets,
} from "../src/shared/room-appearance";
import {
  RoomStateSchema,
  applyRoomPatch,
  hasRoomChanges,
  rebaseRoom,
  roomChanges,
} from "../src/shared/room";
import { roomWallpaper, roomWallpaperImageUrl } from "../src/client/room/wallpapers";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
function upload(name: string, type: string, body: Buffer) {
  const boundary = "test-boundary";
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`,
      ),
      body,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}
async function roomApp(store: Store) {
  const folder = await mkdtemp(path.join(os.tmpdir(), "room-wallpaper-"));
  folders.push(folder);
  const app = Fastify();
  app.setErrorHandler(apiErrorHandler);
  await app.register(multipart);
  await registerRoomRoutes(app, store, folder);
  return app;
}
const png = () =>
  sharp({ create: { width: 24, height: 16, channels: 3, background: "#d9a07a" } })
    .png()
    .toBuffer();

it("starts on the original charcoal and repairs damaged or out-of-range settings", () => {
  expect(RoomStateSchema.parse({}).appearance).toEqual(defaultRoomAppearance);
  expect(defaultRoomAppearance).toMatchObject({ source: "preset", preset: "charcoal" });
  expect(
    RoomAppearanceSchema.parse({ source: "image", preset: "neon", dim: 4, blur: -3, fit: "tile" }),
  ).toEqual({ source: "preset", preset: "charcoal", fit: "cover", dim: 0.7, blur: 0 });
  expect(RoomStateSchema.parse({ appearance: "broken" }).appearance).toEqual(defaultRoomAppearance);
  expect(roomWallpaperExtensions).toEqual([".png", ".jpg", ".jpeg", ".webp"]);
  const moods = roomWallpaperPresets.map((preset) => preset.mood);
  expect(moods.filter((mood) => mood === "warm").length).toBeGreaterThanOrEqual(3);
  expect(moods.filter((mood) => mood === "cool").length).toBeGreaterThanOrEqual(3);
});

it("maps a choice to wallpaper layers, dimming only what needs it and blurring only images", () => {
  const charcoal = roomWallpaper(defaultRoomAppearance);
  expect(charcoal.id).toBe("charcoal");
  expect(charcoal.variables).toMatchObject({ "--wallpaper-dim": "0", "--wallpaper-image": "none" });
  const lilac = roomWallpaper({ ...defaultRoomAppearance, preset: "lilac-mist", blur: 10 });
  expect(lilac.variables).toMatchObject({
    "--wallpaper-glow": "#b29fdc",
    "--wallpaper-dim": "0.25",
    "--wallpaper-blur": "0px",
  });
  const image = roomWallpaper({
    ...defaultRoomAppearance,
    source: "image",
    imageId: "a b",
    fit: "contain",
    blur: 6,
  });
  expect(image.id).toBe("image");
  expect(image.variables).toMatchObject({
    "--wallpaper-image": `url("${roomWallpaperImageUrl("a b")}")`,
    "--wallpaper-fit": "contain",
    "--wallpaper-blur": "6px",
  });
  expect(roomWallpaperImageUrl("a b")).toBe("/api/room/wallpapers/a%20b/file");
});

it("saves the desktop look on its own, without touching another tab's drafts or windows", () => {
  const base = RoomStateSchema.parse({
    windows: [{ id: "assistant", x: 24, y: 24, width: 400, height: 540 }],
    drafts: { new: { step: 1, request: { instructions: "First idea" } } },
  });
  const otherTab = applyRoomPatch(base, {
    client: "other",
    baseRevision: 0,
    windows: {},
    drafts: { new: { step: 2, request: { instructions: "Second idea" }, assets: [] } },
    questionDrafts: {},
    views: {},
    dismissedQuestions: [],
    force: [],
  }).state;
  const local = { ...base, appearance: { ...base.appearance, preset: "rose-clay" as const } };
  const changes = roomChanges(base, local);
  expect(hasRoomChanges(changes)).toBe(true);
  expect(changes).toMatchObject({ windows: {}, drafts: {}, appearance: { preset: "rose-clay" } });
  const saved = applyRoomPatch(otherTab, {
    ...changes,
    client: "this",
    baseRevision: 0,
    force: [],
  });
  expect(saved.conflicts).toEqual([]);
  expect(saved.state.appearance.preset).toBe("rose-clay");
  expect(saved.state.drafts.new.request).toEqual({ instructions: "Second idea" });
  expect(saved.state.windows).toEqual(base.windows);
  expect(rebaseRoom(otherTab, base, local).state.appearance.preset).toBe("rose-clay");
  expect(hasRoomChanges(roomChanges(base, base))).toBe(false);
});

it("keeps an uploaded wallpaper off the shelf, serves it safely and remembers it after reopening", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "room-wallpaper-db-"));
  folders.push(folder);
  const filename = path.join(folder, "room.sqlite");
  const store = new Store(filename);
  const app = await roomApp(store);
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/room/wallpapers",
      ...upload("evening.png", "image/png", await png()),
    });
    expect(response.statusCode).toBe(200);
    const asset = response.json();
    expect(asset).not.toHaveProperty("path");
    expect(store.library()).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/api/room/wallpapers" })).json()).toEqual([
      asset,
    ]);
    const file = await app.inject({ method: "GET", url: roomWallpaperImageUrl(asset.id) });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    const patched = await app.inject({
      method: "PATCH",
      url: "/api/room",
      payload: {
        client: "tab",
        baseRevision: 0,
        appearance: {
          source: "image",
          preset: "peach-dusk",
          imageId: asset.id,
          fit: "cover",
          dim: 0.4,
          blur: 4,
        },
      },
    });
    expect(patched.statusCode).toBe(200);
    store.close();
    const reopened = new Store(filename);
    expect(reopened.room().appearance).toMatchObject({
      source: "image",
      imageId: asset.id,
      dim: 0.4,
    });
    expect(reopened.wallpapers().map((item) => item.id)).toEqual([asset.id]);
    reopened.close();
  } finally {
    await app.close();
  }
});

it("rejects wallpapers that are not real PNG, JPG or WebP images and forgets removed ones", async () => {
  const store = new Store(":memory:");
  const app = await roomApp(store);
  try {
    const svg = await app.inject({
      method: "POST",
      url: "/api/room/wallpapers",
      ...upload("swirl.svg", "image/svg+xml", Buffer.from("<svg/>")),
    });
    expect(svg.statusCode).toBe(400);
    expect(svg.json().code).toBe("FILE_TYPE_UNSUPPORTED");
    const fake = await app.inject({
      method: "POST",
      url: "/api/room/wallpapers",
      ...upload("fake.png", "image/png", Buffer.from("not an image")),
    });
    expect(fake.statusCode).toBe(400);
    expect(fake.json().code).toBe("FILE_UNREADABLE");
    expect(store.wallpapers()).toEqual([]);
    const shelf = await app.inject({
      method: "POST",
      url: "/api/room/library",
      ...upload("evening.png", "image/png", await png()),
    });
    const shelved = shelf.json();
    const wallpaper = (
      await app.inject({
        method: "POST",
        url: "/api/room/wallpapers",
        ...upload("evening.png", "image/png", await png()),
      })
    ).json();
    expect(wallpaper.id).toBe(shelved.id);
    await app.inject({ method: "DELETE", url: `/api/room/wallpapers/${wallpaper.id}` });
    expect(store.wallpapers()).toEqual([]);
    expect(store.library().map((item) => item.id)).toEqual([shelved.id]);
    expect(store.getAsset(shelved.id)).toBeDefined();
    const gone = await app.inject({ method: "GET", url: roomWallpaperImageUrl(wallpaper.id) });
    expect(gone.statusCode).toBe(404);
  } finally {
    await app.close();
    store.close();
  }
});

it("keeps every earlier adjustment when changes arrive back to back, even mid-save", () => {
  const base = RoomStateSchema.parse({
    appearance: { source: "image", imageId: "picture", preset: "lilac-mist" },
  });
  let local = base;
  const adjust = (change: Partial<typeof base.appearance>) => {
    local = { ...local, appearance: changeRoomAppearance(local.appearance, change) };
  };
  adjust({ fit: "contain" });
  const sent = local;
  adjust({ dim: 0.3 });
  adjust({ dim: 0.35 });
  adjust({ blur: 2 });
  expect(local.appearance).toMatchObject({
    fit: "contain",
    dim: 0.35,
    blur: 2,
    imageId: "picture",
  });
  const server = RoomStateSchema.parse(
    applyRoomPatch(base, { ...roomChanges(base, sent), client: "tab", baseRevision: 0, force: [] })
      .state,
  );
  const shown = rebaseRoom(server, sent, local).state;
  expect(shown.appearance).toEqual(local.appearance);
  expect(hasRoomChanges(roomChanges(RoomStateSchema.parse(shown), shown))).toBe(false);
  expect(Object.keys(changeRoomAppearance(base.appearance, { imageId: "other" }))).toEqual(
    Object.keys(
      RoomStateSchema.parse({ appearance: { source: "image", imageId: "x" } }).appearance,
    ),
  );
});

it("names a slider handle after its visible caption", () => {
  const html = renderToStaticMarkup(
    <RoomAppearanceSlider
      id="room-wallpaper-dim"
      caption="Soften the background · 25%"
      min={0}
      max={0.7}
      value={0.25}
    />,
  );
  expect(html).toMatch(/<span id="room-wallpaper-dim">Soften the background · 25%<\/span>/);
  expect(html).toMatch(
    /role="slider"[^>]*aria-labelledby="room-wallpaper-dim"|aria-labelledby="room-wallpaper-dim"[^>]*role="slider"/,
  );
});
