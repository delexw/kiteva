import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { appRoot } from "../runtime/config";

export const styleArtworkFolder = path.join(appRoot, "assets", "style-art");
export const stylePreviewVideoFolder = path.join(appRoot, "assets", "style-previews");
export const stylePreviewSourceFolder = path.join(stylePreviewVideoFolder, "sources");

export async function publishStylePreviewSource(
  workspace: string,
  styleId: string,
  sourceRoot = stylePreviewSourceFolder,
) {
  if (!/^style-\d{3}$/.test(styleId)) throw Error("Invalid style ID");
  await mkdir(sourceRoot, { recursive: true });
  const temporary = await mkdtemp(path.join(sourceRoot, ".publish-"));
  const excluded = new Set([
    "renders",
    "snapshots",
    "node_modules",
    "prompt-inputs",
    "repair-review.json",
    "BACKGROUND_REVIEW.json",
    "TECHNOLOGY_POOL.json",
    "STYLE.json",
    "ERROR.txt",
    "VALIDATION.md",
  ]);
  try {
    await cp(workspace, temporary, {
      recursive: true,
      filter: (file) => {
        const parts = path.relative(workspace, file).split(path.sep);
        return !parts.some(
          (part) =>
            excluded.has(part) ||
            /^(authoring-events-|background-reference-|index\.before)/.test(part) ||
            part.endsWith(".py"),
        );
      },
    });
    const destination = path.join(sourceRoot, styleId);
    await rm(destination, { recursive: true, force: true });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
