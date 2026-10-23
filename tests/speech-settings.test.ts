import { expect, it } from "vitest";
import {
  activeSpeech,
  pocketLanguages,
  pocketVoices,
  pocketVoiceGroups,
  pocketLanguageForVoice,
  SpeechSettingsSchema,
  speechConfigurationProblem,
} from "../src/shared/speech";
import { RequestSchema } from "../src/shared/contracts";
import {
  roomDraftRequest,
  roomDraftFromProject,
  roomSubmission,
  switchRoomOutputType,
} from "../src/client/room/onboarding";
import { projectSettingsDraft } from "../src/client/lib/project-settings";
import { lyricsDirection } from "../src/server/domains/video/lyrics";

const narration = SpeechSettingsSchema.parse({ mode: "narration" });
it("offers all eight synthetic Mandarin references with source and generated-audio voice groups", () => {
  const voices = pocketVoices.filter((voice) => voice.language === "zh");
  expect(voices.filter((voice) => voice.gender === "female").map((voice) => voice.label)).toEqual([
    "Xiaobei",
    "Xiaoni",
    "Xiaoxiao",
    "Xiaoyi",
    "Yunxia",
  ]);
  expect(voices.filter((voice) => voice.gender === "male").map((voice) => voice.label)).toEqual([
    "Yunjian",
    "Yunxi",
    "Yunyang",
  ]);
  expect(voices).toHaveLength(8);
  for (const voice of voices)
    expect(voice.reference).toMatch(
      voice.gender === "female" && voice.id !== "pocket_zh_yunxia"
        ? /^synthetic:kokoro\/zf_/
        : /^synthetic:kokoro\/zm_/,
    );
});
it("groups every Pocket voice under Female or Male and keeps names without suffixes", () => {
  for (const id of ["anna", "vera", "fantine", "eponine", "azelma"])
    expect(pocketVoices.find((voice) => voice.id === `pocket_${id}`)?.gender).toBe("female");
  for (const id of ["charles", "paul"])
    expect(pocketVoices.find((voice) => voice.id === `pocket_${id}`)?.gender).toBe("male");
  expect(pocketVoices).toHaveLength(35);
  expect(pocketVoices.find((voice) => voice.id === "pocket_marius")?.label).toBe("Marius");
  expect(pocketVoiceGroups.map((group) => group.label)).toEqual(["Female", "Male"]);
  const groupedIds = pocketVoiceGroups.flatMap((group) =>
    group.options.map((voice) => voice.value),
  );
  expect(new Set(groupedIds).size).toBe(35);
  expect([...groupedIds].sort()).toEqual(pocketVoices.map((voice) => voice.id).sort());
  expect(pocketVoiceGroups[0].options.map((voice) => voice.value)).toContain("pocket_fantine");
  expect(pocketVoiceGroups[1].options.map((voice) => voice.value)).toContain("pocket_marius");
  expect(pocketVoiceGroups[1].options.map((voice) => voice.value)).toContain("pocket_alba");
  expect(pocketVoiceGroups[0].options).toHaveLength(17);
  expect(pocketVoiceGroups[1].options).toHaveLength(18);
  expect(pocketVoiceGroups[0].options.map((voice) => voice.value)).toEqual([
    "pocket_fantine",
    "pocket_cosette",
    "pocket_eponine",
    "pocket_azelma",
    "pocket_anna",
    "pocket_vera",
    "pocket_mary",
    "pocket_jane",
    "pocket_eve",
    "pocket_caro_davy",
    "pocket_estelle",
    "pocket_lola",
    "pocket_zh_xiaobei",
    "pocket_zh_xiaoni",
    "pocket_zh_xiaoxiao",
    "pocket_zh_xiaoyi",
    "pocket_zh_yunxia",
  ]);
  expect(pocketVoiceGroups[1].options.map((voice) => voice.value)).toEqual([
    "pocket_alba",
    "pocket_marius",
    "pocket_javert",
    "pocket_jean",
    "pocket_charles",
    "pocket_paul",
    "pocket_george",
    "pocket_michael",
    "pocket_bill_boerst",
    "pocket_peter_yearsley",
    "pocket_stuart_bell",
    "pocket_juergen",
    "pocket_rafael",
    "pocket_giovanni",
    "pocket_daan",
    "pocket_zh_yunjian",
    "pocket_zh_yunxi",
    "pocket_zh_yunyang",
  ]);
  for (const voice of pocketVoices) {
    expect(["female", "male"]).toContain(voice.gender);
    expect(voice.label).not.toMatch(/Female|Male/);
    expect(voice.reference).toMatch(/^(hf:\/\/kyutai\/|synthetic:kokoro\/)/);
  }
});
if (narration.mode !== "narration") throw Error("Invalid narration fixture");
it("defaults old projects to no speech and retains choices while lyrics are off", () => {
  expect(activeSpeech(RequestSchema.parse({ instructions: "Example idea" }))).toBeUndefined();
  const request = RequestSchema.parse({
    instructions: "Example idea",
    lyrics: { mode: "off" },
    speech: narration,
  });
  expect(activeSpeech(request)).toBeUndefined();
  const restored = roomDraftRequest(roomDraftFromProject(request, []));
  expect(restored.outputType === "video" && restored.speech).toEqual(narration);
  expect(activeSpeech({ ...restored, lyrics: { mode: "write" }, speech: narration })).toEqual(
    narration,
  );
});
it("preserves script and voice through edit, submit and settings restoration", () => {
  const request = RequestSchema.parse({
    instructions: "Example idea",
    lyrics: { mode: "write" },
    speech: {
      ...narration,
      source: "provided",
      text: "A spoken idea",
      voice: "bm_george",
      speed: 1.15,
    },
  });
  const restored = roomSubmission(roomDraftRequest(roomDraftFromProject(request, [])));
  expect(projectSettingsDraft(restored).speech).toEqual(
    request.outputType === "video" && { ...request.speech, source: "lyrics" },
  );
  expect(restored.outputType === "video" && restored.lyrics).toEqual({
    mode: "provided",
    text: "A spoken idea",
  });
  expect(switchRoomOutputType(restored, "page")).not.toHaveProperty("speech");
});
it("rejects unsupported singing, invalid voice/speed, empty scripts and unattached vocal files", () => {
  expect(SpeechSettingsSchema.safeParse({ mode: "singing" }).success).toBe(false);
  expect(SpeechSettingsSchema.safeParse({ mode: "narration", voice: "invented" }).success).toBe(
    false,
  );
  expect(SpeechSettingsSchema.safeParse({ mode: "narration", speed: 4 }).success).toBe(false);
  expect(
    speechConfigurationProblem({
      lyrics: { mode: "write" },
      speech: { ...narration, mode: "narration", source: "provided", text: "" },
      assetIds: [],
    }),
  ).toMatch(/script/);
  expect(
    speechConfigurationProblem({
      lyrics: { mode: "write" },
      speech: { mode: "uploaded", assetId: "voice" },
      assetIds: ["voice"],
    }),
  ).toMatch(/attached/);
  expect(
    speechConfigurationProblem({
      lyrics: { mode: "write" },
      speech: { mode: "uploaded", assetId: "voice" },
      assetIds: ["voice"],
      requirements: { music: { assetIds: ["voice"] } },
    }),
  ).toBeUndefined();
});
it("keeps unrequested vocals prohibited but recognizes prepared requested speech", () => {
  const lyrics = { mode: "provided" as const, text: "An idea takes flight" };
  expect(lyricsDirection(lyrics, false)).toContain("Do not claim singing or narration");
  expect(lyricsDirection(lyrics, false, true)).toContain("measured cues");
  expect(lyricsDirection(lyrics, false, true)).not.toContain("Do not claim singing or narration");
});

