import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { lock } from "proper-lockfile";

// The recorder is a host resource, shared by separately spawned MCP servers and projects.
export const recordingToolTimeoutSeconds = 600;

export async function acquireRecordingSlot(
  signal: AbortSignal,
  file = process.env.KITEVA_RECORDING_LOCK_PATH ||
    path.join(os.tmpdir(), "kiteva-native-recording"),
) {
  const compromised = new AbortController();
  const recordingSignal = AbortSignal.any([signal, compromised.signal]);
  for (;;) {
    recordingSignal.throwIfAborted();
    let unlock: () => Promise<void>;
    try {
      unlock = await lock(file, {
        realpath: false,
        stale: 10000,
        update: 2000,
        retries: 0,
        onCompromised: (error) => compromised.abort(error),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ELOCKED") throw error;
      await delay(250, undefined, { signal: recordingSignal });
      continue;
    }
    if (recordingSignal.aborted) {
      await unlock();
      recordingSignal.throwIfAborted();
    }
    let releasing: Promise<void> | undefined;
    return { signal: recordingSignal, release: () => (releasing ??= unlock()) };
  }
}
