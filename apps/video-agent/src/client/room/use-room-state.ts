import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import {
  RoomStateSchema,
  copyRoomEntry,
  hasRoomChanges,
  rebaseRoom,
  roomChanges,
  withoutRoomEntries,
  type RoomPatch,
  type RoomState,
} from "../../shared/room";
import { api } from "../lib/api";

export type RoomSaveStatus = "loading" | "saved" | "saving" | "unsaved" | "failed";
const channelName = "kiteva-room";
const keepaliveLimit = 60_000;

/**
 * Room layout and drafts, saved per changed entry so several open tabs never overwrite each
 * other's unrelated work. Pending changes are flushed when the page is hidden or closed.
 */
export function useRoomState() {
  const [room, setRoomState] = useState<RoomState>(() => RoomStateSchema.parse({}));
  const [status, setStatus] = useState<RoomSaveStatus>("loading");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const client = useRef(crypto.randomUUID());
  const synced = useRef<RoomState>(undefined);
  const latest = useRef(room);
  const conflictRef = useRef<string[]>([]);
  const force = useRef<string[]>([]);
  const inflight = useRef<Promise<void>>(undefined);
  const again = useRef(false);
  const failing = useRef(false);
  const channel = useRef<BroadcastChannel>(undefined);
  const show = useCallback((next: RoomState) => {
    latest.current = next;
    setRoomState(next);
  }, []);
  const showConflicts = useCallback((next: string[]) => {
    conflictRef.current = next;
    setConflicts(next);
  }, []);
  const pending = useCallback((): RoomPatch | undefined => {
    if (!synced.current) return undefined;
    const changes = withoutRoomEntries(
      roomChanges(synced.current, latest.current),
      conflictRef.current.filter((entry) => !force.current.includes(entry)),
    );
    if (!hasRoomChanges(changes)) return undefined;
    return {
      ...changes,
      client: client.current,
      baseRevision: synced.current.revision,
      force: force.current,
    };
  }, []);
  const settle = useCallback(() => setStatus(pending() ? "unsaved" : "saved"), [pending]);
  const adopt = useCallback(
    (server: RoomState, base: RoomState, keep: string[]) => {
      const rebased = rebaseRoom(server, base, latest.current, keep);
      synced.current = server;
      show(rebased.state);
      showConflicts(rebased.conflicts);
      settle();
    },
    [show, showConflicts, settle],
  );
  const setRoom = useCallback(
    (action: SetStateAction<RoomState>) => {
      const next = typeof action === "function" ? action(latest.current) : action;
      show(next);
      if (synced.current) setStatus((value) => (value === "saving" ? value : "unsaved"));
    },
    [show],
  );
  const save = useCallback(async (): Promise<void> => {
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    const patch = pending();
    if (!patch) return settle();
    const sent = latest.current;
    setStatus("saving");
    inflight.current = api<{ state: RoomState; conflicts: string[] }>("/api/room", {
      method: "PATCH",
      body: JSON.stringify(patch),
    })
      .then((response) => {
        force.current = force.current.filter((entry) => !patch.force.includes(entry));
        const keep = conflictRef.current.filter((entry) => !patch.force.includes(entry));
        failing.current = false;
        setError("");
        adopt(RoomStateSchema.parse(response.state), sent, [...keep, ...response.conflicts]);
        channel.current?.postMessage(response.state.revision);
      })
      .catch((e: Error) => {
        failing.current = true;
        setError(e.message);
        setStatus("failed");
      })
      .finally(() => {
        inflight.current = undefined;
        if (again.current) {
          again.current = false;
          void save();
        }
      });
    return inflight.current;
  }, [pending, settle, adopt]);
  const refresh = useCallback(async () => {
    const base = synced.current;
    if (!base || inflight.current) return;
    try {
      const server = RoomStateSchema.parse(await api<RoomState>("/api/room"));
      if (server.revision > base.revision && synced.current === base && !inflight.current)
        adopt(server, base, conflictRef.current);
    } catch {
      // The next save or focus tries again; this tab keeps its copy meanwhile.
    }
  }, [adopt]);
  const flush = useCallback(() => {
    const patch = pending();
    if (!patch) return;
    const body = JSON.stringify(patch);
    void api<{ state: RoomState }>("/api/room", {
      method: "PATCH",
      body,
      keepalive: body.length < keepaliveLimit,
    })
      .then((response) => {
        const notify = new BroadcastChannel(channelName);
        notify.postMessage(response.state.revision);
        notify.close();
      })
      .catch(() => {});
  }, [pending]);
  useEffect(() => {
    let disposed = false;
    void api<RoomState>("/api/room")
      .then((state) => {
        if (disposed) return;
        synced.current = RoomStateSchema.parse(state);
        show(synced.current);
        setLoaded(true);
        setStatus("saved");
      })
      .catch((e: Error) => {
        setError(e.message);
        setStatus("failed");
      });
    return () => {
      disposed = true;
    };
  }, [show]);
  useEffect(() => {
    if (status !== "unsaved") return;
    const timer = setTimeout(() => void save(), 300);
    return () => clearTimeout(timer);
  }, [room, status, save]);
  useEffect(() => {
    channel.current = new BroadcastChannel(channelName);
    channel.current.onmessage = () => void refresh();
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
      else void refresh();
    };
    const focus = () => void refresh();
    const warn = (event: BeforeUnloadEvent) => {
      if (failing.current || conflictRef.current.length) event.preventDefault();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("focus", focus);
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      flush();
      channel.current?.close();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("focus", focus);
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [flush, refresh, pending]);
  const resolveConflict = useCallback(
    (entry: string, keepMine: boolean) => {
      if (keepMine) force.current = [...new Set([...force.current, entry])];
      else if (synced.current) show(copyRoomEntry(latest.current, synced.current, entry));
      showConflicts(conflictRef.current.filter((item) => item !== entry));
      settle();
    },
    [show, showConflicts, settle],
  );
  return { room, setRoom, loaded, status, error, conflicts, resolveConflict, retry: save };
}
