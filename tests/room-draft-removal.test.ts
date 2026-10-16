import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeRoomEditDraft } from "../src/client/room/onboarding";
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
