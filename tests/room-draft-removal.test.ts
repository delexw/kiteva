import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeRoomEditDraft, roomDraftRequest } from "../src/client/room/onboarding";
import { RoomStateSchema } from "../src/shared/room";
import { Store } from "../src/server/jobs/store";
import { RequestSchema, type Run } from "../src/shared/contracts";

it("removes only the selected edit draft without mutating other drafts", () => {
  const drafts = RoomStateSchema.parse({
    drafts: {
      new: { request: { instructions: "New concept" } },
      "edit:one": {
        request: { instructions: "An edited brief" },
        assets: [{ id: "material", originalName: "reference.png", bytes: 20 }],
      },
      "edit:two": { request: { instructions: "Another edit" } },
    },
  }).drafts;
  const next = removeRoomEditDraft(drafts, "edit:one");
  expect(next["edit:one"]).toBeUndefined();
  expect(drafts["edit:one"]).toBeDefined();
  expect(next.new).toBe(drafts.new);
  expect(next["edit:two"]).toBe(drafts["edit:two"]);
  expect(removeRoomEditDraft(drafts, "new")).toBe(drafts);
  expect(removeRoomEditDraft(drafts, "edit:missing")).toBe(drafts);
});

it("persists draft removal across reload while preserving the project and video references", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "room-draft-removal-"));
  const filename = path.join(folder, "room.sqlite");
  let store = new Store(filename);
  try {
    const project: Run = {
      id: "one",
      phase: "ready",
      createdAt: "2026-01-01",
      request: RequestSchema.parse({ instructions: "A project" }),
      candidates: [],
      jobs: [
        {
          id: "film",
          runId: "one",
          candidateId: "direction",
          kind: "full",
          phase: "ready",
          duration: 90,
          model: "example",
          workspace: "/tmp/example",
          video: "renders/full.mp4",
        },
      ],
    };
    store.save(project);
    const state = RoomStateSchema.parse({
      drafts: {
        "edit:one": { request: { instructions: "Unsaved edit" } },
        new: { request: { instructions: "Keep new idea" } },
      },
    });
    store.saveRoom({ ...state, drafts: removeRoomEditDraft(state.drafts, "edit:one") });
    store.close();
    store = new Store(filename);
    expect(store.room().drafts["edit:one"]).toBeUndefined();
    expect(store.room().drafts.new.request.instructions).toBe("Keep new idea");
    expect(store.get("one")).toEqual(project);
  } finally {
    store.close();
    await rm(folder, { recursive: true, force: true });
  }
});

it.each(["qwen3-tts", "qwen3-tts-base"])(
  "opens a saved %s draft using the shared speech migration",
  (engine) => {
    const draft = {
      step: 0,
      assets: [],
      request: {
        instructions: "Keep this complete original idea",
        urls: ["https://example.com"],
        scriptItems: [
          {
            id: "intro",
            startSeconds: 0,
            endSeconds: 8,
            text: "Original narration",
            showSubtitles: true,
            speech: {
              mode: "narration",
              engine,
              voice: "retired-voice",
              language: "en",
              speed: 1,
              volume: 0.8,
            },
          },
        ],
      },
    };
    const before = JSON.stringify(draft);
    for (const saved of [
      draft,
      RoomStateSchema.parse({ drafts: { "edit:example": draft } }).drafts["edit:example"],
    ]) {
      const request = roomDraftRequest(saved);
      if (request.outputType !== "video") throw Error("Expected a video draft");
      expect(request.instructions).toBe(draft.request.instructions);
      expect(request.urls).toEqual(draft.request.urls);
      expect(request.scriptItems?.[0]).toMatchObject({
        text: "Original narration",
        startSeconds: 0,
        endSeconds: 8,
        speech: { engine: "ming-tts", voice: "ming_original_female", speed: 1, volume: 0.8 },
      });
    }
    expect(JSON.stringify(draft)).toBe(before);
  },
);
