import { z } from "zod";
import { RoomAppearanceSchema, defaultRoomAppearance } from "./room-appearance";

export const RoomWindowSchema = z.object({
  id: z.string().min(1).max(120),
  x: z.number().finite().min(0).max(10000),
  y: z.number().finite().min(0).max(10000),
  width: z.number().finite().min(280).max(10000),
  height: z.number().finite().min(180).max(10000),
  minimized: z.boolean().default(false),
  maximized: z.boolean().default(false),
  closed: z.boolean().optional(),
  placement: z.enum(["auto", "user"]).optional(),
  path: z.string().startsWith("/").max(2000).optional(),
});
export const RoomLibraryAssetSchema = z.object({
  id: z.string().min(1).max(120),
  originalName: z.string().min(1).max(300),
  kind: z.string().max(200).default(""),
  bytes: z.number().finite().min(0),
  durationSeconds: z.number().finite().optional(),
  documentPages: z.number().finite().optional(),
});
// Each field falls back on its own, so one damaged field never discards the rest of a draft.
export const RoomDraftSchema = z.object({
  step: z.number().int().min(0).max(6).catch(0).default(0),
  request: z.record(z.string(), z.unknown()).catch({}).default({}),
  assets: z.array(RoomLibraryAssetSchema).max(20).catch([]).default([]),
});
export const roomProjectTabs = [
  "conversation",
  "previews",
  "full",
  "storyboard",
  "activity",
] as const;
export const RoomProjectViewSchema = z.object({
  tab: z.enum(roomProjectTabs).optional().catch(undefined),
  refine: z.string().max(6000).catch("").default(""),
  refineJobId: z.string().max(120).optional().catch(undefined),
});
const EntryRevisionSchema = z.object({ revision: z.number().int().min(0), client: z.string() });
export const RoomStateSchema = z.object({
  revision: z.number().int().min(0).default(0),
  entryRevisions: z.record(z.string(), EntryRevisionSchema).default({}),
  windows: z.array(RoomWindowSchema).max(200).default([]),
  drafts: z.record(z.string(), RoomDraftSchema).default({}),
  questionDrafts: z.record(z.string(), z.string().max(2000)).default({}),
  views: z.record(z.string(), RoomProjectViewSchema).default({}),
  dismissedQuestions: z.array(z.string()).max(1000).default([]),
  appearance: RoomAppearanceSchema.catch(defaultRoomAppearance).default(defaultRoomAppearance),
});
export const RoomPatchSchema = z.object({
  client: z.string().min(1).max(80),
  baseRevision: z.number().int().min(0),
  windows: z.record(z.string(), RoomWindowSchema.nullable()).default({}),
  drafts: z.record(z.string(), RoomDraftSchema.nullable()).default({}),
  questionDrafts: z.record(z.string(), z.string().max(2000).nullable()).default({}),
  views: z.record(z.string(), RoomProjectViewSchema.nullable()).default({}),
  dismissedQuestions: z.array(z.string()).max(1000).default([]),
  appearance: RoomAppearanceSchema.optional(),
  force: z.array(z.string()).max(200).default([]),
});
export type RoomState = z.infer<typeof RoomStateSchema>;
export type RoomWindowState = z.infer<typeof RoomWindowSchema>;
export type RoomDraft = z.infer<typeof RoomDraftSchema>;
export type RoomProjectView = z.infer<typeof RoomProjectViewSchema>;
export type RoomLibraryAsset = z.infer<typeof RoomLibraryAssetSchema>;
export type RoomPatch = z.infer<typeof RoomPatchSchema>;
export type RoomChanges = Pick<
  RoomPatch,
  "windows" | "drafts" | "questionDrafts" | "views" | "dismissedQuestions" | "appearance"
>;

/** Collections holding user-typed input; concurrent edits to one entry are reported, not overwritten. */
const inputCollections = ["drafts", "questionDrafts", "views"] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const roomEntryLabel = (entry: string) => entry.slice(entry.indexOf(":") + 1);

