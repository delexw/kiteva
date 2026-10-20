import { roomDraftRequest } from "../src/client/room/onboarding";
import { expect, it } from "vitest";
import { VideoRequestSchema } from "../src/shared/domains/video";
import {
  deliverySpeech,
  sharedVideoScript,
  editSharedVideoScript,
  editVideoCopy,
  narrationLanguage,
  videoLanguageDirection,
} from "../src/shared/video-language";

it("keeps legacy requests unchanged and resolves English and Mandarin delivery voices", () => {
  const request = VideoRequestSchema.parse({
    instructions: "Use an English idea",
    speech: { mode: "narration", voice: "am_michael", source: "provided", text: "A story" },
  });
  expect(deliverySpeech(request)).toEqual(request.speech);
  expect(deliverySpeech({ ...request, outputLanguage: "zh" })).toMatchObject({
    voice: "zf_xiaobei",
  });
  expect(deliverySpeech({ ...request, outputLanguage: "en" })).toMatchObject({
    voice: "am_michael",
  });
  expect(request.speech).toMatchObject({ voice: "am_michael" });
  const pocket = VideoRequestSchema.parse({
    ...request,
    outputLanguage: "zh",
    speech: { ...request.speech, engine: "pocket-tts", voice: "pocket_alba" },
  });
  expect(deliverySpeech(pocket)).toMatchObject({
    engine: "pocket-tts",
    language: "zh",
    voice: "pocket_zh_xiaobei",
  });
  expect(narrationLanguage(pocket)).toBe("zh");
  expect(
    deliverySpeech({
      ...pocket,
      speech: { ...pocket.speech, followVideoLanguage: false },
    } as typeof pocket),
  ).toMatchObject({ voice: "pocket_alba" });
});
it("preserves originals while storing edits to a translated language version", () => {
  const request = VideoRequestSchema.parse({
    instructions: "A creative idea",
    outputLanguage: "zh",
    lyrics: { mode: "provided", text: "你好" },
    translations: { original: { lyrics: "Hello" }, versions: { zh: { lyrics: "你好" } } },
  });
  const edited = editVideoCopy(request, "lyrics", "Another line");
  expect(edited.translations).toEqual({
    original: { lyrics: "Hello" },
    versions: { zh: { lyrics: "Another line" } },
  });
  expect(edited.lyrics).toEqual({ mode: "provided", text: "Another line" });
  expect(videoLanguageDirection("zh")).toContain("overrides");
  expect(videoLanguageDirection("zh")).toContain("captured website UI");
});

it("preserves spaces while typing lyrics and captures the complete original only when translating", () => {
  const base = VideoRequestSchema.parse({ instructions: "A creative idea", outputLanguage: "en" });
  const first = editVideoCopy(base, "lyrics", "Let ");
  const restored = roomDraftRequest({ step: 0, request: first, assets: [] });
  expect(restored.outputType === "video" && restored.lyrics).toEqual({
    mode: "provided",
    text: "Let ",
  });
  const next = editVideoCopy(first, "lyrics", "Let your idea take flight.");
  expect(next.translations).toBeUndefined();
});

it("uses one script for displayed text and narration while retaining voice settings", () => {
  const request = VideoRequestSchema.parse({
    instructions: "An example film",
    lyrics: { mode: "provided", text: "Display script" },
    speech: { mode: "narration", source: "provided", text: "Old duplicate", voice: "am_michael" },
  });
  expect(sharedVideoScript(request)).toBe("Display script");
  const edited = editSharedVideoScript(request, "One shared script ");
  expect(edited.lyrics).toEqual({ mode: "provided", text: "One shared script " });
  expect(edited.speech).toMatchObject({
    source: "lyrics",
    text: "One shared script ",
    voice: "am_michael",
  });
  const narrationOnly = editSharedVideoScript(
    { ...edited, lyrics: { mode: "off" } },
    "Narration alone",
  );
  expect(narrationOnly.lyrics).toEqual({ mode: "off" });
  expect(narrationOnly.speech).toMatchObject({ source: "provided", text: "Narration alone" });
  expect(editSharedVideoScript({ ...request, lyrics: { mode: "write" } }, "").speech).toMatchObject(
    { source: "lyrics" },
  );
  expect(editSharedVideoScript({ ...request, lyrics: { mode: "off" } }, "").speech).toMatchObject({
    source: "write",
  });
});
