import { normalizeRetiredSpeechSelections } from "../../shared/speech-compatibility";
import { activityItems } from "../../shared/activity-model";
import {
  displayActivityItems,
  latestRetryableActivityItem,
  type DisplayActivityItem,
} from "../../shared/activity-display";
import { activityBranchPage, type ActivityBranch } from "../../shared/activity-branches";
import { normalizeSubtitleFields } from "../../shared/subtitle-compatibility";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { EventEmitter } from "node:events";
import { dataRoot, safeMessage } from "../runtime/config.js";
import type { Run, Asset, AgentProgressEvent, PreparationStep } from "../../shared/contracts.js";
import { RoomStateSchema, applyRoomPatch, type RoomPatch, type RoomState } from "../../shared/room";
import {
  projectActivityEvent,
  type ProjectActivityPage,
  activityPageSize,
} from "../../shared/project-activity";
export class Store {
  private db: DatabaseSync;
  readonly bus = new EventEmitter();
  private activityTrees = new Map<
    string,
    {
      revision: number;
      phase: Run["phase"];
      events: AgentProgressEvent[];
      items: DisplayActivityItem[];
      retryItemId?: number;
    }
  >();
  constructor(filename = path.join(dataRoot, "jobs.sqlite")) {
    this.db = new DatabaseSync(filename);
    // The web development server and generation backend share this database.
    this.db.exec("PRAGMA busy_timeout=5000");
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,json TEXT NOT NULL); CREATE INDEX IF NOT EXISTS events_run ON events(run_id,id); CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,json TEXT NOT NULL);",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS room_state(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS room_library(asset_id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS room_wallpapers(asset_id TEXT PRIMARY KEY);",
    );
    this.bus.setMaxListeners(100);
  }
  room(): RoomState {
    const row = this.db.prepare("SELECT json FROM room_state WHERE id=1").get();
    return RoomStateSchema.parse(row ? normalizeSubtitleFields(JSON.parse(String(row.json))) : {});
  }
  saveRoom(state: RoomState) {
    this.db
      .prepare(
        "INSERT INTO room_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
      )
      .run(JSON.stringify(state));
  }
  /** Merge one tab's changes atomically, also across the dev server and backend processes. */
  patchRoom(patch: RoomPatch) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = applyRoomPatch(this.room(), patch);
      const state = RoomStateSchema.parse(result.state);
      this.saveRoom(state);
      this.db.exec("COMMIT");
      return { state, conflicts: result.conflicts };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  library(): Asset[] {
    return this.roomCollection("room_library");
  }
  addLibraryAsset(id: string) {
    this.db.prepare("INSERT OR IGNORE INTO room_library VALUES(?)").run(id);
  }
  wallpapers(): Asset[] {
    return this.roomCollection("room_wallpapers");
  }
  addWallpaper(id: string) {
    this.db.prepare("INSERT OR IGNORE INTO room_wallpapers VALUES(?)").run(id);
  }
  removeWallpaper(id: string) {
    this.db.prepare("DELETE FROM room_wallpapers WHERE asset_id=?").run(id);
  }
  private roomCollection(table: "room_library" | "room_wallpapers"): Asset[] {
    return this.db
      .prepare(
        `SELECT a.json FROM assets a JOIN ${table} l ON a.id=l.asset_id ORDER BY l.rowid DESC`,
      )
      .all()
      .map((row) => normalizeSubtitleFields(JSON.parse(String(row.json))));
  }
  assetByHash(sha256: string): Asset | undefined {
    const row = this.db
      .prepare("SELECT json FROM assets WHERE json_extract(json,'$.sha256')=? LIMIT 1")
      .get(sha256);
    return row ? normalizeSubtitleFields(JSON.parse(String(row.json))) : undefined;
  }
  removeLibraryAsset(id: string) {
    this.db.prepare("DELETE FROM room_library WHERE asset_id=?").run(id);
  }
  renameLibraryAsset(id: string, originalName: string) {
    const asset = this.getAsset(id);
    if (asset)
      this.db
        .prepare("UPDATE assets SET json=? WHERE id=?")
        .run(JSON.stringify({ ...asset, originalName }), id);
  }
  save(run: Run) {
    this.db
      .prepare("INSERT INTO runs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json")
      .run(run.id, JSON.stringify(run));
  }
  get(id: string): Run | undefined {
    const row = this.db.prepare("SELECT json FROM runs WHERE id=?").get(id);
    return row
      ? normalizeRetiredSpeechSelections(normalizeSubtitleFields(JSON.parse(String(row.json))))
      : undefined;
  }
  list(): Run[] {
    return this.db
      .prepare("SELECT json FROM runs ORDER BY rowid DESC LIMIT 50")
      .all()
      .map((x) =>
        normalizeRetiredSpeechSelections(normalizeSubtitleFields(JSON.parse(String(x.json)))),
      );
  }
  delete(id: string) {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM events WHERE run_id=?").run(id);
      this.db.prepare("DELETE FROM runs WHERE id=?").run(id);
      this.db.exec("COMMIT");
      for (const key of this.activityTrees.keys())
        if (key.startsWith(`${id}:`)) this.activityTrees.delete(key);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  allRuns(): Run[] {
    return this.db
      .prepare("SELECT json FROM runs ORDER BY rowid DESC")
      .all()
      .map((row) =>
        normalizeRetiredSpeechSelections(normalizeSubtitleFields(JSON.parse(String(row.json)))),
      );
  }
  allEvents(id: string): AgentProgressEvent[] {
    return this.db
      .prepare("SELECT id,json FROM events WHERE run_id=? ORDER BY id")
      .all(id)
      .map((row) => ({
        ...normalizeSubtitleFields(JSON.parse(String(row.json))),
        id: Number(row.id),
      }));
  }
  asset(a: Asset) {
    this.db.prepare("INSERT INTO assets VALUES(?,?)").run(a.id, JSON.stringify(a));
  }
  getAsset(id: string): Asset | undefined {
    const r = this.db.prepare("SELECT json FROM assets WHERE id=?").get(id);
    return r ? normalizeSubtitleFields(JSON.parse(String(r.json))) : undefined;
  }
  emit(runId: string, type: string, message: string, jobId?: string, data?: unknown) {
    const e = {
      runId,
      type,
      message: safeMessage(message),
      jobId,
      time: new Date().toISOString(),
      data,
    };
    const result = this.db
      .prepare("INSERT INTO events(run_id,json) VALUES(?,?)")
      .run(runId, JSON.stringify(e));
    const event = { ...e, id: Number(result.lastInsertRowid) };
    this.bus.emit(runId, event);
    return event;
  }
  lastEventId(runId: string) {
    const row = this.db.prepare("SELECT MAX(id) AS id FROM events WHERE run_id=?").get(runId);
    return Number(row?.id || 0);
  }
  events(id: string, after = 0): AgentProgressEvent[] {
    return this.db
      .prepare("SELECT id,json FROM events WHERE run_id=? AND id>? ORDER BY id LIMIT 500")
      .all(id, after)
      .map((x) => ({ ...normalizeSubtitleFields(JSON.parse(String(x.json))), id: Number(x.id) }));
  }
  activityPage(id: string, before?: number, after?: number, jobId?: string): ProjectActivityPage {
    const scope = jobId === undefined ? "" : " AND coalesce(json_extract(json,'$.jobId'),'')=?";
    const scopeParameters = jobId === undefined ? [] : [jobId];
    const latest =
      jobId === undefined
        ? this.lastEventId(id)
        : Number(
            this.db
              .prepare(`SELECT max(id) AS id FROM events WHERE run_id=?${scope}`)
              .get(id, ...scopeParameters)?.id || 0,
          );
    const forward = after !== undefined;
    const boundary = forward ? after : (before ?? latest + 1);
    const rows = this.db
      .prepare(
        `SELECT id,json FROM events WHERE run_id=?${scope} AND id ${forward ? ">" : "<"} ? AND id<=? ORDER BY id ${forward ? "ASC" : "DESC"} LIMIT ?`,
      )
      .all(id, ...scopeParameters, boundary, latest, activityPageSize);
    const raw = rows
      .map(
        (row) =>
          ({
            ...normalizeSubtitleFields(JSON.parse(String(row.json))),
            id: Number(row.id),
          }) as AgentProgressEvent,
      )
      .sort((a, b) => a.id - b.id);
    const first = raw[0]?.id ?? boundary;
    const last = raw.at(-1)?.id ?? (forward ? boundary : latest);
    const events = raw.flatMap((event) => {
      const compact = projectActivityEvent(event);
      return compact ? [compact] : [];
    });
    // Frame counters need their shot/phase boundary even when it precedes this window.
    const jobs = [...new Set(events.map((event) => event.jobId || ""))];
    for (const job of jobs) {
      const context = this.db
        .prepare(
          "SELECT id,json FROM events WHERE run_id=? AND id<? AND coalesce(json_extract(json,'$.jobId'),'')=? AND json_extract(json,'$.type')='phase' ORDER BY id DESC LIMIT 1",
        )
        .get(id, first, job);
      if (context) {
        const compact = projectActivityEvent({
          ...JSON.parse(String(context.json)),
          id: Number(context.id),
        });
        if (compact) events.unshift(compact);
      }
    }
    const needed = new Set(
      events
        .map((event) => (event.data as { activityScopeId?: string })?.activityScopeId)
        .filter((value): value is string => Boolean(value)),
    );
    const scopes = new Map<number, AgentProgressEvent>();
    for (let depth = 0; depth < 16 && needed.size && scopes.size < 128; depth++) {
      const ids = [...needed].slice(0, 128);
      needed.clear();
      const records = this.db
        .prepare(
          `SELECT id,json FROM events WHERE run_id=? AND json_extract(json,'$.type')='activity_scope' AND json_extract(json,'$.data.activityScope.id') IN (${ids.map(() => "?").join(",")}) ORDER BY id DESC`,
        )
        .all(id, ...ids);
      const found = new Set<string>();
      for (const row of records) {
        const event = { ...JSON.parse(String(row.json)), id: Number(row.id) } as AgentProgressEvent;
        const scope = (event.data as { activityScope: { id: string; parentId?: string } })
          .activityScope;
        if (found.has(scope.id) || scopes.size >= 128) continue;
        found.add(scope.id);
        scopes.set(event.id, projectActivityEvent(event)!);
        if (scope.parentId) needed.add(scope.parentId);
      }
    }
    const merged = new Map([...scopes.values(), ...events].map((event) => [event.id, event]));
    return {
      events: [...merged.values()].sort((a, b) => a.id - b.id),
      before: first,
      after: last,
      hasOlder: Boolean(
        this.db
          .prepare(`SELECT 1 FROM events WHERE run_id=?${scope} AND id<? LIMIT 1`)
          .get(id, ...scopeParameters, first),
      ),
      hasNewer: last < latest,
    };
  }
  activityChildren(run: Run, jobId: string, parents: number[] = [], offset = 0): ActivityBranch {
    const revision = this.lastEventId(run.id);
    const key = `${run.id}:${jobId}`;
    const phase = run.jobs.find((job) => job.id === jobId)?.phase || run.phase;
    let tree = this.activityTrees.get(key);
    if (!tree || tree.revision !== revision || tree.phase !== phase) {
      const events: AgentProgressEvent[] = tree ? [...tree.events] : [];
      let changed = !tree || tree.phase !== phase;
      for (const row of this.db
        .prepare(
          "SELECT id,json FROM events WHERE run_id=? AND coalesce(json_extract(json,'$.jobId'),'')=? AND id>? AND id<=? ORDER BY id",
        )
        .iterate(run.id, jobId, tree?.revision || 0, revision)) {
        const compact = projectActivityEvent({
          ...normalizeSubtitleFields(JSON.parse(String(row.json))),
          id: Number(row.id),
        });
        if (compact) {
          events.push(compact);
          changed = true;
        }
      }
      const interpreted = changed ? activityItems(events, false, run) : undefined;
      tree = {
        revision,
        phase,
        events,
        items: interpreted ? displayActivityItems(interpreted) : tree!.items,
        retryItemId: interpreted ? latestRetryableActivityItem(interpreted)?.id : tree?.retryItemId,
      };
      this.activityTrees.delete(key);
      this.activityTrees.set(key, tree);
      while (this.activityTrees.size > 4)
        this.activityTrees.delete(this.activityTrees.keys().next().value!);
    }
    return {
      ...activityBranchPage(tree.items, parents, offset),
      lastEventId: revision,
      retryItemId: tree.retryItemId,
    };
  }
  generationSessionId(runId: string, jobId: string, fallback?: string): string | undefined {
    const row = this.db
      .prepare(
        `SELECT json_extract(json,'$.data.sessionId') AS session FROM events WHERE run_id=? AND json_extract(json,'$.jobId')=? AND json_extract(json,'$.type')='session' AND (lower(json_extract(json,'$.data.purpose')) IN ('full video generation','preview video generation','full html generation','preview html generation') OR json_extract(json,'$.data.correctionTier')='main') ORDER BY id DESC LIMIT 1`,
      )
      .get(runId, jobId);
    if (typeof row?.session === "string" && row.session) return row.session;
    if (!fallback) return undefined;
    // Legacy fixtures and older records may have no event history. A known helper session is never a fallback.
    const recorded = this.db
      .prepare(
        "SELECT json_extract(json,'$.data.purpose') AS purpose, json_extract(json,'$.data.correctionTier') AS tier FROM events WHERE run_id=? AND json_extract(json,'$.data.sessionId')=? AND json_extract(json,'$.type')='session' ORDER BY id DESC LIMIT 1",
      )
      .get(runId, fallback);
    if (!recorded) return fallback;
    return recorded.tier === "main" ||
      [
        "full video generation",
        "preview video generation",
        "full html generation",
        "preview html generation",
      ].includes(String(recorded.purpose).toLowerCase())
      ? fallback
      : undefined;
  }
  recover() {
    for (const run of this.allRuns()) {
      let changed = false;
      for (const [step, checkpoint] of Object.entries(run.preparation?.checkpoints || {})) {
        if (checkpoint?.state === "running") {
          run.preparation!.checkpoints[step as PreparationStep] = {
            state: "interrupted",
            finishedAt: new Date().toISOString(),
            errorCode: "GENERATION_INTERRUPTED",
          };
          changed = true;
        }
      }
      for (const j of run.jobs) {
        if (run.inputWaits?.some((wait) => wait.jobId === j.id)) continue;
        if (["queued", "generating", "validating", "rendering"].includes(j.phase)) {
          j.phase = "interrupted";
          j.error = "Backend restarted. Retry to resume this project.";
          j.errorCode = "GENERATION_INTERRUPTED";
          changed = true;
        }
      }
      if (
        !run.inputWaits?.length &&
        !["ready", "failed", "cancelled", "interrupted"].includes(run.phase)
      ) {
        run.phase = "interrupted";
        changed = true;
      }
      if (changed) {
        this.save(run);
        this.emit(
          run.id,
          "interrupted",
          "Interrupted by backend restart; completed artifacts are retained.",
        );
      }
    }
  }
  close() {
    this.activityTrees.clear();
    this.db.close();
  }
}
