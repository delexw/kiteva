import os from "node:os";
import path from "node:path";
import { acquireFileLease } from "../runtime/file-lease";

// The recorder is a host resource, shared by separately spawned MCP servers and projects.
export const recordingToolTimeoutSeconds = 600;

export function acquireRecordingSlot(
  signal: AbortSignal,
  file = process.env.KITEVA_RECORDING_LOCK_PATH ||
    path.join(os.tmpdir(), "kiteva-native-recording"),
) {
  return acquireFileLease(file, signal);
}
