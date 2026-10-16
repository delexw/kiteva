import { expect, it } from "vitest";
import {
  activeSpeech,
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
