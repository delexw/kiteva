import { open, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { acquireRecordingSlot } from "../../src/server/capture/recording-slot";

const [lockPath, sentinel] = process.argv.slice(2);
const slot = await acquireRecordingSlot(new AbortController().signal, lockPath);
try {
  // An overlapping owner would fail this exclusive filesystem operation.
  const handle = await open(sentinel, "wx");
  const started = Date.now();
  try {
    await delay(50);
  } finally {
    await handle.close();
    await unlink(sentinel);
  }
  console.log(JSON.stringify({ started, stopped: Date.now() }));
} finally {
  await slot.release();
}
