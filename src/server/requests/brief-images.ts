import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pica from "pica";

const maximumInspectionEdge = 2560;
const resizer = pica({ features: ["js", "wasm"] });

// These are inspection copies only. Production always retains the original file.
export async function prepareBriefImage(original: Buffer) {
  const metadata = await sharp(original).metadata();
  const width = metadata.autoOrient?.width || metadata.width;
  const height = metadata.autoOrient?.height || metadata.height;
  if (!width || !height) throw Error("Image dimensions could not be read");
  if (Math.max(width, height) <= maximumInspectionEdge)
    return {
      image: original,
      width,
      height,
      originalWidth: width,
      originalHeight: height,
      resized: false,
    };
  const scale = maximumInspectionEdge / Math.max(width, height);
  const toWidth = Math.max(1, Math.round(width * scale));
  const toHeight = Math.max(1, Math.round(height * scale));
  const { data, info } = await sharp(original)
    .rotate()
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const resized = await resizer.resizeBuffer({
    src: data,
    width: info.width,
    height: info.height,
    toWidth,
    toHeight,
    filter: "mks2013",
  });
  const image = await sharp(Buffer.from(resized), {
    raw: { width: toWidth, height: toHeight, channels: 4 },
  })
    .png()
    .toBuffer();
  return {
    image,
    width: toWidth,
    height: toHeight,
    originalWidth: width,
    originalHeight: height,
    resized: true,
  };
}

export async function prepareBriefImages(
  workspace: string,
  imageNames: string[],
  signal: AbortSignal,
) {
  await mkdir(path.join(workspace, "brief-images"), { recursive: true });
  const images = [];
  for (const name of imageNames) {
    signal.throwIfAborted();
    const originalPath = `assets/${name}`;
    const original = await readFile(path.join(workspace, originalPath));
    try {
      const prepared = await prepareBriefImage(original);
      const inspectionPath = prepared.resized ? `brief-images/${name}.png` : originalPath;
      if (prepared.resized) await writeFile(path.join(workspace, inspectionPath), prepared.image);
      images.push({
        originalPath,
        inspectionPath,
        width: prepared.width,
        height: prepared.height,
        originalWidth: prepared.originalWidth,
        originalHeight: prepared.originalHeight,
        resized: prepared.resized,
        resizer: prepared.resized ? "pica/mks2013" : undefined,
      });
    } catch {
      // Optional inspection optimization must not block a usable source asset.
      signal.throwIfAborted();
      images.push({
        originalPath,
        inspectionPath: originalPath,
        resized: false,
        note: "Use the original image; an inspection copy could not be prepared.",
      });
    }
  }
  signal.throwIfAborted();
  await writeFile(
    path.join(workspace, "brief-images.json"),
    JSON.stringify(
      {
        images,
        instruction:
          "Inspect inspectionPath first. Read originalPath or crop the original when small text or fine detail is unclear. Never use a smaller inspection copy as the production asset. These copies preserve aspect ratio and are not upscaled; originals remain unchanged.",
      },
      null,
      2,
    ),
  );
  return images;
}
