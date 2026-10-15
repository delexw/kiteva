import path from "node:path";
import { command } from "../runtime/process.js";

export type VideoProbe = {
  streams: Array<{
    codec_type: string;
    width: number;
    height: number;
    avg_frame_rate: string;
    codec_name: string;
    nb_read_frames?: string;
    channels?: number;
  }>;
  format: { duration: string };
};
export async function probeVideo(file: string, signal: AbortSignal) {
  const result = JSON.parse(
    await command(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
      path.dirname(file),
      signal,
    ),
  );
  return result as VideoProbe;
}