it("validates engine-specific voices and preserves Pocket settings through saved drafts", () => {
  const pocket = SpeechSettingsSchema.parse({
    mode: "narration",
    engine: "pocket-tts",
    voice: "pocket_alba",
  });
  expect(
    SpeechSettingsSchema.safeParse({ mode: "narration", engine: "pocket-tts", voice: "af_heart" })
      .success,
  ).toBe(false);
  expect(SpeechSettingsSchema.safeParse({ mode: "narration", voice: "pocket_alba" }).success).toBe(
    false,
  );
  expect(SpeechSettingsSchema.safeParse({ mode: "narration", engine: "external" }).success).toBe(
    false,
  );
  const request = RequestSchema.parse({
    instructions: "An example film",
    lyrics: { mode: "write" },
    speech: pocket,
  });
  expect(roomSubmission(roomDraftRequest(roomDraftFromProject(request, []))).speech).toEqual(
    pocket,
  );
});

it("exposes every official Pocket language and all 27 official presets plus eight Chinese references without an English-only subset", () => {
  expect(pocketLanguages.map((language) => language.model)).toEqual([
    "english",
    "french",
    "german",
    "portuguese",
    "italian",
    "spanish",
    "dutch",
    "chinese",
  ]);
  expect(pocketVoices).toHaveLength(35);
  expect(new Set(pocketVoices.map((voice) => voice.id)).size).toBe(35);
  expect(pocketVoices.filter((voice) => voice.language === "en")).toHaveLength(21);
  for (const voice of pocketVoices) {
    expect(
      SpeechSettingsSchema.safeParse({ mode: "narration", engine: "pocket-tts", voice: voice.id })
        .success,
    ).toBe(true);
    expect(pocketLanguageForVoice(voice.id)?.id).toBe(voice.language);
    for (const language of pocketLanguages) {
      const compatible = (voice.language === "zh") === (language.id === "zh");
      expect(
        SpeechSettingsSchema.safeParse({
          mode: "narration",
          engine: "pocket-tts",
          voice: voice.id,
          language: language.id,
        }).success,
      ).toBe(compatible);
      expect(pocketLanguageForVoice(voice.id, language.id)?.model).toBe(
        compatible ? language.model : undefined,
      );
    }
  }
  expect(pocketLanguageForVoice("unknown")).toBeUndefined();
});

