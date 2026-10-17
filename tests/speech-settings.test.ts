import { expect, it } from "vitest";
import {
  activeSpeech,
  pocketLanguages,
  pocketVoices,
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
    request.outputType === "video" && request.speech,
  );
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

it("exposes every official Pocket language and all 27 presets without an English-only subset", () => {
  expect(pocketLanguages.map((language) => language.model)).toEqual([
    "english",
    "french",
    "german",
    "portuguese",
    "italian",
    "spanish",
    "dutch",
  ]);
  expect(pocketVoices).toHaveLength(27);
  expect(new Set(pocketVoices.map((voice) => voice.id)).size).toBe(27);
  expect(pocketVoices.filter((voice) => voice.language === "en")).toHaveLength(21);
  for (const voice of pocketVoices) {
    expect(
      SpeechSettingsSchema.safeParse({ mode: "narration", engine: "pocket-tts", voice: voice.id })
        .success,
    ).toBe(true);
    expect(pocketLanguageForVoice(voice.id)?.id).toBe(voice.language);
    for (const language of pocketLanguages) {
      expect(
        SpeechSettingsSchema.safeParse({
          mode: "narration",
          engine: "pocket-tts",
          voice: voice.id,
          language: language.id,
        }).success,
      ).toBe(true);
      expect(pocketLanguageForVoice(voice.id, language.id)?.model).toBe(language.model);
    }
  }
  expect(pocketLanguageForVoice("unknown")).toBeUndefined();
});
