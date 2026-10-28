import { setTimeout as delay } from "node:timers/promises";
import { lock } from "proper-lockfile";

/** Cross-process lease; waiting and ownership follow the caller cancellation. */
export async function acquireFileLease(file: string, signal: AbortSignal) {
  const compromised = new AbortController();
  const leaseSignal = AbortSignal.any([signal, compromised.signal]);
  for (;;) {
    leaseSignal.throwIfAborted();
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
      await delay(250, undefined, { signal: leaseSignal });
      continue;
    }
    if (leaseSignal.aborted) {
      await unlock();
      leaseSignal.throwIfAborted();
    }
    let releasing: Promise<void> | undefined;
    return { signal: leaseSignal, release: () => (releasing ??= unlock()) };
  }
}
