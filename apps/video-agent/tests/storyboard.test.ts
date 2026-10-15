import { validStoryboard } from "./fixtures/storyboard";
import { it, expect } from "vitest";
import { mkdtemp, rm, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  validateStoryboardJson,
  structuredStoryboard,
  migrateLegacyStoryboard,
} from "../src/server/domains/video/storyboard";

it("uses directly authored JSON without reading or creating Markdown", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "storyboard-"));
  try {
    const storyboard = validStoryboard(120);
    await writeFile(path.join(workspace, "STORYBOARD.json"), JSON.stringify(storyboard));
    expect(await validateStoryboardJson(workspace, 120)).toBe(true);
    expect(JSON.parse(await readFile(path.join(workspace, "STORYBOARD.json"), "utf8"))).toEqual(
      storyboard,
    );
    await expect(access(path.join(workspace, "STORYBOARD.md"))).rejects.toThrow();
    await expect(validateStoryboardJson(workspace, 3)).rejects.toThrow("duration");
    await writeFile(
      path.join(workspace, "STORYBOARD.json"),
      JSON.stringify({ durationSeconds: 120, content: "A big Markdown string" }),
    );
    await expect(validateStoryboardJson(workspace, 120)).rejects.toThrow();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("migrates timed table rows into JSON fields and preserves rich nested notes", () => {
  const source =
    '# Story\n\n| Time | Beat |\n| --- | --- |\n| 0–4s | "Hello" |\n\n## Music\n- [Track](https://example.com/music)\n  - **Strong drums**\n## Notes\n```js\nplay();\n```';
  const result = structuredStoryboard(source, 120);
  expect(result).not.toHaveProperty("content");
  expect(result.sections.map((section) => section.heading)).toEqual(["Story", "Music", "Notes"]);
  expect(result.sections[0].blocks[0]).toMatchObject({
    type: "table",
    rows: [{ Time: "0–4s", Beat: '"Hello"' }],
  });
  expect(result.sections[1].blocks[0]).toMatchObject({
    type: "list",
    children: [
      {
        type: "listItem",
        children: [
          { type: "paragraph", children: [{ type: "link", url: "https://example.com/music" }] },
          { type: "list" },
        ],
      },
    ],
  });
  expect(result.sections[2].blocks[0]).toMatchObject({
    type: "code",
    lang: "js",
    value: "play();",
  });
});

it("does not fall back to a Markdown-only file", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "storyboard-"));
  try {
    await writeFile(path.join(workspace, "STORYBOARD.md"), "Old story");
    await expect(validateStoryboardJson(workspace, 3)).rejects.toThrow();
    await migrateLegacyStoryboard(workspace, 3);
    expect(await validateStoryboardJson(workspace, 3)).toBe(true);
    await expect(access(path.join(workspace, "STORYBOARD.md"))).rejects.toThrow();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