export function roomChanges(base: RoomState, next: RoomState): RoomChanges {
  const changes: RoomChanges = {
    windows: {},
    drafts: {},
    questionDrafts: {},
    views: {},
    dismissedQuestions: next.dismissedQuestions.filter(
      (id) => !base.dismissedQuestions.includes(id),
    ),
    ...(same(base.appearance, next.appearance) ? {} : { appearance: next.appearance }),
  };
  const windows = new Map(base.windows.map((window) => [window.id, window]));
  for (const window of next.windows)
    if (!same(windows.get(window.id), window)) changes.windows[window.id] = window;
  for (const window of base.windows)
    if (!next.windows.some((item) => item.id === window.id)) changes.windows[window.id] = null;
  for (const collection of inputCollections) {
    const before = base[collection] as Record<string, unknown>;
    const after = next[collection] as Record<string, unknown>;
    const target = changes[collection] as Record<string, unknown>;
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
      if (!same(before[key], after[key])) target[key] = after[key] ?? null;
  }
  return changes;
}
export function hasRoomChanges(changes: RoomChanges) {
  return (
    changes.dismissedQuestions.length > 0 ||
    changes.appearance !== undefined ||
    [changes.windows, ...inputCollections.map((collection) => changes[collection])].some(
      (record) => Object.keys(record).length > 0,
    )
  );
}
export function changedRoomEntries(changes: RoomChanges) {
  return inputCollections.flatMap((collection) =>
    Object.keys(changes[collection]).map((key) => `${collection}:${key}`),
  );
}
export function withoutRoomEntries(changes: RoomChanges, entries: readonly string[]): RoomChanges {
  const result = structuredClone(changes);
  for (const entry of entries) {
    const collection = entry.slice(0, entry.indexOf(":")) as (typeof inputCollections)[number];
    if (inputCollections.includes(collection))
      delete (result[collection] as Record<string, unknown>)[roomEntryLabel(entry)];
  }
  return result;
}
export function mergeRoomChanges(state: RoomState, changes: RoomChanges): RoomState {
  const next = structuredClone(state);
  for (const [id, window] of Object.entries(changes.windows)) {
    const index = next.windows.findIndex((item) => item.id === id);
    if (!window) {
      if (index >= 0) next.windows.splice(index, 1);
    } else if (index >= 0) next.windows[index] = window;
    else next.windows.push(window);
  }
  for (const collection of inputCollections) {
    const target = next[collection] as Record<string, unknown>;
    for (const [key, value] of Object.entries(changes[collection] as Record<string, unknown>))
      if (value === null) delete target[key];
      else target[key] = value;
  }
  if (changes.appearance) next.appearance = changes.appearance;
  next.dismissedQuestions = [
    ...new Set([...next.dismissedQuestions, ...changes.dismissedQuestions]),
  ].slice(-1000);
  return next;
}
/** Server-side merge: skips input entries another tab changed after this tab last synced. */
export function applyRoomPatch(state: RoomState, patch: RoomPatch) {
  const revision = state.revision + 1;
  const conflicts = changedRoomEntries(patch).filter((entry) => {
    const last = state.entryRevisions[entry];
    const collection = entry.slice(0, entry.indexOf(":")) as (typeof inputCollections)[number];
    const key = roomEntryLabel(entry);
    return (
      last &&
      last.client !== patch.client &&
      last.revision > patch.baseRevision &&
      !patch.force.includes(entry) &&
      !same((state[collection] as Record<string, unknown>)[key], patch[collection][key])
    );
  });
  const accepted = withoutRoomEntries(patch, conflicts);
  const next = mergeRoomChanges(state, accepted);
  next.revision = revision;
  for (const entry of changedRoomEntries(accepted))
    next.entryRevisions[entry] = { revision, client: patch.client };
  return { state: next, conflicts };
}
/**
 * Lay this tab's unsaved edits (since `base`) over a newer server state. Entries both sides
 * changed differently are kept as this tab's version and reported as conflicts.
 */
export function rebaseRoom(
  server: RoomState,
  base: RoomState,
  local: RoomState,
  keep: readonly string[] = [],
) {
  const remote = changedRoomEntries(roomChanges(base, server));
  const changes = roomChanges(base, local);
  const conflicts = changedRoomEntries(changes).filter((entry) => {
    if (!remote.includes(entry)) return false;
    const collection = entry.slice(0, entry.indexOf(":")) as (typeof inputCollections)[number];
    const key = roomEntryLabel(entry);
    return !same(
      (server[collection] as Record<string, unknown>)[key],
      (local[collection] as Record<string, unknown>)[key],
    );
  });
  let merged = mergeRoomChanges(server, changes);
  for (const entry of keep) merged = copyRoomEntry(merged, local, entry);
  return { state: merged, conflicts: [...new Set([...keep, ...conflicts])] };
}
/** Return `target` with one input entry replaced by (or removed to match) `source`. */
export function copyRoomEntry(target: RoomState, source: RoomState, entry: string): RoomState {
  const collection = entry.slice(0, entry.indexOf(":")) as (typeof inputCollections)[number];
  if (!inputCollections.includes(collection)) return target;
  const key = roomEntryLabel(entry);
  const records = { ...(target[collection] as Record<string, unknown>) };
  const value = (source[collection] as Record<string, unknown>)[key];
  if (value === undefined) delete records[key];
  else records[key] = value;
  return { ...target, [collection]: records };
}
