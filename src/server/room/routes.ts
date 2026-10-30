import type { FastifyInstance, FastifyRequest } from "fastify";
import sharp from "sharp";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { RoomPatchSchema, RoomStateSchema } from "../../shared/room";
import { roomWallpaperExtensions } from "../../shared/room-appearance";
import { CodedError } from "../../shared/errors";
import { validateAssetLimits } from "../../shared/asset-limits";
import { briefSectionFileAccept } from "../../shared/brief-sections";
import { inspectAssetLimits } from "../requests/asset-limits";
import { appRoot, webPort } from "../runtime/config";
import type { Store } from "../jobs/store";
import type { Asset } from "../../shared/contracts";

const shelfExtensions = new Set(Object.values(briefSectionFileAccept).join(",").split(","));
const wallpaperTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const withoutLocation = ({ path: _path, name: _name, ...asset }: Asset) => asset;

async function receiveRoomUpload(
  req: FastifyRequest,
  store: Store,
  folder: string,
  extensions: ReadonlySet<string>,
  unsupported: string,
  verify?: (buffer: Buffer) => Promise<void>,
) {
  const file = await req.file();
  if (!file) throw new CodedError("FILE_REQUIRED", "Choose a file");
  const extension = path.extname(file.filename).toLowerCase();
  if (!extensions.has(extension)) throw new CodedError("FILE_TYPE_UNSUPPORTED", unsupported);
  const buffer = await file.toBuffer();
  if (file.file.truncated) throw new CodedError("FILE_TOO_LARGE", "File exceeds its size limit");
  await verify?.(buffer);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const existing = store.assetByHash(sha256);
  if (existing && existsSync(existing.path)) return { asset: existing, duplicate: true };
  const id = randomUUID();
  const name = id + extension;
  const asset: Asset = {
    id,
    name,
    originalName: path.basename(file.filename),
    path: path.join(folder, name),
    kind: file.mimetype,
    bytes: buffer.length,
    sha256,
  };
  validateAssetLimits([asset]);
  await writeFile(asset.path, buffer, { mode: 0o600 });
  try {
    await inspectAssetLimits(asset, buffer);
    store.asset(asset);
  } catch (error) {
    await rm(asset.path, { force: true });
    throw error;
  }
  return { asset, duplicate: false };
}
async function verifyWallpaper(buffer: Buffer) {
  const image = await sharp(buffer)
    .metadata()
    .catch(() => undefined);
  if (!image?.width || !image.height || !["png", "jpeg", "webp"].includes(image.format || ""))
    throw new CodedError("FILE_UNREADABLE", "That image could not be read. Try a PNG, JPG or WebP");
}

export async function registerRoomRoutes(
  app: FastifyInstance,
  store: Store,
  libraryFolder = path.join(appRoot, "user-data", "room", "library"),
) {
  app.addHook("onRequest", async (req) => {
    if (!req.url.startsWith("/api/room")) return;
    if (!["127.0.0.1", "localhost", "["].includes(req.headers.host?.split(":")[0] || ""))
      throw new CodedError("ACCESS_DENIED", "Local host required", 403);
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) {
      const allowed = new Set([`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`]);
      if (!allowed.has(origin))
        throw new CodedError("ACCESS_DENIED", "Foreign origin rejected", 403);
    }
  });
  const folder = libraryFolder;
  await mkdir(folder, { recursive: true, mode: 0o700 });
  app.get("/api/room", async () => RoomStateSchema.parse(store.room()));
  app.patch("/api/room", async (req) => store.patchRoom(RoomPatchSchema.parse(req.body)));
  app.get("/api/room/library", async () => store.library().map(withoutLocation));
  app.post("/api/room/library", async (req) => {
    const { asset, duplicate } = await receiveRoomUpload(
      req,
      store,
      folder,
      shelfExtensions,
      "Use a document, image or audio file",
    );
    store.addLibraryAsset(asset.id);
    return { ...withoutLocation(asset), ...(duplicate ? { duplicate } : {}) };
  });
  app.get("/api/room/wallpapers", async () => store.wallpapers().map(withoutLocation));
  app.post("/api/room/wallpapers", async (req) => {
    const { asset } = await receiveRoomUpload(
      req,
      store,
      folder,
      new Set(roomWallpaperExtensions),
      "Use a PNG, JPG or WebP image",
      verifyWallpaper,
    );
    store.addWallpaper(asset.id);
    return withoutLocation(asset);
  });
  app.delete<{ Params: { id: string } }>("/api/room/wallpapers/:id", async (req) => {
    store.removeWallpaper(req.params.id);
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>("/api/room/wallpapers/:id/file", async (req, reply) => {
    const asset = store.wallpapers().find((item) => item.id === req.params.id);
    const type = asset && wallpaperTypes[path.extname(asset.name).toLowerCase()];
    if (!asset || !type || !existsSync(asset.path))
      throw new CodedError("NOT_FOUND", "Wallpaper not found", 404);
    return reply
      .header("Cache-Control", "private, max-age=86400")
      .header("X-Content-Type-Options", "nosniff")
      .type(type)
      .send(await readFile(asset.path));
  });
  app.patch<{ Params: { id: string } }>("/api/room/library/:id", async (req) => {
    const { originalName } = z
      .object({ originalName: z.string().trim().min(1).max(200) })
      .parse(req.body);
    if (!store.library().some((asset) => asset.id === req.params.id))
      throw new CodedError("NOT_FOUND", "Material not found", 404);
    store.renameLibraryAsset(req.params.id, path.basename(originalName));
    return { ok: true };
  });
  // Removing a shelf entry never deletes a file referenced by a project or draft.
  app.delete<{ Params: { id: string } }>("/api/room/library/:id", async (req) => {
    store.removeLibraryAsset(req.params.id);
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>("/api/room/library/:id/file", async (req, reply) => {
    const asset = store.library().find((item) => item.id === req.params.id);
    if (!asset) throw new CodedError("NOT_FOUND", "Material not found", 404);
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(asset.originalName || asset.name)}`,
    );
    return reply.type("application/octet-stream").send(await readFile(asset.path));
  });
}
