import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  publishStylePreviewSource,
  styleArtworkFolder,
  stylePreviewVideoFolder,
  stylePreviewSourceFolder,
} from "../src/server/catalog/style-preview-assets";
import { appRoot } from "../src/server/runtime/config";

it("keeps finished artwork, video metadata and editable sources in the codebase assets", () => {
  expect(styleArtworkFolder).toBe(path.join(appRoot, "assets/style-art"));
  expect(stylePreviewVideoFolder).toBe(path.join(appRoot, "assets/style-previews"));
  expect(stylePreviewSourceFolder).toBe(path.join(stylePreviewVideoFolder, "sources"));
});

describe("preview source publication", () => {
  it("preserves runnable code and textures without review frames, hashes, logs or dependency links", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "preview-assets-"));
    try {
      const workspace = path.join(root, "work");
      for (const folder of ["textures", "renders", "snapshots", "prompt-inputs"])
        await mkdir(path.join(workspace, folder), { recursive: true });
      for (const file of [
        "index.html",
        "scene.js",
        "production.json",
        "STORYBOARD.json",
        "textures/paper.png",
        "renders/preview.mp4",
        "snapshots/frame.png",
        "prompt-inputs/input.json",
        "authoring-events-1.json",
        "BACKGROUND_REVIEW.json",
        "background-reference-01.webp",
        "index.before-repair.txt",
        "repair-review.json",
      ])
        await writeFile(path.join(workspace, file), file);
      await symlink(root, path.join(workspace, "node_modules"));
      const sources = path.join(root, "sources");
      await publishStylePreviewSource(workspace, "style-001", sources);
      expect((await readdir(path.join(sources, "style-001"))).sort()).toEqual([
        "STORYBOARD.json",
        "index.html",
        "production.json",
        "scene.js",
        "textures",
      ]);
      expect(await readFile(path.join(sources, "style-001/textures/paper.png"), "utf8")).toBe(
        "textures/paper.png",
      );
      await writeFile(path.join(sources, "style-001/stale.js"), "old");
      await publishStylePreviewSource(workspace, "style-001", sources);
      expect(await readdir(path.join(sources, "style-001"))).not.toContain("stale.js");
      await expect(publishStylePreviewSource(workspace, "../escape", sources)).rejects.toThrow(
        "Invalid Motion Graphic ID",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
