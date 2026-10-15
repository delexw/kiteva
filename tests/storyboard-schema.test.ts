import { expect, it } from "vitest";
import { z } from "zod";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { StoryboardSchema } from "../src/shared/agents/schemas/storyboard";
import { videoGenerationOutputSchemaForDuration } from "../src/shared/agents/schemas/video";
import { writeStoryboardJson } from "../src/server/domains/video/storyboard";
import { validStoryboard } from "./fixtures/storyboard";

it("exports a required storyboard and exact duration in the provider JSON schema", () => {
  const schema = z.toJSONSchema(videoGenerationOutputSchemaForDuration(3), { target: "draft-7" });
  expect(schema).toMatchObject({
    required: expect.arrayContaining(["storyboard"]),
    properties: {
      storyboard: {
        required: expect.arrayContaining([
          "version",
          "title",
          "durationSeconds",
          "scenes",
          "pacingAudit",
          "notes",
        ]),
        properties: {
          durationSeconds: { const: 3 },
          scenes: { items: { required: expect.arrayContaining(["beats"]) } },
        },
      },
    },
  });
  expect(StoryboardSchema.safeParse({ durationSeconds: 3, scenes: [{}] }).success).toBe(false);
});

it("rejects broken timing, missing fields and duplicate scene identities", () => {
  const invalid = [
    (s: ReturnType<typeof validStoryboard>) => {
      s.scenes[0].beats[0].endSeconds = 4;
    },
    (s: ReturnType<typeof validStoryboard>) => {
      s.scenes[0].beats[0].endSeconds = 0;
    },
    (s: ReturnType<typeof validStoryboard>) => {
      s.scenes[0].startSeconds = 1;
    },
    (s: ReturnType<typeof validStoryboard>) => {
      s.scenes[0].beats[0].startSeconds = 1;
    },
    (s: ReturnType<typeof validStoryboard>) => {
      s.scenes[0].beats[0].readingHoldSeconds = 4;
    },
    (s: ReturnType<typeof validStoryboard>) => {
      s.scenes[0].endSeconds = 2;
    },
    (s: ReturnType<typeof validStoryboard>) => {
      s.scenes[0].beats[0].endSeconds = 2;
    },
    (s: ReturnType<typeof validStoryboard>) => {
      s.scenes.push(structuredClone(s.scenes[0]));
    },
  ];
  expect(StoryboardSchema.safeParse(validStoryboard()).success).toBe(true);
  for (const mutate of invalid) {
    const s = validStoryboard();
    mutate(s);
    expect(StoryboardSchema.safeParse(s).success).toBe(false);
  }
  const s = validStoryboard();
  s.scenes[0].beats.push({ ...s.scenes[0].beats[0], startSeconds: 1, endSeconds: 3 });
  expect(StoryboardSchema.safeParse(s).success).toBe(false);
});

it("persists only a valid storyboard atomically and preserves existing content on rejection", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "storyboard-schema-"));
  try {
    await writeStoryboardJson(workspace, validStoryboard(), 3);
    const original = await readFile(path.join(workspace, "STORYBOARD.json"), "utf8");
    await expect(writeStoryboardJson(workspace, { content: "broken" }, 3)).rejects.toThrow();
    await expect(writeStoryboardJson(workspace, validStoryboard(4), 3)).rejects.toThrow("duration");
    expect(await readFile(path.join(workspace, "STORYBOARD.json"), "utf8")).toBe(original);
    expect(await readdir(workspace)).toEqual(["STORYBOARD.json"]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
