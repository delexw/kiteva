import { expect, it } from "vitest";
import {
  RoomStateSchema,
  applyRoomPatch,
  copyRoomEntry,
  rebaseRoom,
  roomChanges,
  type RoomState,
} from "../src/shared/room";
import { roomDraftRequest } from "../src/client/room/onboarding";

const window = (id: string, x = 0) => ({
  id,
  x,
  y: 0,
  width: 400,
  height: 480,
  minimized: false,
  maximized: false,
});
const room = (change: Partial<RoomState> = {}) => RoomStateSchema.parse({ ...change });
const patch = (base: RoomState, next: RoomState, client: string) => ({
  ...roomChanges(base, next),
  client,
  baseRevision: base.revision,
  force: [] as string[],
});

it("merges separate tabs' changes instead of overwriting the whole room", () => {
  const base = room({ windows: [window("assistant")] });
  const tabA = {
    ...base,
    drafts: { new: { step: 2, request: { instructions: "Kite" }, assets: [] } },
  };
  const tabB = { ...base, windows: [window("assistant", 300), window("library")] };
  const first = applyRoomPatch(base, patch(base, tabA, "a"));
  const second = applyRoomPatch(first.state, patch(base, tabB, "b"));
  expect(second.conflicts).toEqual([]);
  expect(second.state.drafts.new.step).toBe(2);
  expect(second.state.windows.map((item) => [item.id, item.x])).toEqual([
    ["assistant", 300],
    ["library", 0],
  ]);
  expect(second.state.revision).toBe(2);
});
it("reports a draft both tabs edited, keeps the saved one, and accepts an explicit keep", () => {
  const base = room();
  const draft = (text: string) => ({ step: 1, request: { instructions: text }, assets: [] });
  const saved = applyRoomPatch(base, patch(base, { ...base, drafts: { new: draft("A") } }, "a"));
  const stale = patch(base, { ...base, drafts: { new: draft("B") } }, "b");
  const rejected = applyRoomPatch(saved.state, stale);
  expect(rejected.conflicts).toEqual(["drafts:new"]);
  expect(rejected.state.drafts.new.request.instructions).toBe("A");
  const sameTab = applyRoomPatch(saved.state, { ...stale, client: "a" });
  expect(sameTab.conflicts).toEqual([]);
  const forced = applyRoomPatch(saved.state, { ...stale, force: ["drafts:new"] });
  expect(forced.state.drafts.new.request.instructions).toBe("B");
});
it("rebases this tab's unsaved edits over a newer room and flags shared edits", () => {
  const base = room({ questionDrafts: { "p:q": "start" } });
  const server = {
    ...base,
    revision: 3,
    questionDrafts: { "p:q": "theirs" },
    views: { p: { refine: "x" } },
  };
  const local = { ...base, questionDrafts: { "p:q": "mine" }, windows: [window("library")] };
  const rebased = rebaseRoom(server, base, local);
  expect(rebased.conflicts).toEqual(["questionDrafts:p:q"]);
  expect(rebased.state.questionDrafts["p:q"]).toBe("mine");
  expect(rebased.state.views.p.refine).toBe("x");
  expect(rebased.state.windows).toHaveLength(1);
  expect(copyRoomEntry(rebased.state, server, "questionDrafts:p:q").questionDrafts["p:q"]).toBe(
    "theirs",
  );
});
it("reads partial and older drafts without losing what was typed", () => {
  const state = RoomStateSchema.parse({
    drafts: { new: { step: 1, request: { instructions: "Paper kite" } }, broken: { step: 99 } },
  });
  expect(state.drafts.new.assets).toEqual([]);
  expect(state.drafts.broken).toEqual({
    step: 0,
    stepLayout: "separate-speech",
    request: {},
    assets: [],
  });
  const request = roomDraftRequest(state.drafts.new);
  expect(request).toMatchObject({
    instructions: "Paper kite",
    urls: [],
    assetIds: [],
    candidateCount: 5,
  });
  const typing = roomDraftRequest({
    step: 3,
    request: {
      instructions: "Hi",
      urls: ["https://exa", 4],
      outputType: "page",
      candidateCount: "x",
    },
    assets: [],
  });
  expect(typing).toMatchObject({ instructions: "Hi", urls: ["https://exa"], outputType: "page" });
  expect(roomDraftRequest({ request: { outputType: "page", duration: 30 } }).outputType).toBe(
    "page",
  );
});
