import { expect, it, vi } from "vitest";
import { normalizeSubtitleFields } from "../src/shared/subtitle-compatibility";
import { RequestSchema } from "../src/shared/contracts";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { RoomStateSchema } from "../src/shared/room";
import { Store } from "../src/server/jobs/store";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

it("migrates old request, translation and script-item fields without changing supplied text", () => {
  const original = {
    instructions: "Explain an example",
    lyrics: { mode: "provided", text: "The song has lyrics" },
    scriptItems: [
      {
        id: "line",
        startSeconds: 0,
        endSeconds: 3,
        text: "Keep my words",
        showLyrics: true,
        speech: { mode: "off" },
      },
    ],
    translations: { original: { lyrics: "Original" }, versions: { zh: { lyrics: "字幕" } } },
  };
  for (const schema of [RequestSchema, VideoRequestSchema]) {
    const request = schema.parse(original);
    expect(request).toMatchObject({
      subtitles: { mode: "provided", text: "The song has lyrics" },
      scriptItems: [{ showSubtitles: true }],
      translations: {
        original: { subtitles: "Original" },
        versions: { zh: { subtitles: "字幕" } },
      },
    });
    expect(request).not.toHaveProperty("lyrics");
  }
  expect(original.scriptItems[0].showLyrics).toBe(true);
});

it("preserves canonical settings over legacy values, including false and off", () => {
  expect(
    normalizeSubtitleFields({
      showLyrics: true,
      showSubtitles: false,
      lyrics: { mode: "provided", text: "old" },
      subtitles: { mode: "off" },
    }),
  ).toEqual({ showSubtitles: false, subtitles: { mode: "off" } });
  expect(
    normalizeSubtitleFields({
      speech: { source: "lyrics" },
      generatedLyrics: { text: "Hello", model: "example" },
    }),
  ).toEqual({
    speech: { source: "subtitles" },
    generatedSubtitles: { text: "Hello", model: "example" },
  });
});

it("restores legacy room drafts with the new fields", () => {
  const state = RoomStateSchema.parse({
    drafts: {
      assistant: { request: { lyrics: { mode: "write" }, scriptItems: [{ showLyrics: true }] } },
    },
  });
  expect(state.drafts.assistant.request).toMatchObject({
    subtitles: { mode: "write" },
    scriptItems: [{ showSubtitles: true }],
  });
});

it("normalizes saved projects on reading without rewriting their stored data", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "subtitle-migration-"));
  const file = path.join(root, "jobs.sqlite");
  const store = new Store(file);
  const db = new DatabaseSync(file);
  try {
    db.prepare("INSERT INTO runs VALUES(?,?)").run(
      "legacy",
      JSON.stringify({
        id: "legacy",
        request: { lyrics: { mode: "write" } },
        generatedLyrics: { text: "Hello", model: "example" },
      }),
    );
    expect(store.get("legacy")).toMatchObject({
      request: { subtitles: { mode: "write" } },
      generatedSubtitles: { text: "Hello" },
    });
    expect(store.list()[0]).not.toHaveProperty("generatedLyrics");
    expect(String(db.prepare("SELECT json FROM runs").get()!.json)).toContain('"lyrics"');
  } finally {
    db.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("loads narration profiles that previously sourced their text from lyrics", async () => {
  const { SpeechSettingsSchema } = await import("../src/shared/speech");
  const { roomDraftRequest } = await import("../src/client/room/onboarding");
  expect(SpeechSettingsSchema.parse({ mode: "narration", source: "lyrics" })).toMatchObject({
    source: "subtitles",
  });
  const restored = roomDraftRequest({
    request: { lyrics: { mode: "provided", text: "Saved words" } },
  });
  expect(restored).toMatchObject({ subtitles: { mode: "provided", text: "Saved words" } });
});

it("keeps the renamed client compatible with an older running backend", async () => {
  const { api } = await import("../src/client/lib/api");
  const fetch = vi.fn(async (_url, options) => {
    const payload = JSON.parse(options.body);
    expect(payload.scriptItems[0]).toMatchObject({ showSubtitles: true, showLyrics: true });
    expect(payload.speech.source).toBe("lyrics");
    return Response.json({ lyrics: { mode: "provided", text: "Old server response" } });
  });
  vi.stubGlobal("fetch", fetch);
  try {
    const result = await api("/api/runs", {
      method: "POST",
      body: JSON.stringify({
        scriptItems: [{ showSubtitles: true }],
        speech: { source: "subtitles" },
      }),
    });
    expect(result).toEqual({ subtitles: { mode: "provided", text: "Old server response" } });
  } finally {
    vi.unstubAllGlobals();
  }
});
