import { roomSubmission } from "../src/client/room/onboarding";
import { expect, it, vi } from "vitest";
import {
  LanguageTracksSchema,
  selectLanguageTrackLanguages,
  applyLanguageTracks,
  languageTracksDirection,
} from "../src/shared/language-tracks";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { subtitleDocuments } from "../src/server/domains/video/language-media";
const settings = {
  narration: [{ language: "en", speech: { mode: "narration", voice: "af_heart" } }],
  subtitles: ["zh"],
  defaultNarration: "en",
  defaultSubtitle: "zh",
};
it("validates independent enabled/default languages and rejects duplicates", () => {
  expect(LanguageTracksSchema.parse(settings).subtitles).toEqual(["zh"]);
  for (const invalid of [
    { ...settings, defaultNarration: "zh" },
    { ...settings, defaultSubtitle: "en" },
    { ...settings, subtitles: ["zh", "zh"] },
    { ...settings, narration: [...settings.narration, ...settings.narration] },
  ])
    expect(LanguageTracksSchema.safeParse(invalid).success).toBe(false);
});
it("applies selected narration to every timed item without changing visuals or text", () => {
  const request = VideoRequestSchema.parse({
    instructions: "Explain a system",
    outputLanguage: "zh",
    languageTracks: settings,
    scriptItems: [
      {
        id: "spoken",
        startSeconds: 0,
        endSeconds: 2,
        text: "Explain it",
        source: "write",
        showSubtitles: true,
        speech: { mode: "narration", voice: "zf_xiaobei" },
      },
      {
        id: "silent",
        startSeconds: 2,
        endSeconds: 3,
        text: "A silent label",
        showSubtitles: true,
        speech: { mode: "off" },
      },
    ],
  });
  const applied = applyLanguageTracks(request);
  expect(applied.outputLanguage).toBe("zh");
  expect(applied.scriptItems![0]).toMatchObject({
    text: "Explain it",
    speech: { voice: "af_heart", language: "en", followVideoLanguage: false },
  });
  expect(applied.scriptItems![1].speech.mode).toBe("narration");
  const hidden = applyLanguageTracks({
    ...request,
    languageTracks: { ...request.languageTracks!, showSubtitles: false },
  });
  expect(
    hidden.scriptItems!.every((item) => !item.showSubtitles && item.speech.mode === "narration"),
  ).toBe(true);
  expect(request.scriptItems![0].speech).toMatchObject({ voice: "zf_xiaobei" });
  expect(languageTracksDirection(request)).toContain("Keep subtitles out of the rendered pixels");
});
it("keeps legacy requests unchanged and supports subtitles without narration", () => {
  const legacy = VideoRequestSchema.parse({ instructions: "An example" });
  expect(applyLanguageTracks(legacy)).toBe(legacy);
  const request = VideoRequestSchema.parse({
    instructions: "An example",
    languageTracks: { narration: [], subtitles: ["en"], defaultSubtitle: "en" },
    speech: { mode: "narration" },
  });
  expect(applyLanguageTracks(request).speech?.mode).toBe("off");
});
it("exports readable SRT and escaped WebVTT with exact cue times", () => {
  const documents = subtitleDocuments([
    { text: "A < B & C", startSeconds: 0.125, endSeconds: 65.25 },
  ]);
  expect(documents.srt).toContain("00:00:00,125 --> 00:01:05,250\nA < B & C");
  expect(documents.vtt).toContain("WEBVTT\n\n1\n00:00:00.125 --> 00:01:05.250\nA &lt; B &amp; C");
});

