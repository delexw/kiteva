import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { EventEmitter } from "node:events";
import { dataRoot, safeMessage } from "../runtime/config.js";
import type { Run, Asset, AgentProgressEvent, PreparationStep } from "../../shared/contracts.js";
import { RoomStateSchema, applyRoomPatch, type RoomPatch, type RoomState } from "../../shared/room";
export class Store {
  private db: DatabaseSync;
  readonly bus = new EventEmitter();
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
    return RoomStateSchema.parse(row ? JSON.parse(String(row.json)) : {});
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
      .map((row) => JSON.parse(String(row.json)));
  }
  assetByHash(sha256: string): Asset | undefined {
    const row = this.db
      .prepare("SELECT json FROM assets WHERE json_extract(json,'$.sha256')=? LIMIT 1")
      .get(sha256);
    return row ? JSON.parse(String(row.json)) : undefined;
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
    return row ? JSON.parse(String(row.json)) : undefined;
  }
  list(): Run[] {
    return this.db
      .prepare("SELECT json FROM runs ORDER BY rowid DESC LIMIT 50")
      .all()
      .map((x) => JSON.parse(String(x.json)));
  }
  delete(id: string) {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM events WHERE run_id=?").run(id);
      this.db.prepare("DELETE FROM runs WHERE id=?").run(id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  allRuns(): Run[] {
    return this.db
      .prepare("SELECT json FROM runs ORDER BY rowid DESC")
      .all()
      .map((row) => JSON.parse(String(row.json)));
  }
  allEvents(id: string): AgentProgressEvent[] {
    return this.db
      .prepare("SELECT id,json FROM events WHERE run_id=? ORDER BY id")
      .all(id)
      .map((row) => ({ ...JSON.parse(String(row.json)), id: Number(row.id) }));
  }
  asset(a: Asset) {
    this.db.prepare("INSERT INTO assets VALUES(?,?)").run(a.id, JSON.stringify(a));
  }
  getAsset(id: string): Asset | undefined {
    const r = this.db.prepare("SELECT json FROM assets WHERE id=?").get(id);
    return r ? JSON.parse(String(r.json)) : undefined;
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
      .map((x) => ({ ...JSON.parse(String(x.json)), id: Number(x.id) }));
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
    this.db.close();
  }
}
