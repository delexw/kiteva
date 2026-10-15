import { expect, it } from "vitest";
import sharp from "sharp";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareBriefImage, prepareBriefImages } from "../src/server/requests/brief-images";

it("uses Pica for oversized images, preserving aspect ratio, alpha, and original bytes", async () => {
  const original = await sharp({
    create: {
      width: 3000,
      height: 1500,
      channels: 4,
      background: { r: 20, g: 100, b: 180, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const copy = Buffer.from(original);
  const result = await prepareBriefImage(original);
  expect(result).toMatchObject({
    resized: true,
    width: 2560,
    height: 1280,
    originalWidth: 3000,
    originalHeight: 1500,
  });
  expect(original).toEqual(copy);
  const metadata = await sharp(result.image).metadata();
  expect(metadata).toMatchObject({ format: "png", width: 2560, height: 1280, hasAlpha: true });
  const pixel = await sharp(result.image)
    .extract({ left: 100, top: 100, width: 1, height: 1 })
    .raw()
    .toBuffer();
  expect(pixel.subarray(0, 3)).toEqual(Buffer.from([20, 100, 180]));
  expect(pixel[3]).toBeGreaterThanOrEqual(127);
  expect(pixel[3]).toBeLessThanOrEqual(128);
});
it("does not upscale or recompress an image already suitable for inspection", async () => {
  const original = await sharp({
    create: { width: 315, height: 204, channels: 3, background: "#eeeeee" },
  })
    .jpeg()
    .toBuffer();
  const result = await prepareBriefImage(original);
  expect(result.resized).toBe(false);
  expect(result.image).toBe(original);
  expect(result).toMatchObject({ width: 315, height: 204 });
});
it("applies EXIF orientation before calculating the resized dimensions", async () => {
  const original = await sharp({
    create: { width: 3000, height: 1500, channels: 3, background: "#123456" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const result = await prepareBriefImage(original);
  expect(result).toMatchObject({
    width: 1280,
    height: 2560,
    originalWidth: 1500,
    originalHeight: 3000,
  });
  expect((await sharp(result.image).metadata()).orientation).toBeUndefined();
});
it("creates separate inspection copies and falls back to the original without blocking preparation", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "brief-images-"));
  try {
    await mkdir(path.join(workspace, "assets"));
    const original = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: "#abcdef" },
    })
      .png()
      .toBuffer();
    await writeFile(path.join(workspace, "assets/reference.png"), original);
    await writeFile(path.join(workspace, "assets/unsupported.png"), "Unreadable image");
    const images = await prepareBriefImages(
      workspace,
      ["reference.png", "unsupported.png"],
      new AbortController().signal,
    );
    expect(images[0]).toMatchObject({
      originalPath: "assets/reference.png",
      inspectionPath: "brief-images/reference.png.png",
      resized: true,
      resizer: "pica/mks2013",
    });
    expect(images[1]).toMatchObject({ inspectionPath: "assets/unsupported.png", resized: false });
    expect(await readFile(path.join(workspace, "assets/reference.png"))).toEqual(original);
    const manifest = JSON.parse(await readFile(path.join(workspace, "brief-images.json"), "utf8"));
    expect(manifest.instruction).toContain(
      "Never use a smaller inspection copy as the production asset",
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareBriefImages(workspace, ["reference.png"], controller.signal),
    ).rejects.toThrow();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
