export type AudioStudioResult =
  | { kind: "audio_studio_result"; tool: string; result: unknown }
  | { kind: "error"; message: string };