it("allows provided narration, generated scripts and uploaded vocals without on-screen lyrics", () => {
  for (const lyrics of [undefined, { mode: "off" }]) {
    for (const source of ["provided", "write"] as const) {
      const speech = { ...narration, source, text: "A spoken story" };
      expect(activeSpeech({ lyrics, speech })).toEqual(speech);
    }
    const uploaded = { mode: "uploaded" as const, assetId: "recording" };
    expect(activeSpeech({ lyrics, speech: uploaded })).toEqual(uploaded);
    expect(activeSpeech({ lyrics, speech: { mode: "off" } })).toBeUndefined();
    expect(activeSpeech({ lyrics, speech: { ...narration, source: "lyrics" } })).toBeUndefined();
  }
});

it("keeps Mandarin checkpoint voices separate from official Pocket embeddings", () => {
  expect(() =>
    SpeechSettingsSchema.parse({
      mode: "narration",
      engine: "pocket-tts",
      language: "zh",
      voice: "pocket_alba",
    }),
  ).toThrow(/compatible/);
  expect(() =>
    SpeechSettingsSchema.parse({
      mode: "narration",
      engine: "pocket-tts",
      language: "en",
      voice: "pocket_zh_xiaobei",
    }),
  ).toThrow(/compatible/);
  expect(
    SpeechSettingsSchema.parse({
      mode: "narration",
      engine: "pocket-tts",
      language: "zh",
      voice: "pocket_zh_xiaobei",
    }),
  ).toMatchObject({ voice: "pocket_zh_xiaobei" });
});

it("preserves a narration start time and rejects negative or non-finite offsets", () => {
  expect(SpeechSettingsSchema.parse({ mode: "narration", startSeconds: 17 })).toMatchObject({
    startSeconds: 17,
  });
  for (const startSeconds of [-1, 301, Infinity, NaN])
    expect(SpeechSettingsSchema.safeParse({ mode: "narration", startSeconds }).success).toBe(false);
});