it("translates supplied spoken items into the primary track language while preserving visual language and originals", async () => {
  const { localizeVideoRequest } =
    await import("../src/server/jobs/subworkflows/video-localization");
  const { agentTurn } = await import("../src/server/agents/providers");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const folder = await mkdtemp(join(tmpdir(), "primary-language-"));
  const request = VideoRequestSchema.parse({
    instructions: "Explain a generic example",
    outputLanguage: "zh",
    languageTracks: settings,
    scriptItems: [
      {
        id: "spoken",
        startSeconds: 0,
        endSeconds: 3,
        text: "这是一个示例。",
        source: "provided",
        showSubtitles: true,
        speech: { mode: "narration", voice: "zf_xiaobei" },
      },
    ],
  });
  const generate = vi.fn(async () => ({
    value: { text: "This is an example." },
    sessionId: "translation",
  })) as unknown as typeof agentTurn;
  try {
    const localized = await localizeVideoRequest(
      applyLanguageTracks(request),
      folder,
      new AbortController().signal,
      vi.fn(),
      generate,
    );
    expect(localized.outputLanguage).toBe("zh");
    expect(localized.scriptItems![0].text).toBe("This is an example.");
    expect(request.scriptItems![0].text).toBe("这是一个示例。");
    expect(generate).toHaveBeenCalledTimes(1);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

it("resolves every media artifact for playback and downloads without changing metadata or stored paths", async () => {
  const { languageMediaUrls } = await import("../src/client/lib/language-media");
  const media = {
    narration: [
      { language: "en" as const, video: "video.mp4", audio: "voice.wav", mix: "mix.m4a" },
    ],
    subtitles: [{ language: "zh" as const, vtt: "captions.vtt", srt: "captions.srt" }],
    musicVideo: "music.mp4",
    defaultNarration: "en" as const,
    defaultSubtitle: "zh" as const,
  };
  const resolved = languageMediaUrls(media, (file) => `/artifacts/${file}`);
  expect(resolved).toMatchObject({
    musicVideo: "/artifacts/music.mp4",
    defaultNarration: "en",
    defaultSubtitle: "zh",
    narration: [
      { video: "/artifacts/video.mp4", audio: "/artifacts/voice.wav", mix: "/artifacts/mix.m4a" },
    ],
    subtitles: [{ vtt: "/artifacts/captions.vtt", srt: "/artifacts/captions.srt" }],
  });
  expect(media.narration[0].video).toBe("video.mp4");
});

it("selects paired languages, preserves voice profiles and keeps both playback defaults together", () => {
  const request = VideoRequestSchema.parse({
    instructions: "Example explanation",
    outputLanguage: "en",
    languageTracks: settings,
  });
  const paired = selectLanguageTrackLanguages(request, ["en", "zh"]);
  expect(paired.narration.map((track) => track.language)).toEqual(["en", "zh"]);
  expect(paired.subtitles).toEqual(["en", "zh"]);
  expect(paired.narration[0].speech.voice).toBe("af_heart");
  expect(paired.defaultNarration).toBe("en");
  expect(paired.defaultSubtitle).toBe("en");
  const chinese = selectLanguageTrackLanguages({ ...request, languageTracks: paired }, ["zh"]);
  expect(chinese.narration[0].language).toBe("zh");
  expect(chinese.subtitles).toEqual(["zh"]);
  expect(chinese.defaultNarration).toBe("zh");
  expect(chinese.defaultSubtitle).toBe("zh");
  expect(LanguageTracksSchema.safeParse(chinese).success).toBe(true);
  const applied = applyLanguageTracks({ ...request, languageTracks: chinese });
  expect(applied.speech).toMatchObject({ mode: "narration", language: "zh" });
  expect(applied.outputLanguage).toBe("en");
  const empty = selectLanguageTrackLanguages({ ...request, languageTracks: chinese }, []);
  expect(empty).toEqual({
    narration: [],
    subtitles: [],
    defaultNarration: undefined,
    defaultSubtitle: "off",
  });
  expect(request.languageTracks).toEqual(LanguageTracksSchema.parse(settings));
});

it("submits global profiles rather than hidden legacy item switches", () => {
  const request = VideoRequestSchema.parse({
    instructions: "Explain a sample",
    languageTracks: {
      narration: [
        { language: "en", speech: { mode: "narration", engine: "kokoro", voice: "af_heart" } },
      ],
      subtitles: [],
      showSubtitles: false,
      defaultNarration: "en",
      defaultSubtitle: "off",
    },
    scriptItems: [
      {
        id: "opening",
        startSeconds: 0,
        endSeconds: 3,
        text: "Exact supplied copy",
        showSubtitles: true,
        speech: { mode: "off" },
      },
    ],
  });
  const submitted = roomSubmission(request);
  expect(submitted.outputType).toBe("video");
  if (submitted.outputType !== "video") throw Error("Expected video");
  expect(submitted.scriptItems![0]).toMatchObject({
    text: "Exact supplied copy",
    showSubtitles: false,
    speech: { mode: "narration", engine: "kokoro", voice: "af_heart", language: "en" },
  });
  expect(request.scriptItems![0].speech.mode).toBe("off");
});
