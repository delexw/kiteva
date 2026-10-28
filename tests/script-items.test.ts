import { expect, it } from "vitest";
import {
  ScriptItemsSchema,
  legacyScriptItems,
  scriptItemsDirection,
  scriptItemsProblem,
} from "../src/shared/script-items";
import { VideoRequestSchema, resolveVideoDuration } from "../src/shared/domains/video";
import { roomDraftRequest, roomSubmission } from "../src/client/room/onboarding";
import { activeSpeech } from "../src/shared/speech";
import { localizeVideoRequest } from "../src/server/jobs/subworkflows/video-localization";
import { vi } from "vitest";

const item = {
  id: "opener",
  startSeconds: 0,
  endSeconds: 10,
  text: "Knowledge everywhere.",
  showSubtitles: true,
  speech: { mode: "off" as const },
};
it("keeps silent text independent from speech and hides old global narration", () => {
  const request = VideoRequestSchema.parse({
    instructions: "A short explanation",
    duration: 20,
    scriptItems: [item],
    speech: { mode: "narration" },
    subtitles: { mode: "write" },
  });
  expect(activeSpeech(request)).toBeUndefined();
  expect(scriptItemsDirection(request.scriptItems)).toContain('"enabled":false');
  expect(scriptItemsDirection(request.scriptItems)).toContain('"showSubtitles":true');
  expect(scriptItemsDirection(request.scriptItems)).toContain(
    "supersede legacy speech and subtitles",
  );
});
it.each([
  { ...item, endSeconds: 0 },
  { ...item, startSeconds: 10 },
  { ...item, text: " " },
  { ...item, speech: { mode: "narration", engine: "kokoro", voice: "pocket_eve" } },
  {
    ...item,
    speech: { mode: "narration", engine: "pocket-tts", voice: "pocket_eve", language: "zh" },
  },
  { ...item, speech: { mode: "uploaded", assetId: "audio" } },
])("rejects invalid timing, text, provider or voice: %j", (value) => {
  expect(ScriptItemsSchema.safeParse([value]).success).toBe(false);
});
it("rejects duplicate IDs, spoken overlaps and windows beyond the film", () => {
  expect(ScriptItemsSchema.safeParse([item, item]).success).toBe(false);
  const spoken = { ...item, speech: { mode: "narration", voice: "af_heart" } };
  expect(
    ScriptItemsSchema.safeParse([
      spoken,
      { ...spoken, id: "second", startSeconds: 9, endSeconds: 15 },
    ]).success,
  ).toBe(false);
  expect(
    ScriptItemsSchema.safeParse([item, { ...item, id: "second", startSeconds: 9, endSeconds: 15 }])
      .success,
  ).toBe(true);
  expect(scriptItemsProblem([item], 5)).toContain("film duration");
  expect(
    VideoRequestSchema.safeParse({
      instructions: "A short explanation",
      duration: 5,
      scriptItems: [item],
    }).success,
  ).toBe(true);
  expect(
    VideoRequestSchema.safeParse({
      instructions: "A short explanation",
      duration: 4,
      scriptItems: [item],
    }).success,
  ).toBe(false);
});
it("retains independently selected providers, languages and hidden captions in model guidance", () => {
  const items = ScriptItemsSchema.parse([
    item,
    {
      ...item,
      id: "spoken",
      startSeconds: 10,
      endSeconds: 20,
      showSubtitles: false,
      speech: {
        mode: "narration",
        engine: "pocket-tts",
        language: "zh",
        voice: "pocket_zh_xiaobei",
        speed: 1.1,
        volume: 0.8,
      },
    },
  ]);
  const prompt = scriptItemsDirection(items);
  expect(prompt).toContain('"item":2');
  expect(prompt).toContain('"language":"zh"');
  expect(prompt).toContain('"showSubtitles":false');
  expect(prompt).toContain('"engine":"pocket-tts"');
  expect(scriptItemsDirection(items, true)).toContain("Direction previews stay silent");
  expect(resolveVideoDuration("auto", 15, items)).toBe(20);
});
it("preserves unfinished item edits and existing settings without submitting invalid text", () => {
  const draft = roomDraftRequest({
    request: {
      instructions: "A short explanation",
      duration: 60,
      outputType: "video",
      scriptItems: [{ ...item, text: "", endSeconds: 0 }],
      frameRate: 60,
    },
  });
  expect(draft.outputType).toBe("video");
  if (draft.outputType !== "video") throw Error("Expected video");
  expect(draft.frameRate).toBe(60);
  expect(draft.scriptItems?.[0].text).toBe("");
  expect(draft.duration).toBe(60);
  expect(() => roomSubmission(draft)).toThrow();
});
it("converts existing scripts explicitly, without shifting their start or changing voices", () => {
  const converted = legacyScriptItems({
    duration: 60,
    subtitles: { mode: "provided", text: "Hello" },
    speech: {
      mode: "narration",
      source: "subtitles",
      voice: "af_heart",
      speed: 1,
      startSeconds: 18,
      text: "",
      instructions: "",
    },
  });
  expect(converted[0]).toMatchObject({
    startSeconds: 18,
    endSeconds: 60,
    text: "Hello",
    showSubtitles: true,
    speech: { mode: "narration", voice: "af_heart" },
  });
  expect(converted[0].speech).not.toHaveProperty("startSeconds");
});
it("does not translate individually configured script text using the global output language", async () => {
  const request = VideoRequestSchema.parse({
    instructions: "A short explanation",
    outputLanguage: "zh",
    scriptItems: [item],
  });
  const generate = vi.fn();
  expect(
    await localizeVideoRequest(request, "/unused", new AbortController().signal, vi.fn(), generate),
  ).toBe(request);
  expect(generate).not.toHaveBeenCalled();
});
