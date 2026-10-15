import path from "node:path";
import { readFile, writeFile, unlink, rename } from "node:fs/promises";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toString } from "mdast-util-to-string";
import { StoryboardSchema, SavedStoryboardSchema } from "../../../shared/agents/schemas/storyboard";
import { randomUUID } from "node:crypto";
import type { RootContent } from "mdast";

function storyboardBlock(node: RootContent): unknown {
  if (node.type === "table") {
    const labels = node.children[0].children.map((cell) => toString(cell));
    const columns = labels.map((label, index) => ({
      key: label && labels.indexOf(label) === index ? label : `column${index + 1}`,
      label,
      alignment: node.align?.[index] || null,
    }));
    return {
      type: "table",
      columns,
      rows: node.children
        .slice(1)
        .map((row) =>
          Object.fromEntries(
            row.children.map((cell, index) => [columns[index].key, toString(cell)]),
          ),
        ),
    };
  }
  // Keep the Markdown syntax tree for rich text, nested lists, links, code and
  // other blocks. Only source-file offsets are removed when writing JSON.
  return node;
}

export function structuredStoryboard(content: string, durationSeconds: number) {
  const document = fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const sections: Array<{ heading: string | null; level: number; blocks: unknown[] }> = [];
  let section = { heading: null as string | null, level: 0, blocks: [] as unknown[] };
  for (const node of document.children) {
    if (node.type === "heading") {
      if (section.heading !== null || section.blocks.length) sections.push(section);
      section = { heading: toString(node), level: node.depth, blocks: [] };
    } else {
      section.blocks.push(storyboardBlock(node));
    }
  }
  if (section.heading !== null || section.blocks.length) sections.push(section);
  return { version: 2, durationSeconds, format: "structured", sections };
}

export async function validateStoryboardJson(workspace: string, durationSeconds: number) {
  const storyboard = await readStoryboardJson(workspace);
  if (storyboard.durationSeconds !== durationSeconds)
    throw Error("Storyboard duration must match the requested video duration");
  return true;
}

// Explicit one-time migration, never called as a generation or review fallback.
export async function migrateLegacyStoryboard(workspace: string, durationSeconds: number) {
  const source = await readFile(path.join(workspace, "STORYBOARD.md"), "utf8");
  await writeFile(
    path.join(workspace, "STORYBOARD.json"),
    JSON.stringify(
      structuredStoryboard(source, durationSeconds),
      (key, value) => (key === "position" ? undefined : value),
      2,
    ) + "\n",
  );
  await validateStoryboardJson(workspace, durationSeconds);
  await unlink(path.join(workspace, "STORYBOARD.md"));
}

export async function readStoryboardJson(workspace: string) {
  return SavedStoryboardSchema.parse(
    JSON.parse(await readFile(path.join(workspace, "STORYBOARD.json"), "utf8")),
  );
}

export async function writeStoryboardJson(
  workspace: string,
  value: unknown,
  durationSeconds: number,
) {
  const storyboard = StoryboardSchema.parse(value);
  if (Math.abs(storyboard.durationSeconds - durationSeconds) > 0.001)
    throw Error("Storyboard duration must match the requested video duration");
  const temporary = path.join(workspace, `.storyboard-${randomUUID()}.json.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(storyboard, null, 2) + "\n");
    await rename(temporary, path.join(workspace, "STORYBOARD.json"));
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return storyboard;
}

export const storyboardJsonGuidance = `Your structured response MUST include the complete storyboard object in its required storyboard field alongside the production manifest fields. The application validates it and writes the authoritative STORYBOARD.json; any file you write must match this object. All scenes and beats require explicit numeric startSeconds/endSeconds, ordered contiguous coverage from zero to the video duration, unique scene IDs, positive intervals and reading holds no longer than their beat. Include every required field, using empty arrays/strings where appropriate. Write STORYBOARD.json directly as JSON; do not write STORYBOARD.md or embed the whole storyboard in a Markdown string. Use this structure: {"version":3,"title":"Video title","durationSeconds":120,"scenes":[{"id":"scene-1","title":"Opening","startSeconds":0,"endSeconds":4,"purpose":"What this scene communicates","visuals":[],"assets":[],"beats":[{"startSeconds":0,"endSeconds":4,"development":"What changes or is revealed","captions":[],"audio":{"music":"","effects":[],"lyrics":[]},"readingHoldSeconds":0}]}],"pacingAudit":{"findings":[],"justifiedHolds":[]},"notes":[]}. Replace example values with this video's actual content and requested duration. Keep each caption, asset reference, beat, scene and audit finding in separate JSON fields or array entries. Timing values must be numbers in seconds matching the actual composition. Describe music and lyrics accurately. When extending a preview, replace its short storyboard with the complete full-video storyboard. When repairing, edit this JSON and the affected scene code together.`;
